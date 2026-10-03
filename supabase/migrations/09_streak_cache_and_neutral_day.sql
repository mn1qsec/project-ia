-- 09_streak_cache_and_neutral_day.sql
-- Correções e melhorias de cache (Job Diário) e segurança.

-- -----------------------------------------------------------------------------
-- 1. Bloqueio de Edição Direta pelo Usuário (Trigger)
-- -----------------------------------------------------------------------------
-- Previne que usuários alterem diretamente suas colunas de conquistas/escudos
CREATE OR REPLACE FUNCTION public._prevent_profile_tampering()
RETURNS TRIGGER AS $$
BEGIN
  -- Se for uma chamada normal do frontend (role = authenticated)
  IF current_setting('role', true) = 'authenticated' THEN
    -- Reseta os valores para o que estava no banco antes, anulando qualquer edição
    NEW.current_streak = OLD.current_streak;
    NEW.longest_streak = OLD.longest_streak;
    NEW.shields = OLD.shields;
    NEW.shields_refilled_month = OLD.shields_refilled_month;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_profile_tampering ON public.profiles;
CREATE TRIGGER trg_prevent_profile_tampering
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public._prevent_profile_tampering();

-- -----------------------------------------------------------------------------
-- 2. Refatoração: Função base que sincroniza o state (pode ser chamada para qualquer user)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sync_user_flame_state(p_user_id UUID)
RETURNS TABLE (
  days           INT,
  at_risk        BOOLEAN,
  recoverable_day DATE,
  shields        INT
) AS $$
DECLARE
  v_today      DATE := (timezone('America/Sao_Paulo', now()))::date;
  v_yesterday  DATE := v_today - 1;
  v_d2         DATE := v_today - 2;
  v_streak     INT;
  v_longest    INT;
  v_shields    INT;
  v_status_d1  TEXT;
  v_status_d2  TEXT;
  v_at_risk    BOOLEAN := false;
  v_rec_day    DATE    := NULL;
