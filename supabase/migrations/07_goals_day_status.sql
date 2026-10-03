-- 07_goals_day_status.sql
-- Etapa 7.5 – Tarefa 1a: Dias aplicáveis, versionamento, limites e day_status.
-- Regras:
--   • goals.days_of_week indica os dias (0=domingo…6=sábado) em que a meta se aplica.
--   • Toda alteração de days_of_week ou de is_active gera uma nova linha em
--     goal_versions com valid_from = amanhã (exceto a versão inicial, válida desde hoje).
--     Isso impede que mudanças presentes reescrevam o passado.
--   • Limite: máx. 3 metas ativas/aplicáveis por dia da semana; mín. 1 meta ativa no total.
--   • complete_goal() rejeita meta cujo days_of_week não inclua hoje.
--   • do_checkin() considera apenas as metas aplicáveis hoje.
--   • day_status(user_id, date) é a única fonte de verdade sobre o status de um dia.

-- -------------------------------------------------------
-- 1. Coluna days_of_week em goals
-- -------------------------------------------------------
ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS days_of_week INT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}';

-- -------------------------------------------------------
-- 2. Tabela goal_versions — histórico imutável de configuração
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.goal_versions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id      UUID REFERENCES public.goals(id) ON DELETE CASCADE NOT NULL,
  user_id      UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  days_of_week INT[] NOT NULL,
  is_active    BOOLEAN NOT NULL,
  valid_from   DATE NOT NULL  -- a versão é usada para todas as datas >= valid_from
                              -- até a próxima versão do mesmo goal_id (exclusive)
);

ALTER TABLE public.goal_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuário lê próprias versões" ON public.goal_versions;
CREATE POLICY "Usuário lê próprias versões"
  ON public.goal_versions FOR SELECT USING (auth.uid() = user_id);
-- Sem INSERT/UPDATE/DELETE direto: apenas via trigger abaixo.

-- Índice para consultas de versionamento por data
CREATE INDEX IF NOT EXISTS idx_goal_versions_goal_date
  ON public.goal_versions(goal_id, valid_from DESC);

-- -------------------------------------------------------
-- 3. Trigger: popula goal_versions automaticamente
-- -------------------------------------------------------

-- 3a. Versão inicial ao criar a meta (valid_from = hoje)
CREATE OR REPLACE FUNCTION public._goal_versions_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.goal_versions (goal_id, user_id, days_of_week, is_active, valid_from)
  VALUES (NEW.id, NEW.user_id, NEW.days_of_week, NEW.is_active,
          (timezone('America/Sao_Paulo', now()))::date);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_goal_versions_insert ON public.goals;
CREATE TRIGGER trg_goal_versions_insert
  AFTER INSERT ON public.goals
  FOR EACH ROW EXECUTE PROCEDURE public._goal_versions_on_insert();

-- 3b. Nova versão amanhã a cada update que mude days_of_week ou is_active
CREATE OR REPLACE FUNCTION public._goal_versions_on_update()
RETURNS TRIGGER AS $$
DECLARE
  v_tomorrow DATE := (timezone('America/Sao_Paulo', now()))::date + 1;
BEGIN
  -- Só registra se algo relevante mudou
  IF NEW.days_of_week IS DISTINCT FROM OLD.days_of_week
     OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN

    -- Se já existe uma versão para amanhã (ajuste no mesmo dia), substitui
    IF EXISTS (
      SELECT 1 FROM public.goal_versions
      WHERE goal_id = NEW.id AND valid_from = v_tomorrow
    ) THEN
      UPDATE public.goal_versions
      SET days_of_week = NEW.days_of_week,
          is_active    = NEW.is_active
      WHERE goal_id = NEW.id AND valid_from = v_tomorrow;
    ELSE
      INSERT INTO public.goal_versions (goal_id, user_id, days_of_week, is_active, valid_from)
      VALUES (NEW.id, NEW.user_id, NEW.days_of_week, NEW.is_active, v_tomorrow);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_goal_versions_update ON public.goals;
CREATE TRIGGER trg_goal_versions_update
  AFTER UPDATE ON public.goals
  FOR EACH ROW EXECUTE PROCEDURE public._goal_versions_on_update();

