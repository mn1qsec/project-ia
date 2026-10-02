-- 02_functions_and_triggers.sql
-- Gym Streak - Todas as funções server-side + trigger de signup

-------------------------------------------------------
-- TRIGGER: criar profile automaticamente no signup
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, username)
    VALUES (
      new.id,
      new.email,
      COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
    );
  EXCEPTION WHEN OTHERS THEN
    -- Ignora erros para não travar a criação do usuário
  END;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-------------------------------------------------------
-- FUNCTION: complete_goal(goal_id)
-- Marca meta ativa do usuário como cumprida HOJE (SP).
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_goal(p_goal_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today   DATE := (timezone('America/Sao_Paulo'::text, now()))::date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Verifica se a meta pertence ao usuário e está ativa
  IF NOT EXISTS (
    SELECT 1 FROM goals
    WHERE id = p_goal_id AND user_id = v_user_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Meta não encontrada ou inativa';
  END IF;

  INSERT INTO goal_completions (user_id, goal_id, date)
  VALUES (v_user_id, p_goal_id, v_today)
  ON CONFLICT (goal_id, date) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-------------------------------------------------------
-- FUNCTION: do_checkin()
-- Só passa se TODAS as metas ativas estão cumpridas hoje.
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.do_checkin()
RETURNS VOID AS $$
DECLARE
  v_user_id       UUID := auth.uid();
  v_today         DATE := (timezone('America/Sao_Paulo'::text, now()))::date;
  v_active_count  INT;
  v_done_count    INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT count(*) INTO v_active_count
  FROM goals WHERE user_id = v_user_id AND is_active = true;

  IF v_active_count = 0 THEN
    RAISE EXCEPTION 'Você não tem metas ativas. Crie pelo menos uma meta primeiro.';
  END IF;

  -- Conta quantas metas ativas foram completadas hoje
  SELECT count(*) INTO v_done_count
  FROM goal_completions gc
  JOIN goals g ON g.id = gc.goal_id
  WHERE gc.user_id = v_user_id
    AND gc.date = v_today
    AND g.is_active = true;

  IF v_done_count < v_active_count THEN
    RAISE EXCEPTION 'Faltam % meta(s) para completar hoje.', (v_active_count - v_done_count);
  END IF;

  INSERT INTO daily_checkins (user_id, date)
  VALUES (v_user_id, v_today)
  ON CONFLICT (user_id, date) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-------------------------------------------------------
-- HELPER: _calc_streak(p_user_id)
-- Calcula streak para qualquer user_id (usado internamente).
-- Streak atual = dias consecutivos de check-in terminando
-- em hoje ou ontem (hoje pendente não zera).
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public._calc_streak(p_user_id UUID)
RETURNS TABLE (current_streak INT, longest_streak INT) AS $$
DECLARE
  v_today    DATE := (timezone('America/Sao_Paulo'::text, now()))::date;
  v_current  INT := 0;
  v_longest  INT := 0;
  v_temp     INT := 0;
  v_prev     DATE := NULL;
  rec        RECORD;
BEGIN
  -- Percorre todos os check-ins do mais antigo ao mais recente
  FOR rec IN
    SELECT dc.date AS d
    FROM daily_checkins dc
    WHERE dc.user_id = p_user_id
    ORDER BY dc.date ASC
  LOOP
    IF v_prev IS NULL OR rec.d = v_prev + 1 THEN
      v_temp := v_temp + 1;
    ELSE
      v_temp := 1;
    END IF;

    IF v_temp > v_longest THEN
      v_longest := v_temp;
    END IF;

    v_prev := rec.d;
  END LOOP;

  -- Current streak: só conta se a sequência termina em hoje ou ontem
  IF v_prev = v_today OR v_prev = v_today - 1 THEN
    v_current := v_temp;
  ELSE
    v_current := 0;
  END IF;

  RETURN QUERY SELECT v_current, v_longest;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-------------------------------------------------------
-- FUNCTION: get_streak()
-- Wrapper público que usa auth.uid().
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_streak()
RETURNS TABLE (current_streak INT, longest_streak INT) AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM _calc_streak(auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-------------------------------------------------------
-- FUNCTION: create_group(name)
-- Gera invite_code único de 6 caracteres e adiciona o criador.
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_group(p_name TEXT)
RETURNS UUID AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_code     TEXT;
  v_group_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Gera código único (tenta até não colidir)
  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM groups WHERE invite_code = v_code);
  END LOOP;

  INSERT INTO groups (name, invite_code, owner_id)
  VALUES (p_name, v_code, v_user_id)
  RETURNING id INTO v_group_id;

  INSERT INTO group_members (group_id, user_id)
  VALUES (v_group_id, v_user_id);

  RETURN v_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-------------------------------------------------------
-- FUNCTION: join_group(code)
-- Entra no grupo pelo invite_code.
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_group(p_code TEXT)
RETURNS UUID AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_group_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT id INTO v_group_id FROM groups WHERE invite_code = upper(trim(p_code));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código de convite inválido';
  END IF;

  INSERT INTO group_members (group_id, user_id)
  VALUES (v_group_id, v_user_id)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN v_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-------------------------------------------------------
-- FUNCTION: get_group_ranking(group_id)
-- Retorna display_name, streak atual e dias na semana,
-- ordenado por streak desc, dias na semana desc.
-------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_group_ranking(p_group_id UUID)
RETURNS TABLE (
  display_name TEXT,
  current_streak INT,
  week_checkins BIGINT
) AS $$
DECLARE
  v_today      DATE := (timezone('America/Sao_Paulo'::text, now()))::date;
  v_week_start DATE := v_today - 6;
BEGIN
  IF NOT is_group_member(p_group_id) THEN
    RAISE EXCEPTION 'Apenas membros podem ver o ranking';
  END IF;

  RETURN QUERY
  SELECT
    p.display_name,
    COALESCE((SELECT cs.current_streak FROM _calc_streak(gm.user_id) cs), 0),
    COUNT(dc.date) FILTER (WHERE dc.date BETWEEN v_week_start AND v_today)
  FROM group_members gm
  JOIN profiles p ON p.id = gm.user_id
  LEFT JOIN daily_checkins dc ON dc.user_id = gm.user_id
    AND dc.date BETWEEN v_week_start AND v_today
  WHERE gm.group_id = p_group_id
  GROUP BY gm.user_id, p.display_name
  ORDER BY 2 DESC, 3 DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
