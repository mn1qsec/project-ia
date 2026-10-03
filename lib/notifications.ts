import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SP_TZ = 'America/Sao_Paulo';
const MAX_DAYS = 7;
const LAST_CHANCE_HOUR = 22; // 22:00 SP — "última chance"
const PERMISSION_ASKED_KEY = 'notifications_permission_asked';

// ---------------------------------------------------------------------------
// Notification handler (must be set at module level)
// ---------------------------------------------------------------------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ScheduleInput {
  /** Server date string 'YYYY-MM-DD' from get_today() */
  today: string;
  nickname: string;
  streak: number;
  checkedInToday: boolean;
  /** 'HH:MM' in São Paulo time */
  reminderTime: string;
  reminderEnabled: boolean;
  /** Map: 'YYYY-MM-DD' → true if that date has at least one applicable goal */
  hasApplicableGoalByDate: Record<string, boolean>;
  /** Manual light mode: keeps daily reminder, removes last-chance */
  lightMode: boolean;
  /** Auto soft mode: ISO string (timestamptz). If now < softModeUntil → skip ALL */
  softModeUntil: string | null;
  hasPermission: boolean;
  /** Injected clock — never reads Date.now() internally */
  now: Date;
}

interface ScheduledNotification {
  id: string;
  content: { title: string; body: string; channelId?: string };
  /** UTC Date to trigger */
  triggerDate: Date;
}

