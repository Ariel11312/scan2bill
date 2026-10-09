import React from 'react';
import { Text, TextProps, View, ViewProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';

export function Txt({
  tone = 'ink',
  style,
  ...p
}: TextProps & { tone?: 'ink' | 'muted' | 'volt' | 'warn' }) {
  return <Text {...p} style={[{ color: C[tone] }, style]} />;
}

export function Card({ style, ...p }: ViewProps) {
  return (
    <View
      {...p}
      style={[
        { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 24, padding: 20 },
        style,
      ]}
    />
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: C.line, marginVertical: 16 }} />;
}

export function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Txt tone="muted" className="text-xs uppercase tracking-widest">{label}</Txt>
      <Txt className="text-xl font-bold mt-1">{value}</Txt>
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          backgroundColor: C.panel,
          borderWidth: 1,
          borderColor: C.line,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
        }}
      >
        <Ionicons name={icon} size={24} color={C.volt} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt className="text-2xl font-extrabold tracking-tight">{title}</Txt>
        {subtitle ? <Txt tone="muted" className="text-sm mt-0.5">{subtitle}</Txt> : null}
      </View>
    </View>
  );
}