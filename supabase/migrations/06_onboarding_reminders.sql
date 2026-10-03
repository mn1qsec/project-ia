-- 06_onboarding_reminders.sql

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarded BOOLEAN DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT true NOT NULL,
ADD COLUMN IF NOT EXISTS reminder_time TIME DEFAULT '19:00:00' NOT NULL;

-- Função para atualizar o perfil no final do onboarding
CREATE OR REPLACE FUNCTION public.finish_onboarding(p_nickname TEXT, p_reminder_enabled BOOLEAN, p_reminder_time TIME)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clean_nick TEXT := trim(p_nickname);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Se tiver nickname, vamos validar e tentar salvar
  IF v_clean_nick IS NOT NULL AND v_clean_nick != '' THEN
    IF length(v_clean_nick) < 3 OR length(v_clean_nick) > 20 THEN
      RAISE EXCEPTION 'O apelido deve ter entre 3 e 20 caracteres';
    END IF;

    IF v_clean_nick !~ '^[a-zA-Z0-9_]+$' THEN
      RAISE EXCEPTION 'O apelido deve conter apenas letras, números e underline';
    END IF;
  END IF;

  -- Atualiza o profile
  UPDATE public.profiles
  SET 
    nickname = CASE WHEN v_clean_nick != '' THEN v_clean_nick ELSE nickname END,
    reminder_enabled = p_reminder_enabled,
    reminder_time = p_reminder_time,
    onboarded = true
  WHERE id = v_user_id;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Este apelido já está em uso';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Função para atualizar apenas as settings do reminder (no Perfil)
CREATE OR REPLACE FUNCTION public.update_reminder_settings(p_enabled BOOLEAN, p_time TIME)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  UPDATE public.profiles
  SET 
    reminder_enabled = p_enabled,
    reminder_time = p_time
  WHERE id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