// ---------------------------------------------------------------------------
// Pure function: build the notification schedule
// ---------------------------------------------------------------------------
export function buildSchedule(input: ScheduleInput): ScheduledNotification[] {
  const {
    today,
    nickname,
    streak,
    checkedInToday,
    reminderTime,
    reminderEnabled,
    hasApplicableGoalByDate,
    lightMode,
    softModeUntil,
    hasPermission,
    now,
  } = input;

  // If reminders are disabled or no permission → return empty (both types)
  if (!reminderEnabled || !hasPermission) return [];

  const [remH, remM] = reminderTime.split(':').map(Number);
  const result: ScheduledNotification[] = [];

  // Soft mode until boundary as a timestamp (compare instants, not dates)
  const softModeUntilDate = softModeUntil ? new Date(softModeUntil) : null;

  for (let i = 0; i < MAX_DAYS; i++) {
    // Compute the calendar date in SP timezone for this offset
    const todayInSP = toZonedTime(new Date(`${today}T12:00:00`), SP_TZ);
    const targetInSP = new Date(todayInSP);
    targetInSP.setDate(todayInSP.getDate() + i);

    const yyyy = targetInSP.getFullYear();
    const mm = String(targetInSP.getMonth() + 1).padStart(2, '0');
    const dd = String(targetInSP.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // Rule 4: neutral day (no applicable goal) → skip entirely
    if (!hasApplicableGoalByDate[dateStr]) continue;

    // ── DAILY REMINDER (daily-YYYY-MM-DD) ──────────────────────────────────
    // Build the trigger instant: reminderTime on dateStr in SP tz
    const dailyInSP = new Date(
      targetInSP.getFullYear(),
      targetInSP.getMonth(),
      targetInSP.getDate(),
      remH,
      remM,
      0,
      0,
    );
    const dailyUTC = fromZonedTime(dailyInSP, SP_TZ);

    // Rule 7b (auto soft mode): compare UTC instants
    const blockedBySoftMode = softModeUntilDate !== null && dailyUTC <= softModeUntilDate;

    if (!blockedBySoftMode) {
      // Rule 3: never schedule in the past
      if (dailyUTC > now) {
        // Rule 5: if today and already checked in → skip
        const isToday = i === 0;
        if (!(isToday && checkedInToday)) {
          result.push({
            id: `daily-${dateStr}`,
            content: {
              title: 'Gym Streak 🔥',
              body: `${nickname}, seu check-in de hoje tá aberto.`,
              channelId: 'reminders',
            },
            triggerDate: dailyUTC,
          });
        }
      }
    }

    // ── LAST CHANCE (last-YYYY-MM-DD) at 22:00 SP ───────────────────────────
    const lastInSP = new Date(
      targetInSP.getFullYear(),
      targetInSP.getMonth(),
      targetInSP.getDate(),
      LAST_CHANCE_HOUR,
      0,
      0,
      0,
    );
    const lastUTC = fromZonedTime(lastInSP, SP_TZ);

    // Rule 7b: auto soft mode blocks this too (all notifications in period)
    const blockedBySoftModeLast = softModeUntilDate !== null && lastUTC <= softModeUntilDate;

    if (!blockedBySoftModeLast) {
      // Rule 2: streak 0 → no last chance
      if (streak > 0) {
        // Rule 3: never in the past
        if (lastUTC > now) {
          // Rule 5: today + checked in → skip
          const isToday = i === 0;
          if (!(isToday && checkedInToday)) {
            // Rule 7a: manual light mode → skip last-chance only
            if (!lightMode) {
              // Body: for future days omit the number (streak may change)
              const body =
                i === 0
                  ? `${nickname}, sua chama de ${streak} dias apaga em 2h.`
                  : `${nickname}, sua chama apaga em 2h.`;

              result.push({
                id: `last-${dateStr}`,
                content: {
                  title: 'Gym Streak ⚠️',
                  body,
                  channelId: 'reminders',
                },
                triggerDate: lastUTC,
              });
            }
          }
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Android notification channel setup
// ---------------------------------------------------------------------------
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Lembretes',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF4500',
  });
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------
export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  if (Platform.OS === 'web') return 'denied';
  const { status } = await Notifications.getPermissionsAsync();
  return status as 'granted' | 'denied' | 'undetermined';
}

/**
 * Request permission exactly once, after the first successful check-in.
 * Uses AsyncStorage to track whether we already asked.
 * Returns whether permission is granted.
 */
export async function requestPermissionAfterCheckin(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const alreadyAsked = await AsyncStorage.getItem(PERMISSION_ASKED_KEY);
  if (alreadyAsked === 'true') {
    // Already asked — just return current status
    const status = await getPermissionStatus();
    return status === 'granted';
  }

  await AsyncStorage.setItem(PERMISSION_ASKED_KEY, 'true');
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

// ---------------------------------------------------------------------------
// rescheduleAll — serial queue with debounce
// ---------------------------------------------------------------------------
let _rescheduleTimer: ReturnType<typeof setTimeout> | null = null;
let _rescheduleRunning = false;
let _reschedulePending = false;

/**
 * Cancel all scheduled notifications and re-schedule based on buildSchedule.
 * Debounced 500ms; serialized so only one execution runs at a time.
 * IDs are deterministic (daily-YYYY-MM-DD / last-YYYY-MM-DD) → idempotent.
 */
export function rescheduleAll(input: ScheduleInput): void {
  if (Platform.OS === 'web') return;

  // Debounce: reset timer on every call
  if (_rescheduleTimer) clearTimeout(_rescheduleTimer);
  _rescheduleTimer = setTimeout(() => _executeReschedule(input), 500);
}

async function _executeReschedule(input: ScheduleInput): Promise<void> {
  if (_rescheduleRunning) {
    // Mark that another run is needed after current finishes
    _reschedulePending = true;
    return;
  }

  _rescheduleRunning = true;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const notifications = buildSchedule(input);
    for (const notif of notifications) {
      await Notifications.scheduleNotificationAsync({
        identifier: notif.id,
        content: notif.content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: notif.triggerDate,
        },
      });
    }
  } catch (err) {
    console.error('[rescheduleAll] error:', err);
  } finally {
    _rescheduleRunning = false;
    if (_reschedulePending) {
      _reschedulePending = false;
      await _executeReschedule(input);
    }
  }
}

// ---------------------------------------------------------------------------
// DEV ONLY: schedule a test notification in 10 seconds
// ---------------------------------------------------------------------------
export async function scheduleTestNotification(nickname: string): Promise<void> {
  if (!__DEV__) return;
  await Notifications.scheduleNotificationAsync({
    identifier: 'dev-test',
    content: {
      title: 'Gym Streak 🔥 (TESTE)',
      body: `${nickname}, notificação de teste disparada!`,
      channelId: 'reminders',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 10,
    },
  });
}
