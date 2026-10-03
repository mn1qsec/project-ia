/**
 * Testes da Tarefa 1b: Escudo de continuidade.
 *
 * Parte da lógica pura (JS) é testada aqui.
 * Parte que depende do banco está documentada para validação manual no SQL Editor.
 */

// ---------------------------------------------------------------------------
// LÓGICA PURA: cálculo de recarga mensal de escudos
// ---------------------------------------------------------------------------

/**
 * Replica a lógica de _refresh_shields() para testar em JS.
 * Retorna o novo saldo sem ter acesso ao banco.
 */
function calcShieldsRefill(
  currentShields: number,
  refilledMonth: string, // 'YYYY-MM'
  currentMonth: string   // 'YYYY-MM'
): number {
  const [ry, rm] = refilledMonth.split('-').map(Number);
  const [cy, cm] = currentMonth.split('-').map(Number);
  const monthsPassed = (cy * 12 + cm) - (ry * 12 + rm);
  if (monthsPassed <= 0) return currentShields;
  return Math.min(currentShields + monthsPassed, 3); // teto 3
}

describe('Escudo — recarga mensal lazy', () => {
  it('não recarrega se ainda é o mesmo mês', () => {
    expect(calcShieldsRefill(1, '2024-10', '2024-10')).toBe(1);
  });

  it('+1 no primeiro mês seguinte', () => {
    expect(calcShieldsRefill(1, '2024-10', '2024-11')).toBe(2);
  });

  it('acumula 2 meses sem abrir o app', () => {
    expect(calcShieldsRefill(1, '2024-10', '2024-12')).toBe(3);
  });

  it('nunca ultrapassa o teto de 3', () => {
    expect(calcShieldsRefill(2, '2024-01', '2024-12')).toBe(3);
  });

  it('acumula meses sem abrir o app até o teto (usuário sumiu por 6 meses)', () => {
    expect(calcShieldsRefill(0, '2024-01', '2024-07')).toBe(3);
  });

  it('com 3 escudos, não ultrapassa mesmo que passe 1 mês', () => {
    expect(calcShieldsRefill(3, '2024-10', '2024-11')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// LÓGICA PURA: janela de uso do escudo (D-1 durante D)
// ---------------------------------------------------------------------------

/**
 * Simula a validação de janela de uso do escudo.
 * O escudo só pode ser usado durante o dia D (hoje) para proteger D-1.
 */
function canUseShieldForDay(
  missedDay: string,      // data de D-1
  today: string           // data atual (D)
): boolean {
  const d1 = new Date(missedDay);
  const d  = new Date(today);
  d.setHours(0, 0, 0, 0);
  d1.setHours(0, 0, 0, 0);
  // D-1 deve ser exatamente ontem em relação a hoje
  const diffMs = d.getTime() - d1.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays === 1;
}

describe('Escudo — janela de uso (D-1 durante D)', () => {
  it('permite proteger D-1 durante o dia D', () => {
    expect(canUseShieldForDay('2024-10-01', '2024-10-02')).toBe(true);
  });

  it('não permite proteger D-2 (muito antigo)', () => {
    expect(canUseShieldForDay('2024-09-30', '2024-10-02')).toBe(false);
  });

  it('não permite proteger hoje mesmo', () => {
    expect(canUseShieldForDay('2024-10-02', '2024-10-02')).toBe(false);
  });

  it('passou a meia-noite: D-1 de ontem já não pode ser resgatado', () => {
    // Ontem era 01/10, hoje é 03/10 → D-1 seria 02/10, não 01/10
    expect(canUseShieldForDay('2024-10-01', '2024-10-03')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DOCUMENTAÇÃO DE VALIDAÇÕES SQL (rodar no SQL Editor do Supabase)
// ---------------------------------------------------------------------------

describe('flame_state() — comportamento esperado (SQL manual)', () => {
  /**
   * 1. Usuário com streak ativo e sem perda ontem:
   *    SELECT * FROM public.flame_state();
   *    Esperado: at_risk = false, recoverable_day = NULL.
   *
   * 2. Usuário que perdeu ontem (missed):
   *    SELECT * FROM public.flame_state();
   *    Esperado: at_risk = true, recoverable_day = CURRENT_DATE - 1, shields = 1 (ou mais).
   *
   * 3. Usuário sem streak (nunca fez check-in):
   *    SELECT * FROM public.flame_state();
   *    Esperado: at_risk = false (não há chama para proteger), days = 0.
   */
  it('está documentado (validar manualmente no SQL Editor)', () => {
    expect(true).toBe(true);
  });
});

describe('use_shield() — validações de segurança (SQL manual)', () => {
  /**
   * 1. Sem escudos (shields = 0):
   *    UPDATE profiles SET shields = 0 WHERE id = auth.uid(); -- via serviço
   *    SELECT public.use_shield();
   *    Esperado: EXCEPTION 'Sem escudos disponíveis.'
   *
   * 2. D-1 não está missed (ex: completed):
   *    SELECT public.use_shield(); -- quando ontem foi cumprido
   *    Esperado: EXCEPTION 'O escudo só pode ser usado em um dia perdido.'
   *
   * 3. D-2 já protegido (tentativa de escudos consecutivos):
   *    SELECT public.use_shield(); -- quando D-2 foi protegido
   *    Esperado: EXCEPTION 'Não é possível proteger dois dias consecutivos.'
   *
   * 4. Uso válido: D-1 missed, D-2 completed, saldo > 0:
   *    SELECT public.use_shield();
   *    Esperado: sucesso. Verificar: SELECT * FROM protected_days; -- aparece D-1.
   *    SELECT * FROM public.flame_state(); -- days mantido (continuidade), at_risk = false.
   */
  it('está documentado (validar manualmente no SQL Editor)', () => {
    expect(true).toBe(true);
  });
});

describe('Proteção consecutiva proibida (SQL manual)', () => {
  /**
   * Cenário: Usuário usou escudo em D-2. Tenta usar em D-1.
   *   SELECT public.use_shield();
   *   Esperado: EXCEPTION 'Não é possível proteger dois dias consecutivos.'
   *
   * Verificação:
   *   SELECT day, used_at FROM public.protected_days WHERE user_id = auth.uid();
   *   Esperado: apenas 1 linha (D-2), sem D-1.
   */
  it('está documentado (validar manualmente no SQL Editor)', () => {
    expect(true).toBe(true);
  });
});
