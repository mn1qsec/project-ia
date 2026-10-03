-- 10_light_mode.sql
-- Adiciona campos de Modo Leve ao perfil.
-- light_mode: o usuário pode ligar/desligar livremente.
-- soft_mode_from / soft_mode_until: controlados apenas pelo servidor (SECURITY DEFINER);
--   a role anon/authenticated NÃO pode gravar nessas colunas diretamente.

-- -----------------------------------------------------------------------------
-- 1. Novas colunas
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS light_mode        BOOLEAN                   DEFAULT false,
  ADD COLUMN IF NOT EXISTS soft_mode_from    TIMESTAMP WITH TIME ZONE  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS soft_mode_until   TIMESTAMP WITH TIME ZONE  DEFAULT NULL;

-- -----------------------------------------------------------------------------
-- 2. Proteção de soft_mode_from / soft_mode_until via trigger
--    (estende o trigger existente _prevent_profile_tampering de 09_)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._prevent_profile_tampering()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('role', true) = 'authenticated' THEN
    -- Colunas protegidas: streak, shields, soft_mode (servidor only)
    NEW.current_streak        = OLD.current_streak;
    NEW.longest_streak        = OLD.longest_streak;
    NEW.shields               = OLD.shields;
    NEW.shields_refilled_month = OLD.shields_refilled_month;
    -- soft_mode só pode ser alterado por funções SECURITY DEFINER (service role)
    NEW.soft_mode_from        = OLD.soft_mode_from;
    NEW.soft_mode_until       = OLD.soft_mode_until;
    -- light_mode é livre: não resetamos aqui
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger já existe (criado em 09_); substituímos a função acima, o trigger
-- continua válido. Recria apenas para garantir que está ativo.
DROP TRIGGER IF EXISTS trg_prevent_profile_tampering ON public.profiles;
CREATE TRIGGER trg_prevent_profile_tampering
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public._prevent_profile_tampering();

-- -----------------------------------------------------------------------------
-- 3. Prova: tentativa de UPDATE nas colunas protegidas com role anon/authenticated
--    deve resultar em NOP (valores permanecem inalterados).
--
--    Teste manual (execute como usuário autenticado via Supabase client):
--
--    UPDATE profiles
--       SET soft_mode_until = NOW() + INTERVAL '7 days'
--     WHERE id = auth.uid();
--
--    → SELECT soft_mode_until FROM profiles WHERE id = auth.uid();
--    → Resultado: NULL  (a coluna não mudou – proteção funcionou)
--
--    Para alterar soft_mode_until legitimamente, crie uma função SECURITY DEFINER:
--
--    CREATE OR REPLACE FUNCTION public.set_soft_mode(
--      p_from  TIMESTAMP WITH TIME ZONE,
--      p_until TIMESTAMP WITH TIME ZONE
--    ) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
--    BEGIN
--      UPDATE profiles
--         SET soft_mode_from  = p_from,
--             soft_mode_until = p_until
--       WHERE id = auth.uid();
--    END;
--    $$;
-- -----------------------------------------------------------------------------
