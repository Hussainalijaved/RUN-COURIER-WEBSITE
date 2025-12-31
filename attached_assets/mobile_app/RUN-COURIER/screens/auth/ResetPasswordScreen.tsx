import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TextInput, Alert, Platform, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Button } from '@/components/Button';
import { ScreenKeyboardAwareScrollView } from '@/components/ScreenKeyboardAwareScrollView';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';

export function ResetPasswordScreen({ navigation, route }: any) {
  const { theme } = useTheme();
  const { clearPasswordRecovery } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
      }
      setCheckingSession(false);
    };
    
    checkSession();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      console.log('Auth state change in ResetPassword:', event);
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setSessionReady(true);
        setCheckingSession(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleUpdatePassword = async () => {
    if (!newPassword) {
      setMessage({ type: 'error', text: 'Please enter a new password' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({ type: 'success', text: 'Password updated successfully! Redirecting to login...' });
        
        // Clear the recovery state and sign out
        setTimeout(async () => {
          clearPasswordRecovery();
          await supabase.auth.signOut();
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        }, 2000);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update password' });
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText style={styles.loadingText}>Verifying reset link...</ThemedText>
      </View>
    );
  }

  if (!sessionReady) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="alert-circle" size={60} color={theme.error} />
        <ThemedText style={styles.errorTitle}>Invalid or Expired Link</ThemedText>
        <ThemedText style={[styles.errorDescription, { color: theme.secondaryText }]}>
          This password reset link is invalid or has expired. Please request a new one.
        </ThemedText>
        <Button 
          title="Back to Login" 
          onPress={() => {
            clearPasswordRecovery();
            navigation.navigate('Login');
          }}
          style={styles.button}
        />
      </View>
    );
  }

  return (
    <ScreenKeyboardAwareScrollView style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Feather name="lock" size={60} color={theme.primary} />
        </View>
        
        <ThemedText style={styles.title}>Reset Password</ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.secondaryText }]}>
          Enter your new password below
        </ThemedText>

        {message ? (
          <View style={[
            styles.messageContainer, 
            { backgroundColor: message.type === 'success' ? '#10b98115' : theme.error + '15' }
          ]}>
            <ThemedText style={[
              styles.messageText, 
              { color: message.type === 'success' ? '#10b981' : theme.error }
            ]}>
              {message.text}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>New Password</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password"
              placeholderTextColor={theme.secondaryText}
              secureTextEntry
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Confirm Password</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              placeholderTextColor={theme.secondaryText}
              secureTextEntry
            />
          </View>

          <Button 
            title={loading ? 'Updating...' : 'Update Password'}
            onPress={handleUpdatePassword}
            disabled={loading}
            style={styles.button}
          />
        </View>
      </View>
    </ScreenKeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['2xl'],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.lg,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: Spacing.xl,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  messageContainer: {
    width: '100%',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  messageText: {
    fontSize: 17,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: 17,
    marginBottom: Spacing.xs,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  button: {
    marginTop: Spacing.md,
  },
});
