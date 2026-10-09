import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  Pressable,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient, Stop, Rect, Circle, Path, Pattern } from 'react-native-svg';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { Button, ErrorBanner } from '../components/ui';

// ---- Theme constants ----
const VOLT = '#C6FF3D';
const PLACEHOLDER = '#7C828D';
const ICON = '#9AA0AA';
const INK = '#F2F4F7';
const MUTED = '#9AA0AA';
const PANEL = '#161B21';
const LINE = 'rgba(255,255,255,0.10)';
const BASE = '#0B0D10';

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('email not confirmed')) return 'Your email is not confirmed yet. Open the confirmation email on this device, or resend it below.';
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('signups not allowed') || m.includes('signups are disabled')) return 'Sign-ups are turned off for this project. Enable them in Supabase: Authentication > Sign In / Providers > Email.';
  if (m.includes('rate limit')) return 'Too many emails sent. Please wait a few minutes and try again.';
  if (m.includes('network request failed')) return 'No connection. Check your internet and try again.';
  return message;
}

// ---------- Background (sits BEHIND everything, never touches input) ----------
function Background() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: -1 }]}>
      <LinearGradient
        colors={['#0B0D10', '#10161B', '#0B0D10']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <Svg width="100%" height="100%" pointerEvents="none">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={VOLT} stopOpacity="0.22" />
            <Stop offset="1" stopColor={VOLT} stopOpacity="0" />
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

// ---------- Scan icon ----------
function ScanIcon({ size = 28, color = VOLT }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M7 12h10" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// ---------- Input field ----------
// The TextInput is NOT wrapped in a Pressable. The wrapper is a plain View,
// and the label/icon area simply forwards focus. This avoids touch stealing
// that prevents the keyboard from opening.
type FieldProps = React.ComponentProps<typeof TextInput> & {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  right?: React.ReactNode;
};

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    backgroundColor: PANEL,
  },
  input: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: INK,
    paddingVertical: 0,
  },
});

const Field = React.forwardRef<TextInput, FieldProps>(function Field(
  { label, icon, right, onFocus, onBlur, ...props },
  forwardedRef
) {
  const [focused, setFocused] = useState(false);
  const innerRef = useRef<TextInput>(null);
  const ref = (forwardedRef as React.RefObject<TextInput>) ?? innerRef;

  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label}</Text>
      <View style={[fieldStyles.box, { borderColor: focused ? VOLT : LINE }]}>
        <Ionicons name={icon} size={20} color={focused ? VOLT : ICON} />
        <TextInput
          {...props}
          ref={ref}
          style={fieldStyles.input}
          placeholderTextColor={PLACEHOLDER}
          selectionColor={VOLT}
          keyboardAppearance="dark"
          underlineColorAndroid="transparent"
          editable
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        />
        {right}
      </View>
    </View>
  );
});

// ---------- Screen ----------
export default function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);

  const passwordRef = useRef<TextInput>(null);

  const cleanEmail = email.trim().toLowerCase();
  const redirectTo = Linking.createURL('/');

  async function submit() {
    if (busy) return;
    if (!cleanEmail || password.length < 6) return;
    setBusy(true); setError(null); setInfo(null); setCanResend(false);
    try {
      if (mode === 'in') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (err) {
          setError(friendly(err.message));
          if (err.message.toLowerCase().includes('email not confirmed')) setCanResend(true);
        }
        return;
      }

      const { data, error: err } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { emailRedirectTo: redirectTo },
      });
      if (err) return setError(friendly(err.message));

      // Confirm-email ON + existing address: no error, but identities is empty
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError('This email is already registered. Try signing in instead.');
        return;
      }
      if (!data.session) {
        setInfo('Check your email and tap the link on this device to confirm your account.');
        setCanResend(true);
      }
      // If data.session exists, "Confirm email" is off and AuthContext switches screens by itself.
    } catch (e: any) {
      setError(friendly(e?.message ?? 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy(true); setError(null); setInfo(null);
    try {
      const { error: err } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: { emailRedirectTo: redirectTo },
      });
      if (err) setError(friendly(err.message));
      else setInfo('Confirmation email sent again. Open it on this device.');
    } catch (e: any) {
      setError(friendly(e?.message ?? 'Could not resend the email.'));
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(mode === 'in' ? 'up' : 'in');
    setError(null); setInfo(null); setCanResend(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: BASE }}>
      <StatusBar style="light" />
      <Background />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingVertical: 32,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: PANEL,
                borderWidth: 1,
                borderColor: LINE,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              <ScanIcon />
            </View>
            <Text style={{ color: INK, textAlign: 'center', fontSize: 44, fontWeight: '800', letterSpacing: -1 }}>
              Scan<Text style={{ color: VOLT }}>2Bill</Text>
            </Text>
            <Text style={{ color: MUTED, textAlign: 'center', fontSize: 16, lineHeight: 24, marginTop: 12 }}>
              Point your camera at the meter.{'\n'}Get your usage and estimated bill.
            </Text>
          </View>

          {/* Glass card */}
          <View
            style={{
              backgroundColor: 'rgba(22,27,33,0.72)',
              borderColor: LINE,
              borderWidth: 1,
              borderRadius: 24,
              padding: 20,
            }}
          >
            <ErrorBanner message={error} />
            {info ? (
              <Text style={{ color: VOLT, textAlign: 'center', marginBottom: 16 }}>{info}</Text>
            ) : null}

            <Field
              label="Email"
              icon="mail-outline"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              returnKeyType="next"
              blurOnSubmit={false}
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              ref={passwordRef}
              label="Password"
              icon="lock-closed-outline"
              placeholder="At least 6 characters"
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
              right={
                <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={10}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={ICON} />
                </Pressable>
              }
            />

            <View style={{ marginTop: 4 }}>
              <Button
                label={mode === 'in' ? 'Sign in' : 'Create account'}
                onPress={submit}
                loading={busy}
                disabled={!cleanEmail || password.length < 6}
              />
            </View>

            {canResend && cleanEmail ? (
              <Pressable onPress={resend} disabled={busy} style={{ marginTop: 16, alignItems: 'center' }}>
                <Text style={{ color: INK, fontWeight: '600' }}>Resend confirmation email</Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable onPress={switchMode} style={{ marginTop: 24, alignItems: 'center' }}>
            <Text style={{ color: MUTED }}>
              {mode === 'in' ? 'New here? ' : 'Have an account? '}
              <Text style={{ color: VOLT, fontWeight: '600' }}>
                {mode === 'in' ? 'Create an account' : 'Sign in'}
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}