import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Colors } from '../constants/Colors';

interface FlameProps {
  streak: number;
}

export function FlameAnimation({ streak }: FlameProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scaleAnim]);

  let color = '#808080'; // cinza
  let size = 40;

  if (streak >= 30) {
    color = '#FFD700'; // dourada
    size = 80;
  } else if (streak >= 7) {
    color = '#FF3300'; // vermelha
    size = 70;
  } else if (streak >= 1) {
    color = '#FFA500'; // laranja
    size = 60;
  }

  return (
    <View style={styles.container}>
      <Animated.Text
        style={[
          styles.flame,
          {
            fontSize: size,
            color,
            transform: [{ scale: streak > 0 ? scaleAnim : 1 }],
            opacity: streak === 0 ? 0.3 : 1,
          },
        ]}
      >
        🔥
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 120,
  },
  flame: {
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
