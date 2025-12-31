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
import { Feather } from '@expo/vector-icons';

type VehicleType = 'motorbike' | 'car' | 'small_van' | 'medium_van';

const VEHICLE_TYPES: { value: VehicleType; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { value: 'motorbike', label: 'Motorbike', icon: 'zap' },
  { value: 'car', label: 'Car', icon: 'truck' },
  { value: 'small_van', label: 'Small Van', icon: 'package' },
  { value: 'medium_van', label: 'Medium Van', icon: 'box' },
];

export function SignupScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const showError = (message: string) => {
    setError(message);
    setSuccess(null);
    if (Platform.OS !== 'web') {
      Alert.alert('Error', message);
    }
  };

  const showSuccess = (message: string) => {
    setSuccess(message);
    setError(null);
    if (Platform.OS !== 'web') {
      Alert.alert('Success', message);
    }
  };

  const handleSignup = async () => {
    setError(null);
    setSuccess(null);
    
    if (!email || !password || !confirmPassword) {
      showError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    const { error: authError } = await signUp(email, password, vehicleType);
    setLoading(false);

    if (authError) {
      showError(authError.message || 'Signup failed. Please try again.');
    } else {
      showSuccess('Account created! Please check your email to verify your account.');
      setTimeout(() => {
        navigation.navigate('Login');
      }, 2000);
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
          
          <ThemedText type="h1" style={styles.title}>Get Started</ThemedText>
          <ThemedText type="subhead" style={styles.subtitle}>
            Create your driver account
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

          {success ? (
            <View style={[styles.messageContainer, { backgroundColor: theme.success + '12' }]}>
              <ThemedText type="small" color="success" style={styles.messageText}>
                {success}
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
            placeholder="Create a password"
            showPasswordToggle
          />

          <Input
            label="Confirm Password"
            icon="lock"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              setError(null);
            }}
            placeholder="Confirm your password"
            showPasswordToggle
          />

          <View style={styles.vehicleSection}>
            <ThemedText type="subhead" style={styles.vehicleLabel}>
              Vehicle Type
            </ThemedText>
            <View style={styles.vehicleGrid}>
              {VEHICLE_TYPES.map((type) => {
                const isSelected = vehicleType === type.value;
                return (
                  <Pressable
                    key={type.value}
                    onPress={() => setVehicleType(type.value)}
                    style={[
                      styles.vehicleOption,
                      { 
                        backgroundColor: isSelected ? theme.primary : theme.backgroundDefault,
                        borderColor: isSelected ? theme.primary : theme.border,
                      }
                    ]}
                  >
                    <Feather 
                      name={type.icon} 
                      size={20} 
                      color={isSelected ? '#FFFFFF' : theme.text} 
                    />
                    <ThemedText 
                      type="small"
                      style={[
                        styles.vehicleOptionText,
                        { color: isSelected ? '#FFFFFF' : theme.text }
                      ]}
                    >
                      {type.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Button 
            title="Create Account"
            onPress={handleSignup}
            loading={loading}
            disabled={loading}
            icon="user-plus"
            style={styles.button}
          />
        </Card>

        <View style={styles.footer}>
          <ThemedText type="body" color="secondary">
            Already have an account?{' '}
          </ThemedText>
          <Pressable onPress={() => navigation.navigate('Login')}>
            <ThemedText type="bodyMedium" style={{ color: theme.primary }}>
              Sign In
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
  vehicleSection: {
    marginBottom: Spacing.lg,
  },
  vehicleLabel: {
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  vehicleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    gap: Spacing.xs,
  },
  vehicleOptionText: {
    fontWeight: '500',
  },
  button: {
    marginTop: Spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