-- -------------------------------------------------------
-- 4. Retropreenche goal_versions para goals já existentes
--    (válido a partir da data de criação da meta)
-- -------------------------------------------------------
INSERT INTO public.goal_versions (goal_id, user_id, days_of_week, is_active, valid_from)
SELECT g.id,
       g.user_id,
       g.days_of_week,
       g.is_active,
       g.created_at::date   -- retrospectivamente válida desde a criação
FROM public.goals g
WHERE NOT EXISTS (
  SELECT 1 FROM public.goal_versions gv WHERE gv.goal_id = g.id
);

-- -------------------------------------------------------
-- 5. Helper interno: versão da meta em uma data específica
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public._goal_version_at(p_goal_id UUID, p_date DATE)
RETURNS public.goal_versions AS $$
  SELECT *
  FROM public.goal_versions
  WHERE goal_id = p_goal_id
    AND valid_from <= p_date
  ORDER BY valid_from DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

-- -------------------------------------------------------
-- 6. Validação de limites (chamada antes de insert/update em goals)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public._validate_goal_limits(
  p_user_id    UUID,
  p_goal_id    UUID,       -- NULL para inserção nova
  p_days       INT[],
  p_is_active  BOOLEAN
) RETURNS VOID AS $$
DECLARE
  v_today       DATE := (timezone('America/Sao_Paulo', now()))::date;
  v_total_active INT;
  v_day         INT;
  v_day_count   INT;
BEGIN
  -- Verifica mínimo de 1 meta ativa SOMENTE na desativação
  IF p_is_active = false AND p_goal_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_total_active
    FROM public.goals
    WHERE user_id = p_user_id
      AND is_active = true
      AND id != p_goal_id;

    IF v_total_active = 0 THEN
      RAISE EXCEPTION 'Você precisa ter pelo menos uma meta ativa.';
    END IF;
  END IF;

  -- Verifica máximo de 3 por dia (só se a meta vai ser ativa)
  IF p_is_active = true THEN
    FOREACH v_day IN ARRAY p_days LOOP
      SELECT COUNT(*) INTO v_day_count
      FROM public.goals g
      WHERE g.user_id = p_user_id
        AND g.is_active = true
        AND v_day = ANY(g.days_of_week)
        AND (p_goal_id IS NULL OR g.id != p_goal_id);

      IF v_day_count >= 3 THEN
        RAISE EXCEPTION
          'Três metas por dia é o limite. Rotina que cabe é rotina que dura. (dia da semana: %)', v_day;
      END IF;
    END LOOP;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------
-- 7. Função pública para criar meta (substitui INSERT direto)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_goal(p_title TEXT, p_days INT[])
RETURNS UUID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_goal_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF p_days IS NULL OR array_length(p_days, 1) = 0 THEN
    RAISE EXCEPTION 'A meta precisa ter pelo menos 1 dia da semana.';
  END IF;

  -- Valida limites antes de criar
  PERFORM public._validate_goal_limits(v_user_id, NULL, p_days, true);

  INSERT INTO public.goals (user_id, title, days_of_week, is_active)
  VALUES (v_user_id, trim(p_title), p_days, true)
  RETURNING id INTO v_goal_id;

  RETURN v_goal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------
