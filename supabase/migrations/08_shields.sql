-- 08_shields.sql
-- Etapa 7.5 – Tarefa 1b: Sistema de Escudo de Continuidade.
-- Regras:
--   • Saldo inicial: 1. +1 no 1º dia de cada mês novo (até teto 3).
--     Recarga calculada na leitura, sem cron — acumula meses sem abrir o app.
--   • Uso (use_shield()): protege APENAS D-1, e APENAS durante o dia D.
--     D-1 deve estar com status 'missed'. D-2 não pode ser 'protected'.
--     Só vale se havia streak ≥ 1 antes de D-1.
--   • Efeito: D-1 vira 'protected' — a chama continua, SEM incrementar o número.
--   • profiles.shields só muda via função (política de RLS impede update direto).
--   • flame_state() retorna {days, at_risk, recoverable_day, shields} e faz
--     a recarga de escudos de forma lazy (sem cron).

-- -------------------------------------------------------
-- 1. Colunas em profiles
-- -------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shields INT NOT NULL DEFAULT 1,
  -- guarda o mês em que o escudo foi recarregado pela última vez, ex: '2024-10'
  ADD COLUMN IF NOT EXISTS shields_refilled_month TEXT NOT NULL DEFAULT to_char(now(), 'YYYY-MM');

-- Revoga a capacidade do usuário de alterar shields diretamente via RLS de update.
-- A policy "Users can update own profile" já existe; vamos restringi-la para não
-- incluir shields (substituímos a policy antiga).
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Usuário não pode alterar shields nem shields_refilled_month diretamente
    -- (esses campos só mudam via funções SECURITY DEFINER)
  );

