import React, { useState } from 'react';
import { View, StyleSheet, Image, Alert, Pressable, Platform } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import { ScreenKeyboardAwareScrollView } from '@/components/ScreenKeyboardAwareScrollView';
import { Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';

export function LoginScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { signIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showError = (message: string) => {
    setError(message);
    if (Platform.OS !== 'web') {
      Alert.alert('Error', message);
    }
  };

  const handleLogin = async () => {
    setError(null);
    setResetMessage(null);
    
    if (!email || !password) {
      showError('Please enter both email and password');
      return;
    }

    setLoading(true);
    const { error: authError } = await signIn(email, password);
    setLoading(false);

    if (authError) {
      showError(authError.message || 'Login failed. Please check your credentials.');
    }
  };

  const handleForgotPassword = async () => {
    setResetMessage(null);
    setError(null);
    
    if (!email) {
      const msg = 'Please enter your email address first, then tap Forgot Password.';
      if (Platform.OS === 'web') {
        setResetMessage({ type: 'error', text: msg });
      } else {
        Alert.alert('Enter Email', msg, [{ text: 'OK' }]);
      }
      return;
    }

    setResetLoading(true);
    try {
      const { error: resetError } = await resetPassword(email.trim().toLowerCase());
      setResetLoading(false);

      if (resetError) {
        const errorMsg = resetError.message || 'Failed to send reset email. Please try again.';
        if (Platform.OS === 'web') {
          setResetMessage({ type: 'error', text: errorMsg });
        } else {
          Alert.alert('Error', errorMsg);
        }
      } else {
        const successMsg = 'Password reset email sent! Check your inbox for the reset link.';
        if (Platform.OS === 'web') {
          setResetMessage({ type: 'success', text: successMsg });
        } else {
          Alert.alert('Email Sent', successMsg, [{ text: 'OK' }]);
        }
      }
    } catch (err: any) {
      setResetLoading(false);
      const errorMsg = err.message || 'Something went wrong. Please try again.';
      if (Platform.OS === 'web') {
        setResetMessage({ type: 'error', text: errorMsg });
      } else {
        Alert.alert('Error', errorMsg);
      }
    }
  };

  return (
    <ScreenKeyboardAwareScrollView style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={[styles.logoContainer, { backgroundColor: theme.primary, borderWidth: 3, borderColor: '#2196F3' }]}>
            <Image 
              source={require('@/assets/images/icon.png')}
              style={styles.logo}
            />
          </View>
          
          <ThemedText type="h1" style={styles.title}>Welcome Back</ThemedText>
          <ThemedText type="subhead" style={styles.subtitle}>
            Sign in to continue to Run Courier
          </ThemedText>
        </View>

        <Card variant="glass" style={styles.formCard}>
          {error ? (
            <View style={[styles.messageContainer, { backgroundColor: theme.error + '12' }]}>
              <ThemedText type="small" color="error" style={styles.messageText}>
                {error}
              </ThemedText>
            </View>
          ) : null}

          {resetMessage ? (
            <View style={[
              styles.messageContainer, 
              { backgroundColor: resetMessage.type === 'success' ? theme.success + '12' : theme.error + '12' }
            ]}>
              <ThemedText 
                type="small" 
                color={resetMessage.type === 'success' ? 'success' : 'error'}
                style={styles.messageText}
              >
                {resetMessage.text}
              </ThemedText>
            </View>
          ) : null}

          <Input
            label="Email"
            icon="mail"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError(null);
              setResetMessage(null);
            }}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Password"
            icon="lock"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError(null);
            }}
            placeholder="Enter your password"
            showPasswordToggle
          />

          <Pressable 
            onPress={handleForgotPassword} 
            style={styles.forgotButton}
            disabled={resetLoading}
          >
            <ThemedText type="small" style={{ color: theme.primary }}>
              {resetLoading ? 'Sending...' : 'Forgot Password?'}
            </ThemedText>
          </Pressable>

          <Button 
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            icon="log-in"
            style={styles.button}
          />
        </Card>

        <View style={styles.footer}>
          <ThemedText type="body" color="secondary">
            Need to book deliveries?{' '}
          </ThemedText>
          <Pressable onPress={() => navigation.navigate('CustomerSignup')}>
            <ThemedText type="bodyMedium" style={{ color: theme.primary }}>
              Sign Up
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.driverLink}>
          <ThemedText type="caption" color="secondary">
            Are you a driver?{' '}
          </ThemedText>
          <Pressable onPress={() => navigation.navigate('Signup')}>
            <ThemedText type="caption" style={{ color: theme.primary }}>
              Sign up as a driver
            </ThemedText>
          </Pressable>
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
    paddingBottom: Spacing["3xl"],
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing["2xl"],
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    ...Shadows.card,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
  },
  title: {
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  formCard: {
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  messageContainer: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  messageText: {
    textAlign: 'center',
  },
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -Spacing.sm,
    marginBottom: Spacing.lg,
  },
  button: {
    marginTop: Spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
});
