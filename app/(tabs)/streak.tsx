import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Screen } from '../../components/ui/Screen';
import { Colors } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';
import { FlameAnimation } from '../../components/FlameAnimation';
import { MilestoneModal } from '../../components/MilestoneModal';
import { buildMonthGrid, nextMilestone, MonthDay } from '../../lib/streak-logic';

export default function StreakScreen() {
  const [streakInfo, setStreakInfo] = useState({ current_streak: 0, longest_streak: 0 });
  const [loading, setLoading] = useState(true);
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [grid, setGrid] = useState<MonthDay[]>([]);
  
  const [showMilestone, setShowMilestone] = useState(false);

  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch streak stats
    const { data: streakData } = await supabase.rpc('get_streak');
    if (streakData && streakData[0]) {
      setStreakInfo(streakData[0]);
      
      // Check if just hit a milestone (for demo purposes, normally you'd check this after check-in)
      const milestones = [7, 14, 30, 60, 100, 365];
      if (milestones.includes(streakData[0].current_streak)) {
        // setShowMilestone(true); 
        // We'll leave this commented out otherwise it triggers every time they visit the tab
      }
    }

    // Fetch today
    const { data: todayData } = await supabase.rpc('get_today');
    const todayStr = todayData || new Date().toISOString().split('T')[0];

    // Fetch checkins for the current month view
    const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    
    const { data: checkins } = await supabase
      .from('daily_checkins')
      .select('date')
      .gte('date', startOfMonth.toISOString().split('T')[0])
      .lte('date', endOfMonth.toISOString().split('T')[0]);

    const checkinDates = checkins?.map(c => c.date) || [];
    
    const monthGrid = buildMonthGrid(currentMonth, checkinDates, todayStr);
    setGrid(monthGrid);
    
    setLoading(false);
  };

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentMonth(newDate);
  };

  const milestone = nextMilestone(streakInfo.current_streak);
  const progressPercent = (streakInfo.current_streak / milestone.next) * 100;

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  return (
    <Screen scrollable>
      <MilestoneModal 
        visible={showMilestone} 
        streak={streakInfo.current_streak} 
        onClose={() => setShowMilestone(false)} 
      />

      <View style={styles.header}>
        <Text style={styles.title}>Seu Streak</Text>
      </View>

      <FlameAnimation streak={streakInfo.current_streak} />

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{streakInfo.current_streak}</Text>
          <Text style={styles.statLabel}>Dias Atuais</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{streakInfo.longest_streak}</Text>
          <Text style={styles.statLabel}>Recorde</Text>
        </View>
      </View>

      {streakInfo.current_streak === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Seu streak começa no primeiro check-in!</Text>
        </View>
      ) : (
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            Faltam {milestone.left} dias para a marca de {milestone.next}!
          </Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
        </View>
      )}

      <View style={styles.calendarContainer}>
        <View style={styles.calendarHeader}>
          <TouchableOpacity onPress={() => changeMonth(-1)}>
            <Text style={styles.navText}>{"<"}</Text>
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </Text>
          <TouchableOpacity onPress={() => changeMonth(1)}>
            <Text style={styles.navText}>{">"}</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.weekdays}>
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
            <Text key={i} style={styles.weekdayText}>{d}</Text>
          ))}
        </View>

        <View style={styles.grid}>
          {grid.map((day, index) => {
            let bgColor = 'transparent';
            let textColor = Colors.text;
            let borderColor = 'transparent';

            if (day.status === 'checkin') {
              bgColor = Colors.success;
              textColor = '#FFF';
            } else if (day.status === 'hoje_pendente') {
              borderColor = Colors.accent;
            } else if (day.status === 'perdido') {
              bgColor = '#333';
              textColor = '#666';
            }

            if (!day.isCurrentMonth) {
              textColor = '#444';
            }

            return (
              <View 
                key={index} 
                style={[
                  styles.dayCell, 
                  { backgroundColor: bgColor, borderColor, borderWidth: borderColor !== 'transparent' ? 2 : 0 }
                ]}
              >
                <Text style={[styles.dayText, { color: textColor }]}>
                  {day.dayNumber}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginVertical: 20,
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.accent,
  },
  statLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    marginVertical: 20,
    padding: 20,
    backgroundColor: Colors.surface,
    borderRadius: 12,
  },
  emptyStateText: {
    color: Colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
  },
  progressContainer: {
    marginVertical: 20,
  },
  progressText: {
    color: Colors.text,
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBarBg: {
    height: 12,
    backgroundColor: Colors.surface,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  calendarContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  navText: {
    fontSize: 24,
    color: Colors.accent,
    paddingHorizontal: 16,
  },
  weekdays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekdayText: {
    color: Colors.textMuted,
    width: 32,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  dayCell: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    marginVertical: 4,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
