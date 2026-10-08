import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, Pressable } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { Button, ErrorBanner } from '../components/ui';

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('email not confirmed')) return 'Your email is not confirmed yet. Open the confirmation email on this device, or resend it below.';
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('signups not allowed') || m.includes('signups are disabled')) return 'Sign-ups are turned off for this project. Enable them in Supabase: Authentication > Sign In / Providers > Email.';
  if (m.includes('rate limit')) return 'Too many emails sent. Please wait a few minutes and try again.';
  if (m.includes('network request failed')) return 'No connection. Check your internet and try again.';
  return message;
}

export default function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);

  const cleanEmail = email.trim().toLowerCase();
  const redirectTo = Linking.createURL('/');

  async function submit() {
    if (busy) return;
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-paper justify-center px-6"
    >
      <Text className="text-4xl font-bold text-ink">Scan2Bill</Text>
      <Text className="text-muted mt-2 mb-8">Point your camera at the meter. Get your usage and estimated bill.</Text>

      <ErrorBanner message={error} />
      {info ? <Text className="text-volt mb-4">{info}</Text> : null}

      <TextInput
        className="h-14 bg-panel border border-line rounded-xl px-4 text-ink mb-3"
        placeholder="Email"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="h-14 bg-panel border border-line rounded-xl px-4 text-ink mb-5"
        placeholder="Password (6+ characters)"
        secureTextEntry
        autoCapitalize="none"
        autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
        textContentType={mode === 'in' ? 'password' : 'newPassword'}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
        returnKeyType="go"
      />
      <Button
        label={mode === 'in' ? 'Sign in' : 'Create account'}
        onPress={submit}
        loading={busy}
        disabled={!cleanEmail || password.length < 6}
      />

      {canResend && cleanEmail ? (
        <Pressable onPress={resend} disabled={busy} className="mt-4 items-center">
          <Text className="text-ink font-semibold">Resend confirmation email</Text>
        </Pressable>
      ) : null}

      <Pressable onPress={switchMode} className="mt-5 items-center">
        <Text className="text-muted">{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}