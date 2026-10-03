import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, Linking, Platform } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Screen } from '../../components/ui/Screen';
import { Colors } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';
import {
  rescheduleAll,
  getPermissionStatus,
  scheduleTestNotification,
} from '../../lib/notifications';

export default function ProfileScreen() {
  const { user, profile, signOut, loadSession } = useAppStore();
  const [editingNick, setEditingNick] = useState(false);
  const [newNick, setNewNick] = useState(profile?.nickname || '');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Reminders state (mirrors profile)
  const [editingReminder, setEditingReminder] = useState(false);
  const [reminderTime, setReminderTime] = useState(profile?.reminder_time?.substring(0, 5) || '19:00');
  const [reminderEnabled, setReminderEnabled] = useState(profile?.reminder_enabled ?? true);

  // Light mode (local toggle — updates profiles.light_mode)
  const [lightMode, setLightMode] = useState(profile?.light_mode ?? false);

  // Permission status
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  useEffect(() => {
    if (Platform.OS !== 'web') {
      getPermissionStatus().then(setPermissionStatus);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const buildRescheduleInput = async () => {
    if (!profile || !user) return null;

    const permission = await getPermissionStatus();
    const hasPermission = permission === 'granted';

    let today = '';
    let streak = profile.current_streak;
    let checkedInToday = false;
    let hasApplicableGoalByDate: Record<string, boolean> = {};

    try {
      const { data: todayData } = await supabase.rpc('get_today');
      if (todayData) today = todayData;

      const { data: flameData } = await supabase.rpc('flame_state');
      if (flameData?.[0]) streak = flameData[0].days;

      if (today) {
        const { data: status } = await supabase.rpc('day_status', {
          p_user_id: user.id,
          p_date: today,
        });
        checkedInToday = status === 'completed';

        const { data: goals } = await supabase
          .from('goals')
          .select('days_of_week, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (goals) {
          for (let i = 0; i < 7; i++) {
            const d = new Date(`${today}T12:00:00`);
            d.setDate(d.getDate() + i);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const dow = d.getDay();
            hasApplicableGoalByDate[dateStr] = goals.some((g) =>
              g.days_of_week.includes(dow),
            );
          }
        }
      }
    } catch (e) {
      console.error('[Profile] reschedule fetch error:', e);
    }

    if (!today) return null;

    return {
      today,
      nickname: profile.nickname || profile.username || 'Você',
      streak,
      checkedInToday,
      reminderTime: reminderTime,
      reminderEnabled,
      hasApplicableGoalByDate,
      lightMode,
      softModeUntil: profile.soft_mode_until ?? null,
      hasPermission,
      now: new Date(),
    };
  };

  // ---------------------------------------------------------------------------
  // Nickname
  // ---------------------------------------------------------------------------
  const handleSaveNick = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc('set_nickname', { p_nickname: newNick });
      if (error) {
        setErrorMsg(error.message.includes('apelido já está em uso') ? 'Este apelido já está em uso' : error.message);
      } else {
        setErrorMsg('');
        setEditingNick(false);
        await loadSession();
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Ranking visibility
  // ---------------------------------------------------------------------------
  const toggleRanking = async (value: boolean) => {
    if (!profile) return;
    try {
      await supabase.from('profiles').update({ show_in_ranking: value }).eq('id', profile.id);
      await loadSession();
    } catch (e) {
      console.error(e);
    }
  };

  // ---------------------------------------------------------------------------
  // Reminders
  // ---------------------------------------------------------------------------
  const handleSaveReminders = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      await supabase.rpc('update_reminder_settings', {
        p_enabled: reminderEnabled,
        p_time: `${reminderTime}:00`,
      });
      await loadSession();

      const input = await buildRescheduleInput();
      if (input) rescheduleAll(input);

      setEditingReminder(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Light mode toggle (writes light_mode only; soft_mode_* is server-only)
  // ---------------------------------------------------------------------------
  const handleLightModeToggle = async (value: boolean) => {
    if (!profile) return;
    setLightMode(value);
    try {
      await supabase.from('profiles').update({ light_mode: value }).eq('id', profile.id);
      await loadSession();

      const input = await buildRescheduleInput();
      if (input) {
        // Override light_mode with new value since profile may not have refreshed yet
        rescheduleAll({ ...input, lightMode: value });
      }
    } catch (e) {
      console.error('[Profile] light mode update error:', e);
      setLightMode(!value); // revert on error
    }
  };

  // ---------------------------------------------------------------------------
  // Permission: open system settings
  // ---------------------------------------------------------------------------
  const openSystemSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Screen scrollable>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.nickname?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </View>
        <Text style={styles.name}>{profile?.nickname || profile?.username || 'Sem apelido'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      {/* ── Ranking ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ranking Global</Text>
        
        {editingNick ? (
          <View style={styles.nickForm}>
            <Input 
              placeholder="Novo apelido" 
              value={newNick} 
              onChangeText={(t) => {setNewNick(t); setErrorMsg('');}}
              autoCapitalize="none"
              error={errorMsg}
            />
            <Button title="Salvar" onPress={handleSaveNick} loading={loading} />
            <Button title="Cancelar" variant="secondary" onPress={() => {setEditingNick(false); setNewNick(profile?.nickname||'');}} style={{marginTop: 8}}/>
          </View>
        ) : (
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Apelido: <Text style={{color: Colors.accent}}>{profile?.nickname || 'Não definido'}</Text></Text>
            <Button title="Mudar" variant="secondary" onPress={() => setEditingNick(true)} />
          </View>
        )}

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Aparecer no ranking</Text>
          <Switch 
            value={profile?.show_in_ranking ?? true} 
            onValueChange={toggleRanking} 
            trackColor={{ false: '#333', true: Colors.accent }}
          />
        </View>
      </View>

      {/* ── Lembretes ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Lembretes</Text>

        {editingReminder ? (
          <View style={styles.nickForm}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Ativar Lembretes</Text>
              <Switch 
                value={reminderEnabled} 
                onValueChange={setReminderEnabled}
                trackColor={{ true: Colors.accent }}
              />
            </View>
            
            {reminderEnabled && (
              <Input 
                placeholder="Ex: 19:00" 
                value={reminderTime} 
                onChangeText={setReminderTime}
                keyboardType="numeric"
                maxLength={5}
              />
            )}
            
            <Button title="Salvar Lembretes" onPress={handleSaveReminders} loading={loading} />
            <Button title="Cancelar" variant="secondary" onPress={() => {
              setEditingReminder(false); 
              setReminderTime(profile?.reminder_time?.substring(0, 5) || '19:00');
              setReminderEnabled(profile?.reminder_enabled ?? true);
            }} style={{marginTop: 8}}/>
          </View>
        ) : (
          <View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Lembretes: <Text style={{color: Colors.accent}}>{profile?.reminder_enabled ? 'Ativados' : 'Desativados'}</Text></Text>
              <Button title="Editar" variant="secondary" onPress={() => setEditingReminder(true)} />
            </View>
            {profile?.reminder_enabled && (
              <Text style={{color: Colors.textMuted, marginBottom: 8}}>Horário: {profile?.reminder_time?.substring(0, 5)}</Text>
            )}
          </View>
        )}

        {/* Permission status */}
        {Platform.OS !== 'web' && (
          <View style={styles.permissionRow}>
            {permissionStatus === 'granted' ? (
              <Text style={styles.permissionOk}>✅ Permissão de notificação concedida</Text>
            ) : (
              <View style={styles.permissionDenied}>
                <Text style={styles.permissionDeniedText}>⚠️ Notificações bloqueadas</Text>
                <TouchableOpacity onPress={openSystemSettings}>
                  <Text style={styles.settingsLink}>Abrir Configurações</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Modo Leve manual */}
        <View style={[styles.settingRow, {marginTop: 12}]}>
          <View style={{flex: 1}}>
            <Text style={styles.settingLabel}>Modo Leve</Text>
            <Text style={{color: Colors.textMuted, fontSize: 12, marginTop: 2}}>
              Remove o lembrete de "última chance" (22h). O lembrete diário continua.
            </Text>
          </View>
          <Switch
            value={lightMode}
            onValueChange={handleLightModeToggle}
            trackColor={{ true: Colors.accent }}
          />
        </View>

        {/* DEV: test notification button */}
        {__DEV__ && (
          <Button
            title="🔔 Disparar notificação em 10s (DEV)"
            variant="secondary"
            onPress={() => scheduleTestNotification(profile?.nickname || profile?.username || 'Você')}
            style={{marginTop: 12}}
          />
        )}
      </View>

      <View style={styles.actions}>
        <Button 
          title="Sair da Conta" 
          variant="danger" 
          onPress={signOut} 
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: Colors.accent,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  email: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  section: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingLabel: {
    color: Colors.text,
    fontSize: 16,
  },
  nickForm: {
    marginBottom: 16,
  },
  permissionRow: {
    marginTop: 4,
    marginBottom: 4,
  },
  permissionOk: {
    color: '#4CAF50',
    fontSize: 13,
  },
  permissionDenied: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  permissionDeniedText: {
    color: '#FFA726',
    fontSize: 13,
  },
  settingsLink: {
    color: Colors.accent,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  actions: {
    flex: 1,
    justifyContent: 'flex-end',
    marginBottom: 20,
  },
});
