import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Screen } from '../../components/ui/Screen';
import { Colors } from '../../constants/Colors';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
  const { user, profile, signOut, loadSession } = useAppStore();
  const [editingNick, setEditingNick] = useState(false);
  const [newNick, setNewNick] = useState(profile?.nickname || '');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSaveNick = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.rpc('set_nickname', { p_nickname: newNick });
      if (error) {
        setErrorMsg(error.message.includes('apelido já está em uso') ? 'Este apelido já está em uso' : error.message);
      } else {
        setErrorMsg('');
        setEditingNick(false);
        await loadSession(); // refresh profile
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleRanking = async (value: boolean) => {
    if (!profile) return;
    try {
      await supabase.from('profiles').update({ show_in_ranking: value }).eq('id', profile.id);
      await loadSession();
    } catch (e) {
      console.error(e);
    }
  };

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
    marginBottom: 40,
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
  actions: {
    flex: 1,
    justifyContent: 'flex-end',
    marginBottom: 20,
  },
});
