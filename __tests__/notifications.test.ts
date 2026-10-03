/**
 * __tests__/notifications.test.ts
 *
 * Tests for buildSchedule (pure function) and rescheduleAll idempotence.
 * expo-notifications is fully mocked — no real scheduling happens.
 */

import { buildSchedule, ScheduleInput, rescheduleAll } from '../lib/notifications';
import * as Notifications from 'expo-notifications';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('mock-id'),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: {
    DATE: 'date',
    TIME_INTERVAL: 'timeInterval',
  },
  AndroidImportance: { HIGH: 4 },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a base ScheduleInput with sensible defaults that can be overridden.
 * `today` defaults to a Tuesday (2026-10-06).
 * `now` defaults to 08:00 SP on that day (11:00 UTC).
 */
function makeInput(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  const today = '2026-10-06'; // Tuesday (dow=2)
  // 08:00 America/Sao_Paulo = 11:00 UTC (SP is UTC-3)
  const now = new Date('2026-10-06T11:00:00.000Z');

  // All 7 days have applicable goals by default
  const hasApplicableGoalByDate: Record<string, boolean> = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date('2026-10-06T12:00:00Z');
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    hasApplicableGoalByDate[key] = true;
  }

  return {
    today,
    nickname: 'Atleta',
    streak: 5,
    checkedInToday: false,
    reminderTime: '19:00',
    reminderEnabled: true,
    hasApplicableGoalByDate,
    lightMode: false,
    softModeUntil: null,
    hasPermission: true,
    now,
    ...overrides,
  };
}

