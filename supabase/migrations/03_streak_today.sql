-- 03_streak_today.sql
-- Adiciona a função get_today() para o app usar a data correta do servidor

CREATE OR REPLACE FUNCTION public.get_today()
RETURNS DATE AS $$
BEGIN
  RETURN (timezone('America/Sao_Paulo'::text, now()))::date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
