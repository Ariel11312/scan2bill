import React, { useState } from 'react';
import { StyleProp, Text, TextInput, TextStyle, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';

type Props = React.ComponentProps<typeof TextInput> & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  right?: React.ReactNode;
  big?: boolean;
  inputStyle?: StyleProp<TextStyle>;
};

export function Field({ label, icon, right, big, inputStyle, onFocus, onBlur, ...props }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        className="text-xs font-semibold tracking-widest uppercase mb-2 ml-1"
        style={{ color: C.muted }}
      >
        {label}
      </Text>
      <View
        className="flex-row items-center rounded-2xl px-4 border"
        style={{
          height: big ? 68 : 56,
          backgroundColor: C.panel,
          borderColor: focused ? C.volt : C.line,
          ...(focused
            ? {
                shadowColor: C.volt,
                shadowOpacity: 0.35,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 0 },
                elevation: 4,
              }
            : null),
        }}
      >
        <Ionicons name={icon} size={big ? 24 : 20} color={focused ? C.volt : C.muted} />
        <TextInput
          {...props}
          className="flex-1 ml-3 text-base"
          style={[{ color: C.ink }, big ? { fontSize: 30, fontWeight: '700' } : null, inputStyle]}
          placeholderTextColor={C.placeholder}
          selectionColor={C.volt}
          keyboardAppearance="dark"
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        />
        {right}
      </View>
    </View>
  );
}