-- 8. Função pública para editar meta (days_of_week, title, is_active)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_goal(
  p_goal_id   UUID,
  p_title     TEXT     DEFAULT NULL,
  p_days      INT[]    DEFAULT NULL,
  p_is_active BOOLEAN  DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_user_id    UUID := auth.uid();
  v_goal       public.goals;
  v_new_days   INT[];
  v_new_active BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_goal
  FROM public.goals
  WHERE id = p_goal_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meta não encontrada';
  END IF;

  v_new_days   := COALESCE(p_days,      v_goal.days_of_week);
  v_new_active := COALESCE(p_is_active, v_goal.is_active);

  IF array_length(v_new_days, 1) = 0 THEN
    RAISE EXCEPTION 'A meta precisa ter pelo menos 1 dia da semana.';
  END IF;

  PERFORM public._validate_goal_limits(v_user_id, p_goal_id, v_new_days, v_new_active);

  UPDATE public.goals
  SET title        = COALESCE(trim(p_title), title),
      days_of_week = v_new_days,
      is_active    = v_new_active
  WHERE id = p_goal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------
-- 9. FUNÇÃO CENTRAL: day_status(user_id, date)
--    Retorna o status de um dia específico para o usuário.
--    Status possíveis: pending | completed | missed | neutral | protected | frozen
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.day_status(p_user_id UUID, p_date DATE)
RETURNS TEXT AS $$
DECLARE
  v_today         DATE := (timezone('America/Sao_Paulo', now()))::date;
  v_dow           INT  := EXTRACT(DOW FROM p_date)::INT;   -- 0=domingo … 6=sábado
  v_applicable    INT  := 0;   -- metas aplicáveis naquele dia (versão daquela data)
  v_completed     INT  := 0;   -- metas cumpridas naquele dia
  v_checkin_done  BOOLEAN;
  v_protected     BOOLEAN;
BEGIN
  -- Datas futuras não têm status definido
  IF p_date > v_today THEN
    RETURN 'pending';
  END IF;

  -- Conta metas aplicáveis naquela data usando o versionamento
  SELECT COUNT(*) INTO v_applicable
  FROM public.goals g
  WHERE g.user_id = p_user_id
    AND EXISTS (
      -- versão mais recente válida naquela data
      SELECT 1
      FROM public.goal_versions gv
      WHERE gv.goal_id    = g.id
        AND gv.valid_from <= p_date
        AND gv.is_active  = true
        AND v_dow = ANY(gv.days_of_week)
      ORDER BY gv.valid_from DESC
      LIMIT 1
    );

  -- Dia sem nenhuma meta aplicável → neutral
  -- (inclui dias anteriores à criação da conta e dias de descanso configurados)
  IF v_applicable = 0 THEN
    RETURN 'neutral';
  END IF;

  -- Checou se o dia está protegido por escudo
  -- (tabela protected_days criada na Tarefa 1b, verificamos com IF EXISTS seguro)
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.protected_days
      WHERE user_id = p_user_id AND day = p_date
    ) INTO v_protected;
  EXCEPTION WHEN undefined_table THEN
    -- Tabela ainda não existe (antes da migration 08)
    v_protected := false;
  END;

  IF v_protected THEN
    RETURN 'protected';
  END IF;

  -- Verifica se houve check-in naquele dia
  SELECT EXISTS (
    SELECT 1 FROM public.daily_checkins
    WHERE user_id = p_user_id AND checkin_date = p_date
  ) INTO v_checkin_done;

  -- Dia de hoje sem check-in = pending
  IF p_date = v_today AND NOT v_checkin_done THEN
    RETURN 'pending';
  END IF;

  -- Dia no passado: verifica se houve check-in
  IF v_checkin_done THEN
    RETURN 'completed';
  ELSE
    RETURN 'missed';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

-- -------------------------------------------------------
-- 10. Recalcula streak usando day_status (substitui _calc_streak)
--     Itera para trás a partir de ontem até encontrar um "missed".
--     Dia "pending" (hoje) não interrompe; neutral e protected mantêm.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public._calc_streak(p_user_id UUID)
RETURNS TABLE (current_streak INT, longest_streak INT) AS $$
DECLARE
  v_today     DATE    := (timezone('America/Sao_Paulo', now()))::date;
  v_date      DATE;
  v_status    TEXT;
  v_current   INT := 0;
  v_longest   INT := 0;
  v_sequence  INT := 0;    -- sequência atual sendo contada
  v_max_days  INT := 1100; -- limite de iteração (~3 anos)
  v_i         INT := 0;
  -- Para cálculo do longest (histórico por check-ins)
  v_prev      DATE := NULL;
  v_temp      INT  := 0;
  rec         RECORD;
BEGIN
  -- Percorre dias regressivamente a partir de ontem
  -- (hoje ainda está pending se não fez check-in, não interrompe)
  v_date := v_today - 1;

  WHILE v_i < v_max_days LOOP
    v_status := public.day_status(p_user_id, v_date);

    CASE v_status
      WHEN 'completed', 'protected' THEN
        -- completed incrementa; protected mantém sem incrementar
        IF v_status = 'completed' THEN
          v_sequence := v_sequence + 1;
        END IF;

      WHEN 'neutral', 'frozen' THEN
        -- Dias neutros/frozen não quebram nem incrementam
        NULL;

      WHEN 'missed' THEN
        -- Sequência quebrada: para de contar para trás
        EXIT;

      ELSE
        -- pending ou desconhecido: para
        EXIT;
    END CASE;

    v_date := v_date - 1;
    v_i    := v_i + 1;
  END LOOP;

  v_current := v_sequence;

  -- Longest: percorre todos os check-ins para encontrar a maior sequência histórica
  -- Usa check-ins diretamente (mais eficiente que chamar day_status para cada dia histórico)
  FOR rec IN
    SELECT dc.checkin_date AS d
    FROM public.daily_checkins dc
    WHERE dc.user_id = p_user_id
    ORDER BY dc.checkin_date ASC
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

  -- Garante que longest >= current
  IF v_current > v_longest THEN
    v_longest := v_current;
  END IF;

  RETURN QUERY SELECT v_current, v_longest;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------
