import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

export function Button({
  label, onPress, variant = 'primary', loading, disabled,
}: { label: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean }) {
  const styles = {
    primary: 'bg-ink',
    ghost: 'bg-transparent border border-line',
    danger: 'bg-transparent border border-decimal',
  }[variant];
  const text = { primary: 'text-white', ghost: 'text-ink', danger: 'text-decimal' }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`h-14 rounded-xl items-center justify-center px-5 ${styles} ${disabled ? 'opacity-40' : 'active:opacity-80'}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#10201E'} />
      ) : (
        <Text className={`text-base font-semibold ${text}`}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View className="flex-1">
      <Text className="text-xs text-muted">{label}</Text>
      <Text className="text-xl font-bold text-ink mt-0.5">{value}</Text>
      {sub ? <Text className="text-xs text-muted mt-0.5">{sub}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <View className="bg-white border border-decimal rounded-xl p-3 mb-4">
      <Text className="text-decimal text-sm font-medium">{message}</Text>
    </View>
  );
}

/** Digit-wheel display. The last wheel is red, like the decimal wheel on real meters. */
export function DigitWheels({ value, decimals = 1 }: { value: number | null; decimals?: number }) {
  const s = value == null ? '------' : value.toFixed(decimals).replace('.', '');
  const chars = s.padStart(6, '0').split('');
  return (
    <View className="flex-row">
      {chars.map((c, i) => {
        const last = decimals > 0 && i === chars.length - 1;
        return (
          <View key={i} className={`w-10 h-14 mr-1 rounded-md items-center justify-center ${last ? 'bg-decimal' : 'bg-wheel'}`}>
            <Text className="text-white text-3xl font-bold" style={{ fontVariant: ['tabular-nums'] }}>{c}</Text>
          </View>
        );
      })}
    </View>
  );
}
