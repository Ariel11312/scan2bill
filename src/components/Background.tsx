import React from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop, Rect, Circle, Path, Pattern } from 'react-native-svg';
import { C } from '../lib/theme';

export function Background() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#0B0D10', '#10161B', '#0B0D10']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={C.volt} stopOpacity="0.22" />
            <Stop offset="1" stopColor={C.volt} stopOpacity="0" />
          </RadialGradient>
          <Pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <Path d="M32 0H0V32" stroke="#FFFFFF" strokeOpacity="0.04" strokeWidth="1" fill="none" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#grid)" />
        <Circle cx="88%" cy="6%" r="240" fill="url(#glow)" />
        <Circle cx="4%" cy="96%" r="210" fill="url(#glow)" />
      </Svg>
    </View>
  );
}

// Wrap every normal screen in this: background + status bar + safe area.
export function Screen({ children, edges }: { children: React.ReactNode; edges?: Edge[] }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      <StatusBar style="light" />
      <Background />
      <SafeAreaView style={{ flex: 1 }} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}