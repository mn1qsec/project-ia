import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Alert, Platform } from 'react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { DaySelector } from '../../components/ui/DaySelector';
import { Colors } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import {
  rescheduleAll,
  requestPermissionAfterCheckin,
  getPermissionStatus,
} from '../../lib/notifications';

type Goal = { id: string; title: string; days_of_week: number[]; is_active: boolean };

export default function TodayScreen() {
  const { user, profile, loadSession } = useAppStore();
  const [today, setToday] = useState('');
  const [streak, setStreak] = useState(0);
  const [dayStatus, setDayStatus] = useState<string>('pending');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [completions, setCompletions] = useState<string[]>([]); // array of goal_ids completed today

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDays, setGoalDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Helpers to build reschedule input from current state + fresh server data
  // ---------------------------------------------------------------------------
  const triggerReschedule = useCallback(
    async (todayStr: string, currentStreak: number, checkedIn: boolean) => {
      if (Platform.OS === 'web' || !profile || !user) return;

      const permission = await getPermissionStatus();
      const hasPermission = permission === 'granted';

      // Build applicable-goals map for next 7 days
      let hasApplicableGoalByDate: Record<string, boolean> = {};
      try {
        const { data: goalRows } = await supabase
          .from('goals')
          .select('days_of_week, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true);

        if (goalRows) {
          for (let i = 0; i < 7; i++) {
            const d = new Date(`${todayStr}T12:00:00`);
            d.setDate(d.getDate() + i);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const dow = d.getDay();
            hasApplicableGoalByDate[dateStr] = goalRows.some((g) =>
              g.days_of_week.includes(dow),
            );
          }
        }
      } catch (e) {
        console.error('[TodayScreen] reschedule error:', e);
      }

      rescheduleAll({
        today: todayStr,
        nickname: profile.nickname || profile.username || 'Você',
        streak: currentStreak,
        checkedInToday: checkedIn,
        reminderTime: profile.reminder_time?.substring(0, 5) || '19:00',
        reminderEnabled: profile.reminder_enabled ?? false,
        hasApplicableGoalByDate,
        lightMode: profile.light_mode ?? false,
        softModeUntil: profile.soft_mode_until ?? null,
        hasPermission,
        now: new Date(),
      });
    },
    [profile, user],
  );

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  const loadTodayInfo = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: todayData } = await supabase.rpc('get_today');
      if (todayData) setToday(todayData);

      const { data: flameData } = await supabase.rpc('flame_state');
      if (flameData && flameData[0]) {
        setStreak(flameData[0].days);
      }

      if (todayData) {
        const { data: statusData } = await supabase.rpc('day_status', { p_user_id: user.id, p_date: todayData });
        if (statusData) setDayStatus(statusData);
      }

      await loadGoals(todayData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadGoals = async (currentDate: string) => {
    if (!user || !currentDate) return;
    const { data: allGoals } = await supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: true });
    if (allGoals) setGoals(allGoals);

    const { data: comps } = await supabase.from('goal_completions').select('goal_id').eq('user_id', user.id).eq('date', currentDate);
    if (comps) setCompletions(comps.map(c => c.goal_id));
  };

  useEffect(() => {
    loadTodayInfo();
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  const handleCompleteGoal = async (goalId: string) => {
    try {
      const { error } = await supabase.rpc('complete_goal', { p_goal_id: goalId });
      if (error) throw error;
      await loadGoals(today);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    }
  };

  const handleCheckin = async () => {
    try {
      const { error } = await supabase.rpc('do_checkin');
      if (error) throw error;

      // Refresh state
      await loadTodayInfo();

      // Request notification permission once after first check-in (if not yet asked)
      const granted = await requestPermissionAfterCheckin();

      // Reschedule with updated state: checked-in today + fresh streak
      const { data: flameData } = await supabase.rpc('flame_state');
      const newStreak = flameData?.[0]?.days ?? streak;
      await triggerReschedule(today, newStreak, true);

      // Refresh profile (streak display, etc.)
      if (granted) {
        await loadSession();
      }
    } catch (e: any) {
      Alert.alert('Erro no Check-in', e.message);
    }
  };

  const openModal = (goal?: Goal) => {
    if (goal) {
      setEditingGoal(goal);
      setGoalTitle(goal.title);
      setGoalDays(goal.days_of_week || [0, 1, 2, 3, 4, 5, 6]);
    } else {
      setEditingGoal(null);
      setGoalTitle('');
      setGoalDays([0, 1, 2, 3, 4, 5, 6]);
    }
    setModalVisible(true);
  };

  const saveGoal = async () => {
    if (!goalTitle.trim()) return Alert.alert('Erro', 'Dê um nome para a meta.');
    if (goalDays.length === 0) return Alert.alert('Erro', 'Selecione pelo menos 1 dia.');
    setSaving(true);
    try {
      if (editingGoal) {
        const { error } = await supabase.rpc('update_goal', {
          p_goal_id: editingGoal.id,
          p_title: goalTitle,
          p_days: goalDays
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('create_goal', {
          p_title: goalTitle,
          p_days: goalDays
        });
        if (error) throw error;
      }
      setModalVisible(false);
      await loadTodayInfo();
      // Goals changed → reschedule
      await triggerReschedule(today, streak, dayStatus === 'completed');
    } catch (e: any) {
      Alert.alert('Erro ao salvar', e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleGoalActive = async (goalId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase.rpc('update_goal', {
        p_goal_id: goalId,
        p_is_active: !currentActive
      });
      if (error) throw error;
      await loadTodayInfo();
      // Goal active status changed → reschedule
      await triggerReschedule(today, streak, dayStatus === 'completed');
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    }
  };

  const todayDow = today ? new Date(today + 'T12:00:00').getDay() : -1;
  const activeTodayGoals = goals.filter(g => g.is_active && g.days_of_week.includes(todayDow));

  return (
    <Screen scrollable={false}>
      <View style={styles.header}>
        <Text style={styles.dateText}>{today ? `Hoje: ${today}` : 'Carregando...'}</Text>
        <View style={styles.streakBadge}>
          <Text style={styles.streakText}>{streak}</Text>
          <Text style={styles.fireIcon}>🔥</Text>
        </View>
      </View>
      
      {dayStatus === 'neutral' ? (
        <View style={styles.neutralContainer}>
          <Text style={{fontSize: 40}}>🌴</Text>
          <Text style={styles.neutralTitle}>Dia de descanso</Text>
          <Text style={styles.neutralDesc}>Nenhuma meta está programada para hoje. Aproveite o descanso e recarregue as energias!</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.title}>Minhas Metas de Hoje</Text>
          {loading ? <Text style={{color: Colors.textMuted}}>Carregando...</Text> : (
            <FlatList
              data={activeTodayGoals}
              keyExtractor={item => item.id}
              contentContainerStyle={{paddingBottom: 20}}
              ListEmptyComponent={<Text style={{color: Colors.textMuted, textAlign: 'center', marginTop: 20}}>Nenhuma meta para hoje.</Text>}
              renderItem={({ item }) => {
                const isCompleted = completions.includes(item.id);
                return (
                  <View style={styles.goalCard}>
                    <Text style={[styles.goalTitle, isCompleted && styles.goalCompleted]}>{item.title}</Text>
                    {!isCompleted ? (
                      <Button title="Feito" onPress={() => handleCompleteGoal(item.id)} style={styles.doneBtn} />
                    ) : (
                      <Text style={{color: Colors.accent, fontWeight: 'bold'}}>✓ Feito</Text>
                    )}
                  </View>
                );
              }}
            />
          )}

          {dayStatus === 'pending' && activeTodayGoals.length > 0 && activeTodayGoals.every(g => completions.includes(g.id)) && (
            <Button title="FINALIZAR CHECK-IN" onPress={handleCheckin} style={{marginTop: 16}} />
          )}
          {dayStatus === 'completed' && (
            <Text style={styles.completedDayText}>🎉 Check-in do dia concluído!</Text>
          )}
        </View>
      )}

      <View style={{marginTop: 16}}>
        <Button title="Gerenciar Todas as Metas" variant="secondary" onPress={() => openModal()} />
      </View>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <Text style={styles.title}>{editingGoal ? 'Editar Meta' : 'Nova Meta'}</Text>
          
          <Input 
            placeholder="Ex: Treinar" 
            value={goalTitle} 
            onChangeText={setGoalTitle} 
          />
          
          <Text style={styles.label}>Dias da semana:</Text>
          <DaySelector selectedDays={goalDays} onChange={setGoalDays} />

          <Button title="Salvar" onPress={saveGoal} loading={saving} style={{marginTop: 16}} />
          <Button title="Fechar" variant="secondary" onPress={() => setModalVisible(false)} />

          <View style={styles.divider} />

          <Text style={styles.title}>Todas as metas:</Text>
          <FlatList
            data={goals}
            keyExtractor={item => item.id}
            renderItem={({item}) => (
              <View style={styles.manageGoalCard}>
                <View style={{flex: 1}}>
                  <Text style={[styles.goalTitle, !item.is_active && {color: Colors.textMuted, textDecorationLine: 'line-through'}]}>{item.title}</Text>
                  <Text style={{color: Colors.textMuted, fontSize: 12}}>Dias: {item.days_of_week.length}</Text>
                </View>
                <TouchableOpacity style={styles.editIcon} onPress={() => openModal(item)}>
                  <Text style={{color: Colors.accent}}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.editIcon, {marginLeft: 8}]} onPress={() => toggleGoalActive(item.id, item.is_active)}>
                  <Text style={{color: item.is_active ? '#D32F2F' : Colors.accent}}>{item.is_active ? 'Pausar' : 'Ativar'}</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  dateText: {
    fontSize: 18,
    color: Colors.textMuted,
    fontWeight: 'bold',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  streakText: {
    color: Colors.accent,
    fontWeight: 'bold',
    fontSize: 16,
    marginRight: 4,
  },
  fireIcon: {
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  goalCard: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  goalTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  goalCompleted: {
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  doneBtn: {
    height: 40,
    minWidth: 80,
    marginVertical: 0,
  },
  neutralContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  neutralTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.accent,
    marginTop: 16,
    marginBottom: 8,
  },
  neutralDesc: {
    color: Colors.textMuted,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
  },
  completedDayText: {
    color: Colors.accent,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 24,
  },
  label: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 24,
  },
  manageGoalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  editIcon: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  }
});
