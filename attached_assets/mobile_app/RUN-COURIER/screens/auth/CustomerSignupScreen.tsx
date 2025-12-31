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
import { CustomerRole } from '@/lib/customer-types';

type AccountType = 'individual' | 'business';

const ACCOUNT_TYPES: { value: AccountType; label: string; description: string; icon: keyof typeof Feather.glyphMap }[] = [
  { value: 'individual', label: 'Personal', description: 'For personal deliveries', icon: 'user' },
  { value: 'business', label: 'Business', description: 'For company deliveries', icon: 'briefcase' },
];

export function CustomerSignupScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { signUpCustomer } = useAuth();
  const [step, setStep] = useState(1);
  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyRegNumber, setCompanyRegNumber] = useState('');
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

  const handleNextStep = () => {
    setError(null);
    if (step === 1) {
      setStep(2);
    }
  };

  const handleSignup = async () => {
    setError(null);
    setSuccess(null);
    
    if (!email || !password || !confirmPassword || !fullName) {
      showError('Please fill in all required fields');
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

    if (accountType === 'business' && !companyName) {
      showError('Please enter your company name');
      return;
    }

    setLoading(true);
    
    const companyDetails = accountType === 'business' 
      ? { companyName, companyRegNumber } 
      : undefined;
    
    const { error: authError } = await signUpCustomer(
      email, 
      password, 
      fullName, 
      accountType as CustomerRole,
      companyDetails
    );
    
    setLoading(false);

    if (authError) {
      showError(authError.message || 'Signup failed. Please try again.');
    } else {
      showSuccess('Account created! You can now start booking deliveries.');
    }
  };

  const renderStep1 = () => (
    <>
      <ThemedText type="h1" style={styles.stepTitle}>Choose Account Type</ThemedText>
      <ThemedText type="subhead" style={[styles.stepSubtitle, { color: theme.secondaryText }]}>
        Select the type of account that fits your needs
      </ThemedText>

      <View style={styles.accountTypeContainer}>
        {ACCOUNT_TYPES.map((type) => {
          const isSelected = accountType === type.value;
          return (
            <Pressable
              key={type.value}
              onPress={() => setAccountType(type.value)}
              style={[
                styles.accountTypeCard,
                {
                  backgroundColor: isSelected ? theme.primary + '15' : theme.backgroundDefault,
                  borderColor: isSelected ? theme.primary : theme.border,
                }
              ]}
            >
              <View style={[
                styles.accountTypeIcon,
                { backgroundColor: isSelected ? theme.primary : theme.backgroundSecondary }
              ]}>
                <Feather 
                  name={type.icon} 
                  size={28} 
                  color={isSelected ? '#FFFFFF' : theme.secondaryText} 
                />
              </View>
              <ThemedText 
                type="h4"
                style={[styles.accountTypeLabel, { color: isSelected ? theme.primary : theme.text }]}
              >
                {type.label}
              </ThemedText>
              <ThemedText 
                type="caption"
                style={[styles.accountTypeDesc, { color: theme.secondaryText }]}
              >
                {type.description}
              </ThemedText>
              {isSelected ? (
                <View style={[styles.selectedBadge, { backgroundColor: theme.primary }]}>
                  <Feather name="check" size={16} color="#FFFFFF" />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Button 
        title="Continue"
        onPress={handleNextStep}
        icon="arrow-right"
        style={styles.button}
      />
    </>
  );

  const renderStep2 = () => (
    <>
      <Pressable onPress={() => setStep(1)} style={styles.backButton}>
        <Feather name="arrow-left" size={20} color={theme.primary} />
        <ThemedText type="body" style={{ color: theme.primary, marginLeft: Spacing.xs }}>
          Back
        </ThemedText>
      </Pressable>

      <ThemedText type="h1" style={styles.stepTitle}>Create Account</ThemedText>
      <ThemedText type="subhead" style={[styles.stepSubtitle, { color: theme.secondaryText }]}>
        {accountType === 'business' ? 'Set up your business account' : 'Set up your personal account'}
      </ThemedText>

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
          label="Full Name"
          icon="user"
          value={fullName}
          onChangeText={(text) => {
            setFullName(text);
            setError(null);
          }}
          placeholder="Enter your full name"
          autoCapitalize="words"
        />

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

        {accountType === 'business' ? (
          <>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <ThemedText type="subhead" style={styles.sectionTitle}>
              Company Details
            </ThemedText>
            
            <Input
              label="Company Name"
              icon="briefcase"
              value={companyName}
              onChangeText={(text) => {
                setCompanyName(text);
                setError(null);
              }}
              placeholder="Enter company name"
            />

            <Input
              label="Company Registration (Optional)"
              icon="hash"
              value={companyRegNumber}
              onChangeText={(text) => {
                setCompanyRegNumber(text);
                setError(null);
              }}
              placeholder="Company registration number"
            />
          </>
        ) : null}

        <Button 
          title="Create Account"
          onPress={handleSignup}
          loading={loading}
          disabled={loading}
          icon="user-plus"
          style={styles.button}
        />
      </Card>
    </>
  );

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
        </View>

        {step === 1 ? renderStep1() : renderStep2()}

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
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing["3xl"],
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    ...Shadows.card,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
  },
  stepTitle: {
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  accountTypeContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  accountTypeCard: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    alignItems: 'center',
    position: 'relative',
  },
  accountTypeIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  accountTypeLabel: {
    marginBottom: Spacing.xs,
  },
  accountTypeDesc: {
    textAlign: 'center',
  },
  selectedBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
  divider: {
    height: 1,
    marginVertical: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  button: {
    marginTop: Spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  driverLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.md,
  },
});
