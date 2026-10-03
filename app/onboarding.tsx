import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../components/ui/Screen';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Colors } from '../constants/Colors';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';

const SUGGESTED_GOALS = [
  "Treinar",
  "Beber 2L de água",
  "Dormir 7h",
  "Comer bem",
  "Alongar"
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { loadSession } = useAppStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Step 2 State
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [customGoal, setCustomGoal] = useState('');

  // Step 3 State
  const [nickname, setNickname] = useState('');

  // Step 4 State
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState('19:00'); // simple string for now

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const toggleGoal = (goal: string) => {
    if (selectedGoals.includes(goal)) {
      setSelectedGoals(selectedGoals.filter(g => g !== goal));
    } else {
      if (selectedGoals.length >= 3) {
        setErrorMsg('Máximo de 3 metas no onboarding. Você pode adicionar mais depois.');
        return;
      }
      setErrorMsg('');
      setSelectedGoals([...selectedGoals, goal]);
    }
  };

  const addCustomGoal = () => {
    const trimmed = customGoal.trim();
    if (!trimmed) return;
    if (selectedGoals.length >= 5) {
      setErrorMsg('Máximo de 5 metas permitidas.');
      return;
    }
    if (!selectedGoals.includes(trimmed)) {
      if (selectedGoals.length >= 3) {
        setErrorMsg('Máximo de 3 metas no onboarding.');
        return;
      }
      setSelectedGoals([...selectedGoals, trimmed]);
    }
    setCustomGoal('');
    setErrorMsg('');
  };

  const handleFinish = async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      // 1. Save Nickname & Onboarding Info
      const { error: profileError } = await supabase.rpc('finish_onboarding', {
        p_nickname: nickname,
        p_reminder_enabled: reminderEnabled,
        p_reminder_time: `${reminderTime}:00`
      });

      if (profileError) throw profileError;

      // 2. Create goals (all days by default)
      if (selectedGoals.length > 0) {
        for (const title of selectedGoals) {
          const { error: goalError } = await supabase.rpc('create_goal', {
            p_title: title,
            p_days: [0, 1, 2, 3, 4, 5, 6]
          });
          if (goalError) throw goalError;
        }
      }

      // 3. Update store & redirect
      // Note: permission for notifications is requested after the first check-in.
      await loadSession();
      router.replace('/(tabs)');
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocorreu um erro.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc('finish_onboarding', {
        p_nickname: '',
        p_reminder_enabled: false,
        p_reminder_time: '19:00:00'
      });
      if (error) throw error;
      await loadSession();
      router.replace('/(tabs)');
    } catch (err: any) {
      setErrorMsg(err.message || 'Ocorreu um erro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        {/* Step 1: Welcome */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            <Text style={styles.fireIcon}>🔥</Text>
            <Text style={styles.title}>Bem-vindo ao Gym Streak</Text>
            <Text style={styles.subtitle}>Cumpra suas metas. Suba no ranking. Mantenha a chama acesa.</Text>
            <View style={{flex: 1}} />
            <Button title="Começar" onPress={nextStep} />
            <Button title="Pular tudo" variant="ghost" onPress={handleSkip} style={{marginTop: 16}} />
          </View>
        )}

        {/* Step 2: Goals */}
        {step === 2 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Suas Metas Diárias</Text>
            <Text style={styles.subtitle}>Escolha de 1 a 5 metas para fazer check-in todos os dias.</Text>
            
            <ScrollView style={{flex: 1, marginVertical: 16}}>
              {/* Combine SUGGESTED_GOALS and any custom goals in selectedGoals */}
              {Array.from(new Set([...SUGGESTED_GOALS, ...selectedGoals])).map(goal => (
                <TouchableOpacity 
                  key={goal} 
                  style={[styles.goalOption, selectedGoals.includes(goal) && styles.goalOptionSelected]}
                  onPress={() => toggleGoal(goal)}
                >
                  <Text style={[styles.goalText, selectedGoals.includes(goal) && styles.goalTextSelected]}>
                    {goal}
                  </Text>
                </TouchableOpacity>
              ))}
              
              <View style={{marginTop: 16}}>
                <Text style={{color: Colors.textMuted, marginBottom: 8}}>Adicionar meta personalizada:</Text>
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <View style={{flex: 1}}>
                    <Input 
                      placeholder="Ex: Ler 10 páginas" 
                      value={customGoal}
                      onChangeText={setCustomGoal}
                      onSubmitEditing={addCustomGoal}
                      returnKeyType="done"
                    />
                  </View>
                  <Button title="+" onPress={addCustomGoal} style={{marginLeft: 8, paddingHorizontal: 16}} />
                </View>
              </View>

              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            </ScrollView>

            <View style={styles.row}>
              <Button title="Voltar" variant="secondary" onPress={prevStep} style={{flex: 1, marginRight: 8}} />
              <Button 
                title="Avançar" 
                onPress={() => {
                  if (selectedGoals.length < 1) setErrorMsg('Escolha pelo menos 1 meta.');
                  else { setErrorMsg(''); nextStep(); }
                }} 
                style={{flex: 1, marginLeft: 8}} 
              />
            </View>
            <Button title="Pular" variant="ghost" onPress={handleSkip} style={{marginTop: 16}} />
          </View>
        )}

        {/* Step 3: Nickname */}
        {step === 3 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Ranking Global</Text>
            <Text style={styles.subtitle}>Escolha seu apelido para competir com outros atletas.</Text>
            
            <View style={{flex: 1, justifyContent: 'center'}}>
              <Input 
                placeholder="Ex: shape_inevitavel" 
                value={nickname}
                onChangeText={setNickname}
                autoCapitalize="none"
              />
              <Text style={{color: Colors.textMuted, marginTop: 8, fontSize: 12}}>Apenas letras, números e underline.</Text>
            </View>

            <View style={styles.row}>
              <Button title="Voltar" variant="secondary" onPress={prevStep} style={{flex: 1, marginRight: 8}} />
              <Button 
                title="Avançar" 
                onPress={() => {
                  if (!nickname.trim()) setErrorMsg('Escolha um apelido.');
                  else { setErrorMsg(''); nextStep(); }
                }} 
                style={{flex: 1, marginLeft: 8}} 
              />
            </View>
            <Button title="Pular" variant="ghost" onPress={nextStep} style={{marginTop: 16}} />
          </View>
        )}

        {/* Step 4: Reminders */}
        {step === 4 && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Lembretes Diários</Text>
            <Text style={styles.subtitle}>Não deixe o seu streak apagar.</Text>
            
            <View style={{flex: 1, justifyContent: 'center'}}>
              <View style={styles.settingRow}>
                <Text style={styles.settingText}>Ativar Lembretes</Text>
                <Switch 
                  value={reminderEnabled} 
                  onValueChange={setReminderEnabled}
                  trackColor={{ true: Colors.accent }}
                />
              </View>
              
              {reminderEnabled && (
                <View style={styles.timeBox}>
                  <Text style={{color: Colors.textMuted, marginBottom: 8}}>Horário do lembrete (HH:MM)</Text>
                  <Input 
                    value={reminderTime}
                    onChangeText={setReminderTime}
                    placeholder="19:00"
                    keyboardType="numeric"
                    maxLength={5}
                  />
                  <Text style={{color: Colors.textMuted, marginTop: 8, fontSize: 12}}>Você poderá ajustar isso no Perfil depois.</Text>
                </View>
              )}

              {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            </View>

            <View style={styles.row}>
              <Button title="Voltar" variant="secondary" onPress={prevStep} style={{flex: 1, marginRight: 8}} disabled={loading} />
              <Button 
                title="Concluir" 
                onPress={handleFinish} 
                style={{flex: 1, marginLeft: 8}} 
                loading={loading}
              />
            </View>
            <Button title="Pular" variant="ghost" onPress={handleSkip} style={{marginTop: 16}} disabled={loading} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 20,
  },
  stepContainer: {
    flex: 1,
  },
  fireIcon: {
    fontSize: 64,
    textAlign: 'center',
    marginVertical: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
  },
  goalOption: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  goalOptionSelected: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(255, 69, 0, 0.1)',
  },
  goalText: {
    color: Colors.text,
    fontSize: 16,
  },
  goalTextSelected: {
    color: Colors.accent,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#ff4444',
    marginTop: 12,
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  settingText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  timeBox: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 8,
  }
});