-- -------------------------------------------------------
-- 2. Tabela protected_days — escudos usados (imutável para o usuário)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.protected_days (
  user_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  day      DATE NOT NULL,
  used_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.protected_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê próprios dias protegidos"
  ON public.protected_days FOR SELECT USING (auth.uid() = user_id);
-- Sem INSERT/UPDATE/DELETE direto: apenas via use_shield() SECURITY DEFINER.

-- -------------------------------------------------------
-- 3. Helper interno: calcula e aplica recarga de escudos (lazy, sem cron)
--    Retorna o saldo atualizado. Salva em profiles quando há diferença.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public._refresh_shields(p_user_id UUID)
RETURNS INT AS $$
DECLARE
  v_current_month  TEXT := to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM');
  v_refilled_month TEXT;
  v_shields        INT;
  v_months_passed  INT;
  v_refill         INT;
BEGIN
  SELECT shields, shields_refilled_month
  INTO v_shields, v_refilled_month
  FROM public.profiles
  WHERE id = p_user_id;

  -- Calcula quantos meses novos se passaram desde a última recarga
  v_months_passed := (
    EXTRACT(YEAR FROM to_date(v_current_month, 'YYYY-MM'))::INT * 12 +
    EXTRACT(MONTH FROM to_date(v_current_month, 'YYYY-MM'))::INT
  ) - (
    EXTRACT(YEAR FROM to_date(v_refilled_month, 'YYYY-MM'))::INT * 12 +
    EXTRACT(MONTH FROM to_date(v_refilled_month, 'YYYY-MM'))::INT
  );

  IF v_months_passed > 0 THEN
    -- +1 por mês novo, teto 3
    v_refill  := LEAST(v_shields + v_months_passed, 3);
    v_shields := v_refill;

    UPDATE public.profiles
    SET shields               = v_shields,
        shields_refilled_month = v_current_month
    WHERE id = p_user_id;
  END IF;

  RETURN v_shields;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------
-- 4. flame_state() — estado da chama do usuário autenticado
--    Retorna: days (streak atual), at_risk (bool), recoverable_day (date|null),
--             shields (saldo após recarga lazy).
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.flame_state()
RETURNS TABLE (
  days           INT,
  at_risk        BOOLEAN,
  recoverable_day DATE,
  shields        INT
) AS $$
DECLARE
  v_user_id    UUID := auth.uid();
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
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT 0, false, NULL::DATE, 0;
    RETURN;
  END IF;

  -- Recarga lazy de escudos
  v_shields := public._refresh_shields(v_user_id);

  -- Streak atual (usa _calc_streak que já considera protected/neutral)
  SELECT cs.current_streak, cs.longest_streak
  INTO v_streak, v_longest
  FROM public._calc_streak(v_user_id) cs;

  -- Salva streak em profiles (mantém coluna sincronizada para o ranking)
  UPDATE public.profiles
  SET current_streak = v_streak,
      longest_streak = GREATEST(longest_streak, v_longest)
  WHERE id = v_user_id;

  -- Avalia se D-1 está em risco e pode ser recuperado
  v_status_d1 := public.day_status(v_user_id, v_yesterday);
  v_status_d2 := public.day_status(v_user_id, v_d2);

  -- Condições para at_risk = true:
  --   1. D-1 está 'missed'
  --   2. D-2 NÃO está 'protected' (escudos não consecutivos)
  --   3. Havia sequência antes de D-1 (v_streak reflete o estado atual,
  --      mas precisamos saber se havia streak ANTES de D-1 quebrar)
  IF v_status_d1 = 'missed' AND v_status_d2 != 'protected' THEN
    -- Checa se havia streak antes de D-1 (ou seja, D-2 ou anterior é completed/protected)
    -- Se o dia D-2 é completed, neutral ou protected, significa que havia continuidade
    IF v_status_d2 IN ('completed', 'protected', 'neutral') THEN
      -- Verifica que havia ao menos 1 dia completed antes de D-1
      IF EXISTS (
        SELECT 1 FROM public.daily_checkins
        WHERE user_id = v_user_id
          AND checkin_date <= v_d2
        LIMIT 1
      ) OR v_status_d2 = 'protected' THEN
        v_at_risk   := true;
        v_rec_day   := v_yesterday;
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_streak, v_at_risk, v_rec_day, v_shields;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------
-- 5. use_shield() — aplica o escudo em D-1
-- -------------------------------------------------------
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Recarga lazy antes de verificar saldo
  v_shields := public._refresh_shields(v_user_id);

  IF v_shields <= 0 THEN
    RAISE EXCEPTION 'Sem escudos disponíveis. O próximo escudo chega no início do próximo mês.';
  END IF;

  -- Verifica status de D-1
  v_status_d1 := public.day_status(v_user_id, v_yesterday);
  IF v_status_d1 != 'missed' THEN
    RAISE EXCEPTION 'O escudo só pode ser usado em um dia perdido (D-1 está: %)', v_status_d1;
  END IF;

  -- Garante que D-2 não foi protegido (sem escudos consecutivos)
  v_status_d2 := public.day_status(v_user_id, v_d2);
  IF v_status_d2 = 'protected' THEN
    RAISE EXCEPTION 'Não é possível proteger dois dias consecutivos.';
  END IF;

  -- Garante que havia streak antes de D-1
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_checkins
    WHERE user_id = v_user_id AND checkin_date <= v_d2
    LIMIT 1
  ) AND v_status_d2 != 'protected' THEN
    RAISE EXCEPTION 'Não há streak para proteger.';
  END IF;

  -- Tudo validado: deduz escudo e registra dia protegido
  -- Usa FOR UPDATE para evitar race condition
  UPDATE public.profiles
  SET shields = shields - 1
  WHERE id = v_user_id AND shields > 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sem escudos disponíveis (race condition).';
  END IF;

  INSERT INTO public.protected_days (user_id, day)
  VALUES (v_user_id, v_yesterday)
  ON CONFLICT (user_id, day) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------
-- 6. Função auxiliar: próxima data de recarga de escudo
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_shield_refill_date()
RETURNS DATE AS $$
DECLARE
  v_today DATE := (timezone('America/Sao_Paulo', now()))::date;
BEGIN
  -- Primeiro dia do próximo mês
  RETURN (date_trunc('month', v_today) + interval '1 month')::date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;
