import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '../../components/ui/Screen';
import { Colors } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';
import { FlameAnimation } from '../../components/FlameAnimation';

export default function TodayScreen() {
  const [today, setToday] = useState('');
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    async function loadTodayInfo() {
      // Fetch server today date
      const { data: todayData } = await supabase.rpc('get_today');
      if (todayData) {
        setToday(todayData);
      }

      // Fetch streak
      const { data: streakData } = await supabase.rpc('get_streak');
      if (streakData && streakData[0]) {
        setStreak(streakData[0].current_streak);
      }
    }
    loadTodayInfo();
  }, []);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.dateText}>{today ? `Hoje: ${today}` : 'Carregando...'}</Text>
        <View style={styles.streakBadge}>
          <Text style={styles.streakText}>{streak}</Text>
          <Text style={styles.fireIcon}>🔥</Text>
        </View>
      </View>
      
      <View style={styles.content}>
        <Text style={styles.title}>Minhas Metas</Text>
        <Text style={{color: Colors.textMuted}}>A lógica de metas será implementada na próxima etapa.</Text>
      </View>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  }
});