BEGIN
  -- Recarga lazy de escudos
  v_shields := public._refresh_shields(p_user_id);

  -- Streak atual (já considera protected/neutral)
  SELECT cs.current_streak, cs.longest_streak
  INTO v_streak, v_longest
  FROM public._calc_streak(p_user_id) cs;

  v_status_d1 := public.day_status(p_user_id, v_yesterday);
  v_status_d2 := public.day_status(p_user_id, v_d2);

  -- Condições para at_risk = true
  IF v_status_d1 = 'missed' AND v_status_d2 != 'protected' THEN
    IF v_status_d2 IN ('completed', 'protected', 'neutral') THEN
      IF EXISTS (
        SELECT 1 FROM public.daily_checkins
        WHERE user_id = p_user_id AND checkin_date <= v_d2
        LIMIT 1
      ) OR v_status_d2 = 'protected' THEN
        v_at_risk   := true;
        v_rec_day   := v_yesterday;
      END IF;
    END IF;
  END IF;

  -- MÁGICA DO CACHE: 
  -- Se o usuário está em risco (D-1 missed, mas ainda pode resgatar hoje),
  -- não podemos zerar o streak que aparece no ranking.
  -- Precisamos encontrar qual era o streak até D-2.
  -- _calc_streak retornou 0 (porque quebrou em D-1). Vamos recalcular do D-2 para trás.
  IF v_at_risk THEN
    DECLARE
      v_temp_streak INT := 0;
      v_temp_date   DATE := v_d2;
      v_temp_status TEXT;
      v_i           INT := 0;
    BEGIN
      WHILE v_i < 1100 LOOP
        v_temp_status := public.day_status(p_user_id, v_temp_date);
        CASE v_temp_status
          WHEN 'completed', 'protected' THEN
            IF v_temp_status = 'completed' THEN v_temp_streak := v_temp_streak + 1; END IF;
          WHEN 'neutral', 'frozen' THEN NULL;
          WHEN 'missed' THEN EXIT;
          ELSE EXIT;
        END CASE;
        v_temp_date := v_temp_date - 1;
        v_i := v_i + 1;
      END LOOP;
      v_streak := v_temp_streak;
    END;
  END IF;

  -- Salva streak em profiles (mantém coluna sincronizada para o ranking)
  -- Como o usuário logado que edita não tem permissão via role authenticated,
  -- precisamos garantir que a atualização aqui funcione. A trigger não afeta se for o service_role
  -- Mas como é security definer, executamos como postgres (bypass na trigger se necessário, 
  -- mas a trigger checa 'authenticated', e funções security definer default rodam como o owner 
  -- (normalmente postgres). Então a trigger ignorará e fará o update.
  UPDATE public.profiles
  SET current_streak = v_streak,
      longest_streak = GREATEST(longest_streak, v_longest)
  WHERE id = p_user_id;

  RETURN QUERY SELECT v_streak, v_at_risk, v_rec_day, v_shields;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Atualiza flame_state para usar o helper
CREATE OR REPLACE FUNCTION public.flame_state()
RETURNS TABLE (
  days           INT,
  at_risk        BOOLEAN,
  recoverable_day DATE,
  shields        INT
) AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT 0, false, NULL::DATE, 0;
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public._sync_user_flame_state(auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- -----------------------------------------------------------------------------
-- 3. Atualizar do_checkin e use_shield para sincronizar o cache NA HORA
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.do_checkin()
RETURNS VOID AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_today        DATE := (timezone('America/Sao_Paulo', now()))::date;
  v_dow          INT  := EXTRACT(DOW FROM v_today)::INT;
  v_applicable   INT;
  v_done         INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT COUNT(*) INTO v_applicable
  FROM public.goals g
  WHERE g.user_id = v_user_id
    AND EXISTS (
      SELECT 1 FROM public.goal_versions gv
      WHERE gv.goal_id = g.id AND gv.valid_from <= v_today AND gv.is_active = true AND v_dow = ANY(gv.days_of_week)
      ORDER BY gv.valid_from DESC LIMIT 1
    );

  IF v_applicable = 0 THEN
    RAISE EXCEPTION 'Nenhuma meta se aplica a hoje. Aproveite o dia de descanso!';
  END IF;

  SELECT COUNT(*) INTO v_done
  FROM public.goal_completions gc
  JOIN public.goals g ON g.id = gc.goal_id
  WHERE gc.user_id = v_user_id AND gc.date = v_today
    AND EXISTS (
      SELECT 1 FROM public.goal_versions gv
      WHERE gv.goal_id = g.id AND gv.valid_from <= v_today AND gv.is_active = true AND v_dow = ANY(gv.days_of_week)
      ORDER BY gv.valid_from DESC LIMIT 1
    );

  IF v_done < v_applicable THEN
    RAISE EXCEPTION 'Faltam % meta(s) para completar hoje.', (v_applicable - v_done);
  END IF;

  INSERT INTO public.daily_checkins (user_id, checkin_date)
  VALUES (v_user_id, v_today)
  ON CONFLICT (user_id, checkin_date) DO NOTHING;
  
  -- Sincroniza o streak logo após o check-in
  PERFORM public._sync_user_flame_state(v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION public.use_shield()
RETURNS VOID AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_today     DATE := (timezone('America/Sao_Paulo', now()))::date;
  v_yesterday DATE := v_today - 1;
  v_d2        DATE := v_today - 2;
  v_shields   INT;
  v_status_d1 TEXT;
  v_status_d2 TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  v_shields := public._refresh_shields(v_user_id);

  IF v_shields <= 0 THEN RAISE EXCEPTION 'Sem escudos disponíveis. O próximo escudo chega no início do próximo mês.'; END IF;

  v_status_d1 := public.day_status(v_user_id, v_yesterday);
  IF v_status_d1 != 'missed' THEN RAISE EXCEPTION 'O escudo só pode ser usado em um dia perdido (D-1 está: %)', v_status_d1; END IF;

  v_status_d2 := public.day_status(v_user_id, v_d2);
  IF v_status_d2 = 'protected' THEN RAISE EXCEPTION 'Não é possível proteger dois dias consecutivos.'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.daily_checkins WHERE user_id = v_user_id AND checkin_date <= v_d2 LIMIT 1) AND v_status_d2 != 'protected' THEN
    RAISE EXCEPTION 'Não há streak para proteger.';
  END IF;

  UPDATE public.profiles SET shields = shields - 1 WHERE id = v_user_id AND shields > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sem escudos disponíveis (race condition).'; END IF;

  INSERT INTO public.protected_days (user_id, day) VALUES (v_user_id, v_yesterday) ON CONFLICT (user_id, day) DO NOTHING;
  
  -- Sincroniza o streak logo após usar o escudo
  PERFORM public._sync_user_flame_state(v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- -----------------------------------------------------------------------------
-- 4. Job pg_cron para atualizar o cache de todos de madrugada
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public._job_update_streaks()
RETURNS VOID AS $$
DECLARE
  r RECORD;
BEGIN
  -- Apenas itera por perfis que tinham streak ativo
  FOR r IN 
    SELECT id FROM public.profiles WHERE current_streak > 0
  LOOP
    PERFORM public._sync_user_flame_state(r.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Agenda para 00:05. No Supabase, o cron server usa UTC. 
-- 00:05 America/Sao_Paulo (UTC-3) => 03:05 UTC.
SELECT cron.schedule(
  'update-streaks-daily',
  '5 3 * * *',
  'SELECT public._job_update_streaks();'
);

-- Revoga acessos diretos
REVOKE EXECUTE ON FUNCTION public._prevent_profile_tampering() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._sync_user_flame_state(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._job_update_streaks() FROM PUBLIC, anon, authenticated;
