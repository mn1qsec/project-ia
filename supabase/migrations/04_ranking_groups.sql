-- 04_ranking_groups.sql
-- Função para sair de um grupo (com transferência de posse ou deleção do grupo)

CREATE OR REPLACE FUNCTION public.leave_group(p_group_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_owner BOOLEAN;
  v_next_owner_id UUID;
  v_members_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Verifica se o usuário é membro do grupo
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members 
    WHERE group_id = p_group_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Você não é membro deste grupo';
  END IF;

  -- Verifica se o usuário é o dono do grupo
  SELECT (owner_id = v_user_id) INTO v_is_owner
  FROM public.groups
  WHERE id = p_group_id;

  -- Remove o membro
  DELETE FROM public.group_members
  WHERE group_id = p_group_id AND user_id = v_user_id;

  -- Verifica quantos membros sobraram
  SELECT count(*) INTO v_members_count
  FROM public.group_members
  WHERE group_id = p_group_id;

  IF v_members_count = 0 THEN
    -- Se não sobrou ninguém, apaga o grupo
    DELETE FROM public.groups WHERE id = p_group_id;
  ELSIF v_is_owner THEN
    -- Se era o dono e sobrou gente, passa a posse pro mais antigo
    SELECT user_id INTO v_next_owner_id
    FROM public.group_members
    WHERE group_id = p_group_id
    ORDER BY joined_at ASC
    LIMIT 1;

    UPDATE public.groups
    SET owner_id = v_next_owner_id
    WHERE id = p_group_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
