-- 05_global_ranking.sql
-- Remove a lógica antiga de grupos e introduz o Ranking Global

-- 1. Remove tabelas e funções de grupos
DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;

DROP FUNCTION IF EXISTS public.create_group(text);
DROP FUNCTION IF EXISTS public.join_group(text);
DROP FUNCTION IF EXISTS public.leave_group(uuid);
DROP FUNCTION IF EXISTS public.get_group_ranking(uuid);
DROP FUNCTION IF EXISTS public.is_group_member(uuid);

-- 2. Atualiza profiles para suportar o Ranking Global
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS nickname TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS show_in_ranking BOOLEAN DEFAULT true NOT NULL;

-- Índices para melhorar a performance das queries do ranking
CREATE INDEX IF NOT EXISTS idx_profiles_streak ON public.profiles(current_streak DESC) WHERE show_in_ranking = true;

-- 3. Função para definir/atualizar o nickname
CREATE OR REPLACE FUNCTION public.set_nickname(p_nickname TEXT)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clean_nick TEXT := trim(p_nickname);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF length(v_clean_nick) < 3 OR length(v_clean_nick) > 20 THEN
    RAISE EXCEPTION 'O apelido deve ter entre 3 e 20 caracteres';
  END IF;

  IF v_clean_nick !~ '^[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'O apelido deve conter apenas letras, números e underline';
  END IF;

  UPDATE public.profiles
  SET nickname = v_clean_nick
  WHERE id = v_user_id;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Este apelido já está em uso';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Função para buscar o ranking global
-- p_period: 'streak' (Geral) ou 'week' (Semana)
CREATE OR REPLACE FUNCTION public.get_global_ranking(p_period TEXT, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE (
  pos BIGINT,
  nickname TEXT,
  current_streak INT,
  week_checkins INT
) AS $$
DECLARE
  v_start_of_week DATE;
BEGIN
  -- Calcula o início da semana (Domingo) no fuso de SP
  v_start_of_week := (date_trunc('week', (timezone('America/Sao_Paulo'::text, now()))::date + interval '1 day') - interval '1 day')::date;

  IF p_period = 'week' THEN
    RETURN QUERY
    WITH weekly_stats AS (
      SELECT 
        p.id,
        p.nickname,
        p.current_streak,
        COUNT(c.id)::INT AS checkins_this_week
      FROM public.profiles p
      LEFT JOIN public.daily_checkins c 
        ON p.id = c.user_id 
        AND c.checkin_date >= v_start_of_week
      WHERE p.show_in_ranking = true AND p.nickname IS NOT NULL
      GROUP BY p.id, p.nickname, p.current_streak
    ),
    ranked AS (
      SELECT 
        ROW_NUMBER() OVER (ORDER BY w.checkins_this_week DESC, w.current_streak DESC, w.nickname ASC) AS rnk,
        w.nickname,
        w.current_streak,
        w.checkins_this_week
      FROM weekly_stats w
    )
    SELECT rnk, ranked.nickname, ranked.current_streak, ranked.checkins_this_week
    FROM ranked
    ORDER BY rnk
    LIMIT p_limit OFFSET p_offset;
  ELSE
    -- Padrão: período 'streak' (Geral)
    RETURN QUERY
    WITH weekly_counts AS (
      SELECT 
        dc.user_id, 
        COUNT(dc.id)::INT AS w_checkins
      FROM public.daily_checkins dc
      WHERE dc.checkin_date >= v_start_of_week
      GROUP BY dc.user_id
    ),
    ranked AS (
      SELECT 
        ROW_NUMBER() OVER (ORDER BY p.current_streak DESC, COALESCE(w.w_checkins, 0) DESC, p.nickname ASC) AS rnk,
        p.nickname,
        p.current_streak,
        COALESCE(w.w_checkins, 0) AS week_checkins
      FROM public.profiles p
      LEFT JOIN weekly_counts w ON p.id = w.user_id
      WHERE p.show_in_ranking = true AND p.nickname IS NOT NULL
    )
    SELECT rnk, ranked.nickname, ranked.current_streak, ranked.week_checkins
    FROM ranked
    ORDER BY rnk
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Função para obter a posição atual do usuário logado
CREATE OR REPLACE FUNCTION public.get_my_rank(p_period TEXT)
RETURNS TABLE (
  pos BIGINT,
  nickname TEXT,
  current_streak INT,
  week_checkins INT
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_start_of_week DATE;
BEGIN
  v_start_of_week := (date_trunc('week', (timezone('America/Sao_Paulo'::text, now()))::date + interval '1 day') - interval '1 day')::date;

  IF p_period = 'week' THEN
    RETURN QUERY
    WITH weekly_stats AS (
      SELECT 
        p.id,
        p.nickname,
        p.current_streak,
        COUNT(c.id)::INT AS checkins_this_week
      FROM public.profiles p
      LEFT JOIN public.daily_checkins c ON p.id = c.user_id AND c.checkin_date >= v_start_of_week
      WHERE p.show_in_ranking = true AND p.nickname IS NOT NULL
      GROUP BY p.id, p.nickname, p.current_streak
    ),
    ranked AS (
      SELECT 
        w.id,
        ROW_NUMBER() OVER (ORDER BY w.checkins_this_week DESC, w.current_streak DESC, w.nickname ASC) AS rnk,
        w.nickname,
        w.current_streak,
        w.checkins_this_week
      FROM weekly_stats w
    )
    SELECT rnk, ranked.nickname, ranked.current_streak, ranked.checkins_this_week
    FROM ranked
    WHERE ranked.id = v_user_id;
  ELSE
    RETURN QUERY
    WITH weekly_counts AS (
      SELECT dc.user_id, COUNT(dc.id)::INT AS w_checkins
      FROM public.daily_checkins dc
      WHERE dc.checkin_date >= v_start_of_week
      GROUP BY dc.user_id
    ),
    ranked AS (
      SELECT 
        p.id,
        ROW_NUMBER() OVER (ORDER BY p.current_streak DESC, COALESCE(w.w_checkins, 0) DESC, p.nickname ASC) AS rnk,
        p.nickname,
        p.current_streak,
        COALESCE(w.w_checkins, 0) AS week_checkins
      FROM public.profiles p
      LEFT JOIN weekly_counts w ON p.id = w.user_id
      WHERE p.show_in_ranking = true AND p.nickname IS NOT NULL
    )
    SELECT rnk, ranked.nickname, ranked.current_streak, ranked.week_checkins
    FROM ranked
    WHERE ranked.id = v_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
