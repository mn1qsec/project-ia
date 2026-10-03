import { Stack, useRouter, useSegments } from 'expo-router';
import { Colors } from '../constants/Colors';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { View, ActivityIndicator, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import {
  setupNotificationChannel,
  rescheduleAll,
  getPermissionStatus,
} from '../lib/notifications';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const { session, profile, initialized, loadSession } = useAppStore();
  const segments = useSegments();
  const router = useRouter();
  const notifListenerRef = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    loadSession();
    if (Platform.OS !== 'web') {
      setupNotificationChannel();
    }
  }, []);

  // Tap on notification → navigate to Today screen (only when session active + onboarded)
  useEffect(() => {
    if (Platform.OS === 'web') return;

    notifListenerRef.current = Notifications.addNotificationResponseReceivedListener(() => {
      // Only navigate if the user is authenticated and has finished onboarding
      if (session && profile?.onboarded) {
        router.replace('/(tabs)');
      }
    });

    return () => {
      notifListenerRef.current?.remove();
    };
  }, [session, profile]);

  // Reschedule when profile loads (app open)
  useEffect(() => {
    if (!profile?.onboarded || Platform.OS === 'web') return;

    (async () => {
      const permission = await getPermissionStatus();
      const hasPermission = permission === 'granted';

      // Fetch server today + applicable goals for next 7 days
      let today = '';
      let hasApplicableGoalByDate: Record<string, boolean> = {};
      let streak = profile.current_streak;
      let checkedInToday = false;

      try {
        const { data: todayData } = await supabase.rpc('get_today');
        if (todayData) today = todayData;

        const { data: flameData } = await supabase.rpc('flame_state');
        if (flameData?.[0]) {
          streak = flameData[0].days;
        }

        if (today && session?.user) {
          const { data: status } = await supabase.rpc('day_status', {
            p_user_id: session.user.id,
            p_date: today,
          });
          checkedInToday = status === 'completed';

          // Build applicable-goals map for next 7 days
          const { data: goals } = await supabase
            .from('goals')
            .select('days_of_week, is_active')
            .eq('user_id', session.user.id)
            .eq('is_active', true);

          if (goals) {
            for (let i = 0; i < 7; i++) {
              const d = new Date(`${today}T12:00:00`);
              d.setDate(d.getDate() + i);
              const yyyy = d.getFullYear();
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              const dd = String(d.getDate()).padStart(2, '0');
              const dateStr = `${yyyy}-${mm}-${dd}`;
              // JS getDay() returns 0=Sun…6=Sat — matches our days_of_week
              const dow = d.getDay();
              hasApplicableGoalByDate[dateStr] = goals.some((g) =>
                g.days_of_week.includes(dow),
              );
            }
          }
        }
      } catch (e) {
        console.error('[_layout] reschedule fetch error:', e);
      }

      if (!today) return;

      rescheduleAll({
        today,
        nickname: profile.nickname || profile.username || 'Você',
        streak,
        checkedInToday,
        reminderTime: profile.reminder_time?.substring(0, 5) || '19:00',
        reminderEnabled: profile.reminder_enabled ?? false,
        hasApplicableGoalByDate,
        lightMode: profile.light_mode ?? false,
        softModeUntil: profile.soft_mode_until ?? null,
        hasPermission,
        now: new Date(),
      });
    })();
  }, [profile]);

  // Navigation guard
  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session) {
      if (profile && !profile.onboarded && !inOnboarding) {
        router.replace('/onboarding');
      } else if (profile && profile.onboarded && (inAuthGroup || inOnboarding)) {
        router.replace('/(tabs)');
      } else if (!profile && inAuthGroup) {
        router.replace('/(tabs)');
      }
    }
  }, [session, profile, initialized, segments]);

  if (!initialized) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
      </Stack>
    </>
  );
}