/** Extract notifications IDs for a specific date */
function idsForDate(notifs: ReturnType<typeof buildSchedule>, dateStr: string) {
  return notifs.filter((n) => n.id.endsWith(dateStr)).map((n) => n.id);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildSchedule — core rules', () => {
  it('returns at most 2 notifications per day', () => {
    const notifs = buildSchedule(makeInput());
    const byDate: Record<string, number> = {};
    for (const n of notifs) {
      const date = n.id.split('-').slice(1).join('-'); // strip 'daily-' or 'last-'
      byDate[date] = (byDate[date] || 0) + 1;
    }
    for (const count of Object.values(byDate)) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('never schedules a trigger at or after 22:00 SP (except the last-chance itself, which IS at 22:00 — triggers before midnight)', () => {
    const notifs = buildSchedule(makeInput());
    for (const n of notifs) {
      // last-chance fires at 22:00 SP = 01:00 UTC next day (UTC-3)
      // daily fires before 22:00 — nothing should fire at 23:00+ SP
      const hourUTC = n.triggerDate.getUTCHours();
      // 22:00 SP = 01:00 UTC; 23:00 SP = 02:00 UTC — nothing should be later
      if (n.id.startsWith('last-')) {
        // last-chance is at 22:00 SP = 01:00 UTC
        expect(hourUTC).toBe(1);
      } else {
        // daily reminder at 19:00 SP = 22:00 UTC
        expect(hourUTC).toBe(22);
      }
    }
  });

  it('returns empty list for a neutral day (no applicable goals)', () => {
    const notifs = buildSchedule(
      makeInput({
        hasApplicableGoalByDate: { '2026-10-06': false },
      }),
    );
    const todayNotifs = notifs.filter((n) => n.id.includes('2026-10-06'));
    expect(todayNotifs).toHaveLength(0);
  });

  it('does not schedule last-chance when streak is 0', () => {
    const notifs = buildSchedule(makeInput({ streak: 0 }));
    const lastChance = notifs.filter((n) => n.id.startsWith('last-'));
    expect(lastChance).toHaveLength(0);
  });

  it('cancels today notifications when checkedInToday is true', () => {
    const notifs = buildSchedule(makeInput({ checkedInToday: true }));
    const todayIds = idsForDate(notifs, '2026-10-06');
    expect(todayIds).toHaveLength(0);
  });

  it('schedules future days even when checkedInToday is true', () => {
    const notifs = buildSchedule(makeInput({ checkedInToday: true }));
    const tomorrow = idsForDate(notifs, '2026-10-07');
    expect(tomorrow.length).toBeGreaterThan(0);
  });

  it('returns empty list when reminderEnabled is false (both daily and last-chance)', () => {
    const notifs = buildSchedule(makeInput({ reminderEnabled: false }));
    expect(notifs).toHaveLength(0);
  });

  it('returns empty list when hasPermission is false', () => {
    const notifs = buildSchedule(makeInput({ hasPermission: false }));
    expect(notifs).toHaveLength(0);
  });
});

describe('buildSchedule — Modo Leve manual', () => {
  it('removes last-chance but keeps daily reminder when lightMode is true', () => {
    const notifs = buildSchedule(makeInput({ lightMode: true }));
    const daily = notifs.filter((n) => n.id.startsWith('daily-'));
    const last = notifs.filter((n) => n.id.startsWith('last-'));
    expect(daily.length).toBeGreaterThan(0);
    expect(last).toHaveLength(0);
  });
});

describe('buildSchedule — Modo Leve automático (soft_mode_until)', () => {
  it('removes ALL notifications for days whose trigger is before softModeUntil (compare instants)', () => {
    // softModeUntil = end of 2026-10-08 in UTC
    const softModeUntil = '2026-10-09T03:00:00.000Z'; // covers 2026-10-06, 07, 08 in SP
    const notifs = buildSchedule(makeInput({ softModeUntil }));

    // Days 2026-10-06, 07, 08 should have NO notifications (triggers ≤ softModeUntil)
    ['2026-10-06', '2026-10-07', '2026-10-08'].forEach((date) => {
      expect(idsForDate(notifs, date)).toHaveLength(0);
    });
    // Day 2026-10-09+ should still have notifications
    const after = notifs.filter((n) => n.id.includes('2026-10-09'));
    expect(after.length).toBeGreaterThan(0);
  });

  it('does not block days whose trigger is after softModeUntil', () => {
    // softModeUntil is in the past → nothing blocked
    const softModeUntil = '2026-10-01T00:00:00.000Z';
    const notifs = buildSchedule(makeInput({ softModeUntil }));
    expect(notifs.length).toBeGreaterThan(0);
  });
});

describe('buildSchedule — timezone and past-time handling', () => {
  it('skips today daily reminder if reminderTime already passed in SP timezone', () => {
    // now = 20:00 SP (23:00 UTC), reminderTime = 19:00
    // → 19:00 SP is in the past → should skip today's daily
    const now = new Date('2026-10-06T23:00:00.000Z');
    const notifs = buildSchedule(makeInput({ now, reminderTime: '19:00' }));
    const todayDaily = notifs.filter((n) => n.id === 'daily-2026-10-06');
    expect(todayDaily).toHaveLength(0);
  });

  it('schedules future days even if today time passed', () => {
    const now = new Date('2026-10-06T23:00:00.000Z');
    const notifs = buildSchedule(makeInput({ now, reminderTime: '19:00' }));
    const tomorrowDaily = notifs.filter((n) => n.id === 'daily-2026-10-07');
    expect(tomorrowDaily).toHaveLength(1);
  });

  it('handles SP timezone at midnight correctly (no off-by-one day)', () => {
    // now = 23:00 SP on 2026-10-06 = 02:00 UTC on 2026-10-07
    const now = new Date('2026-10-07T02:00:00.000Z');
    const notifs = buildSchedule(makeInput({ now, today: '2026-10-06' }));
    // Tomorrow (2026-10-07) should still be in schedule
    const next = notifs.filter((n) => n.id === 'daily-2026-10-07');
    expect(next.length).toBeGreaterThan(0);
  });

  it('uses the injected `now` and never reads Date.now() internally', () => {
    // Use a very old `now` — all 7 days should be scheduled
    const now = new Date('2000-01-01T00:00:00.000Z');
    const notifs = buildSchedule(makeInput({ now }));
    // 7 days × up to 2 = up to 14 but at minimum 7 (daily only with streak>0 + no checkin)
    expect(notifs.length).toBeGreaterThanOrEqual(7);
  });
});

describe('buildSchedule — notification texts', () => {
  it('includes nickname in daily body', () => {
    const notifs = buildSchedule(makeInput({ nickname: 'hulk' }));
    const daily = notifs.find((n) => n.id === 'daily-2026-10-06');
    expect(daily?.content.body).toContain('hulk');
  });

  it('includes streak count in today last-chance body', () => {
    const notifs = buildSchedule(makeInput({ streak: 7 }));
    const last = notifs.find((n) => n.id === 'last-2026-10-06');
    expect(last?.content.body).toContain('7');
  });

  it('omits streak count in future last-chance body', () => {
    const notifs = buildSchedule(makeInput({ streak: 7 }));
    const last = notifs.find((n) => n.id === 'last-2026-10-07');
    expect(last?.content.body).not.toContain('7');
    expect(last?.content.body).toContain('apaga em 2h');
  });
});

describe('rescheduleAll — idempotence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset module-level debounce/queue state by using fake timers
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calling rescheduleAll twice cancels all and schedules once (debounced)', async () => {
    const input = makeInput();

    // Call twice rapidly
    rescheduleAll(input);
    rescheduleAll(input);

    // Advance past the 500ms debounce
    await jest.runAllTimersAsync();

    // cancelAll should have been called exactly once (debounced second call wins)
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  it('scheduling the same input twice results in same number of scheduleNotificationAsync calls', async () => {
    const input = makeInput();

    rescheduleAll(input);
    await jest.runAllTimersAsync();
    const firstCallCount = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.length;

    jest.clearAllMocks();

    rescheduleAll(input);
    await jest.runAllTimersAsync();
    const secondCallCount = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.length;

    expect(firstCallCount).toBe(secondCallCount);
  });
});
