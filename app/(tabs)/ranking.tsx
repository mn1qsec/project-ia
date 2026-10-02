import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Modal, ActivityIndicator } from 'react-native';
import { Screen } from '../../components/ui/Screen';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Colors } from '../../constants/Colors';
import { useRankingStore, RankingPeriod, RankingItem } from '../../store/useRankingStore';
import { useAppStore } from '../../store/useAppStore';
import { supabase } from '../../lib/supabase';

export default function RankingScreen() {
  const { ranking, myRank, period, loading, hasMore, setPeriod, loadRanking, setNickname } = useRankingStore();
  const { profile } = useAppStore();

  const [refreshing, setRefreshing] = useState(false);
  const [showNickModal, setShowNickModal] = useState(false);
  const [newNick, setNewNick] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    // Verificar se o usuário já tem nickname (ele é obrigatório para aparecer)
    checkNickname();
    loadRanking(true);
  }, []);

  const checkNickname = async () => {
    if (profile && !profile.nickname) {
      setShowNickModal(true);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRanking(true);
    setRefreshing(false);
  }, []);

  const loadMore = () => {
    if (!loading && hasMore) {
      loadRanking();
    }
  };

  const handleSaveNick = async () => {
    setActionLoading(true);
    const { error } = await setNickname(newNick);
    setActionLoading(false);
    
    if (error) {
      setErrorMsg(error);
    } else {
      setShowNickModal(false);
      setNewNick('');
      setErrorMsg('');
      loadRanking(true);
      // Força a atualização do profile no store principal (gambiarra simples)
      useAppStore.getState().loadSession(); 
    }
  };

  let daysToPass = 0;
  let personToPass = '';

  if (myRank && myRank.pos > 1) {
    const ahead = ranking.find(r => r.pos === myRank.pos - 1);
    if (ahead) {
      if (period === 'streak') {
        daysToPass = (ahead.current_streak - myRank.current_streak) + 1;
      } else {
        daysToPass = (ahead.week_checkins - myRank.week_checkins) + 1;
      }
      personToPass = ahead.nickname;
    }
  }

  function renderNickModal() {
    return (
      <Modal visible={showNickModal} transparent animationType="slide" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Crie seu Apelido</Text>
            <Text style={{color: Colors.textMuted, marginBottom: 16}}>
              Para participar do Ranking Global, escolha um apelido único (apenas letras, números e _).
            </Text>
            <Input 
              placeholder="Ex: shape_inevitavel" 
              value={newNick} 
              onChangeText={(t) => { setNewNick(t); setErrorMsg(''); }}
              autoCapitalize="none"
              error={errorMsg}
            />
            <Button title="Salvar e Entrar" onPress={handleSaveNick} loading={actionLoading} />
            {profile?.nickname && (
              <Button title="Cancelar" variant="secondary" onPress={() => { setShowNickModal(false); setErrorMsg(''); }} style={{marginTop: 8}}/>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  const renderRankingItem = ({ item }: { item: RankingItem }) => {
    const isMe = myRank?.nickname === item.nickname;
    
    let positionColor = Colors.textMuted;
    if (item.pos === 1) positionColor = '#FFD700';
    else if (item.pos === 2) positionColor = '#C0C0C0';
    else if (item.pos === 3) positionColor = '#CD7F32';

    return (
      <View style={[styles.rankingRow, isMe && styles.myRow]}>
        <Text style={[styles.position, { color: positionColor }]}>{item.pos}º</Text>
        <View style={styles.avatarMini}>
          <Text style={styles.avatarMiniText}>{item.nickname.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.nickname}</Text>
          {period === 'streak' ? (
            <Text style={styles.userStats}>{item.week_checkins} dias nesta semana</Text>
          ) : (
            <Text style={styles.userStats}>Streak atual: {item.current_streak} 🔥</Text>
          )}
        </View>
        <View style={styles.streakBadge}>
          <Text style={styles.streakText}>
            {period === 'streak' ? item.current_streak : item.week_checkins} {period === 'streak' ? '🔥' : 'dias'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Ranking Global</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, period === 'streak' && styles.tabActive]}
          onPress={() => setPeriod('streak')}
        >
          <Text style={[styles.tabText, period === 'streak' && styles.tabTextActive]}>Maior Streak</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, period === 'week' && styles.tabActive]}
          onPress={() => setPeriod('week')}
        >
          <Text style={[styles.tabText, period === 'week' && styles.tabTextActive]}>Nesta Semana</Text>
        </TouchableOpacity>
      </View>

      {personToPass ? (
        <View style={styles.motivationBox}>
          <Text style={styles.motivationText}>
            Faltam <Text style={{color: Colors.accent, fontWeight: 'bold'}}>{daysToPass} {period === 'streak' ? 'dias' : 'check-ins'}</Text> para você passar {personToPass}!
          </Text>
        </View>
      ) : null}

      <FlatList
        data={ranking}
        keyExtractor={(item) => item.nickname}
        renderItem={renderRankingItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={loading && !refreshing ? <ActivityIndicator color={Colors.accent} style={{margin: 20}} /> : null}
        ListEmptyComponent={!loading ? <Text style={styles.emptySubtitle}>Nenhum atleta encontrado.</Text> : null}
      />

      {/* Minha Posição Fixa no Rodapé se eu não estiver visível na tela (simplificado: mostra sempre que tivermos um rank) */}
      {myRank && profile?.show_in_ranking && (
        <View style={styles.myFixedBar}>
          <Text style={styles.myFixedTitle}>Sua posição:</Text>
          {renderRankingItem({ item: myRank })}
        </View>
      )}

      {!profile?.show_in_ranking && (
        <View style={styles.myFixedBar}>
          <Text style={styles.emptySubtitle}>Você escolheu não aparecer no ranking.</Text>
        </View>
      )}

      {renderNickModal()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#333',
  },
  tabText: {
    color: Colors.textMuted,
    fontWeight: 'bold',
  },
  tabTextActive: {
    color: Colors.text,
  },
  emptySubtitle: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    marginVertical: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    padding: 24,
    borderRadius: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  motivationBox: {
    backgroundColor: 'rgba(255, 69, 0, 0.1)',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
    marginBottom: 16,
  },
  motivationText: {
    color: Colors.text,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 100, // Espaço pro rodapé
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  myRow: {
    borderColor: Colors.accent,
    borderWidth: 1,
  },
  position: {
    fontSize: 18,
    fontWeight: 'bold',
    width: 40,
    textAlign: 'center',
  },
  avatarMini: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  avatarMiniText: {
    color: Colors.text,
    fontWeight: 'bold',
    fontSize: 18,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: Colors.text,
    fontWeight: 'bold',
    fontSize: 16,
  },
  userStats: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  streakBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  streakText: {
    color: Colors.accent,
    fontWeight: 'bold',
  },
  myFixedBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A1A',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  myFixedTitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginBottom: 8,
    textTransform: 'uppercase',
    fontWeight: 'bold',
  }
});