-- 11. Atualiza complete_goal para verificar dias aplicáveis
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_goal(p_goal_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today   DATE := (timezone('America/Sao_Paulo', now()))::date;
  v_dow     INT  := EXTRACT(DOW FROM v_today)::INT;
  v_version public.goal_versions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Verifica que a meta pertence ao usuário
  IF NOT EXISTS (
    SELECT 1 FROM public.goals
    WHERE id = p_goal_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Meta não encontrada';
  END IF;

  -- Obtém a versão vigente hoje
  SELECT * INTO v_version
  FROM public._goal_version_at(p_goal_id, v_today);

  IF NOT FOUND OR NOT v_version.is_active THEN
    RAISE EXCEPTION 'Meta inativa hoje';
  END IF;

  -- Verifica se o dia de hoje está nos dias aplicáveis
  IF NOT (v_dow = ANY(v_version.days_of_week)) THEN
    RAISE EXCEPTION 'Esta meta não se aplica a hoje (dia da semana: %)', v_dow;
  END IF;

  INSERT INTO public.goal_completions (user_id, goal_id, date)
  VALUES (v_user_id, p_goal_id, v_today)
  ON CONFLICT (goal_id, date) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------
-- 12. Atualiza do_checkin para considerar só metas aplicáveis hoje
-- -------------------------------------------------------
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

  -- Conta metas aplicáveis hoje usando versão vigente
  SELECT COUNT(*) INTO v_applicable
  FROM public.goals g
  WHERE g.user_id = v_user_id
    AND EXISTS (
      SELECT 1
      FROM public.goal_versions gv
      WHERE gv.goal_id    = g.id
        AND gv.valid_from <= v_today
        AND gv.is_active  = true
        AND v_dow = ANY(gv.days_of_week)
      ORDER BY gv.valid_from DESC
      LIMIT 1
    );

  -- Dia sem metas aplicáveis = dia de descanso, não permite check-in
  IF v_applicable = 0 THEN
    RAISE EXCEPTION 'Nenhuma meta se aplica a hoje. Aproveite o dia de descanso!';
  END IF;

  -- Conta completadas hoje (só as aplicáveis)
  SELECT COUNT(*) INTO v_done
  FROM public.goal_completions gc
  JOIN public.goals g ON g.id = gc.goal_id
  WHERE gc.user_id = v_user_id
    AND gc.date    = v_today
    AND EXISTS (
      SELECT 1
      FROM public.goal_versions gv
      WHERE gv.goal_id    = g.id
        AND gv.valid_from <= v_today
        AND gv.is_active  = true
        AND v_dow = ANY(gv.days_of_week)
      ORDER BY gv.valid_from DESC
      LIMIT 1
    );

  IF v_done < v_applicable THEN
    RAISE EXCEPTION 'Faltam % meta(s) para completar hoje.', (v_applicable - v_done);
  END IF;

  INSERT INTO public.daily_checkins (user_id, checkin_date)
  VALUES (v_user_id, v_today)
  ON CONFLICT (user_id, checkin_date) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------
-- 13. Segurança: revoga execução direta das funções internas
--     Só funções SECURITY DEFINER públicas as chamam via auth.uid().
-- -------------------------------------------------------

-- Funções de trigger (já protegidas pelo mecanismo de trigger, mas explicitamos)
REVOKE EXECUTE ON FUNCTION public._goal_versions_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._goal_versions_on_update()  FROM PUBLIC, anon, authenticated;

-- Helpers internos chamados apenas por funções SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public._goal_version_at(UUID, DATE)         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._validate_goal_limits(UUID, UUID, INT[], BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._calc_streak(UUID)                   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.day_status(UUID, DATE)               FROM PUBLIC, anon, authenticated;

-- Funções públicas (mantém EXECUTE para authenticated):
-- create_goal, update_goal, complete_goal, do_checkin, get_streak → acessíveis via RPC.
