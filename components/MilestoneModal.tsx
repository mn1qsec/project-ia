import React from 'react';
import { Modal, View, Text, StyleSheet } from 'react-native';
import { Button } from './ui/Button';
import { FlameAnimation } from './FlameAnimation';
import { Colors } from '../constants/Colors';

interface MilestoneModalProps {
  visible: boolean;
  streak: number;
  onClose: () => void;
}

export function MilestoneModal({ visible, streak, onClose }: MilestoneModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Incrível!</Text>
          <FlameAnimation streak={streak} />
          <Text style={styles.message}>
            Você atingiu a marca de <Text style={styles.highlight}>{streak}</Text> dias consecutivos!
          </Text>
          <Button title="Continuar" onPress={onClose} style={styles.button} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  message: {
    fontSize: 18,
    color: Colors.text,
    textAlign: 'center',
    marginVertical: 16,
  },
  highlight: {
    color: Colors.accent,
    fontWeight: 'bold',
  },
  button: {
    width: '100%',
    marginTop: 16,
  },
});
