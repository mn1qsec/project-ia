-- =============================================================
-- seed_test.sql — Script de teste manual
-- Cole cada bloco separadamente no SQL Editor do Supabase.
-- =============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │ PASSO 1: Simular sessão de um usuário autenticado       │
-- │ (Necessário porque as funções usam auth.uid())          │
-- └─────────────────────────────────────────────────────────┘
-- Primeiro, vá em Authentication > Users no Supabase e crie
-- um usuário de teste com e-mail/senha. Copie o UUID dele.
-- Depois rode:

-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"COLE_O_UUID_DO_USUARIO_AQUI"}';

-- ┌─────────────────────────────────────────────────────────┐
-- │ PASSO 2: Verificar se o profile foi criado pelo trigger │
-- └─────────────────────────────────────────────────────────┘

-- SELECT * FROM profiles;

-- ┌─────────────────────────────────────────────────────────┐
-- │ PASSO 3: Criar uma meta                                │
-- └─────────────────────────────────────────────────────────┘

-- INSERT INTO goals (user_id, title)
-- VALUES (auth.uid(), 'Treinar na academia');

-- INSERT INTO goals (user_id, title)
-- VALUES (auth.uid(), 'Beber 2L de água');

-- SELECT * FROM goals;

-- ┌─────────────────────────────────────────────────────────┐
-- │ PASSO 4: Completar as metas de hoje                    │
-- └─────────────────────────────────────────────────────────┘

-- SELECT complete_goal((SELECT id FROM goals WHERE title = 'Treinar na academia' LIMIT 1));
-- SELECT complete_goal((SELECT id FROM goals WHERE title = 'Beber 2L de água' LIMIT 1));

-- SELECT * FROM goal_completions;

-- ┌─────────────────────────────────────────────────────────┐
-- │ PASSO 5: Fazer check-in (deve funcionar)               │
-- └─────────────────────────────────────────────────────────┘

-- SELECT do_checkin();

-- SELECT * FROM daily_checkins;

-- ┌─────────────────────────────────────────────────────────┐
-- │ PASSO 6: Verificar streak                              │
-- └─────────────────────────────────────────────────────────┘

-- SELECT * FROM get_streak();

-- ┌─────────────────────────────────────────────────────────┐
-- │ PASSO 7: Testar check-in sem completar tudo (deve dar  │
-- │ erro "Faltam X meta(s)")                               │
-- └─────────────────────────────────────────────────────────┘

-- Tente do_checkin() amanhã sem completar as metas:
-- SELECT do_checkin(); -- DEVE DAR ERRO

-- ┌─────────────────────────────────────────────────────────┐
-- │ PASSO 8: Testar grupos                                 │
-- └─────────────────────────────────────────────────────────┘

-- SELECT create_group('Turma da Academia');
-- SELECT * FROM groups;
-- SELECT * FROM group_members;

-- Com o invite_code retornado, outro usuário pode:
-- SELECT join_group('CODIGO');

-- SELECT * FROM get_group_ranking((SELECT id FROM groups LIMIT 1));

-- ┌─────────────────────────────────────────────────────────┐
-- │ LIMPAR (resetar role após os testes)                    │
-- └─────────────────────────────────────────────────────────┘

-- RESET role;
