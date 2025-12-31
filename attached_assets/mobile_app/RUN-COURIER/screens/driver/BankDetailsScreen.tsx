import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Button } from '@/components/Button';
import { ScreenKeyboardAwareScrollView } from '@/components/ScreenKeyboardAwareScrollView';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export function BankDetailsScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { user, driver } = useAuth();
  
  const [accountName, setAccountName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const driverId = driver?.id || user?.id;

  useEffect(() => {
    loadBankDetails();
  }, [driverId]);

  const loadBankDetails = async () => {
    if (!driverId) {
      setLoadingData(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('bank_account_name, bank_sort_code, bank_account_number')
        .eq('id', driverId)
        .single();

      if (data) {
        setAccountName(data.bank_account_name || '');
        setSortCode(data.bank_sort_code || '');
        setAccountNumber(data.bank_account_number || '');
      }
    } catch (error) {
      console.log('Error loading bank details:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const formatSortCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    if (digits.length > 4) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
    } else if (digits.length > 2) {
      return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    return digits;
  };

  const handleSave = async () => {
    if (!accountName.trim()) {
      Alert.alert('Error', 'Please enter the account holder name');
      return;
    }
    if (sortCode.replace(/-/g, '').length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit sort code');
      return;
    }
    if (accountNumber.length !== 8) {
      Alert.alert('Error', 'Please enter a valid 8-digit account number');
      return;
    }

    if (!driverId) {
      Alert.alert('Error', 'You must be logged in to save bank details');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('drivers')
        .update({
          bank_account_name: accountName.trim(),
          bank_sort_code: sortCode,
          bank_account_number: accountNumber,
          updated_at: new Date().toISOString(),
        })
        .eq('id', driverId);

      if (error) {
        console.error('Error saving bank details:', error);
        Alert.alert('Error', 'Failed to save bank details. Please try again.');
      } else {
        Alert.alert('Success', 'Bank details saved successfully!', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error) {
      console.error('Error saving bank details:', error);
      Alert.alert('Error', 'Failed to save bank details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText style={[styles.loadingText, { color: theme.secondaryText }]}>
          Loading bank details...
        </ThemedText>
      </View>
    );
  }

  return (
    <ScreenKeyboardAwareScrollView style={[styles.container, { backgroundColor: theme.backgroundRoot }]} hasTabBar={true}>
      <View style={styles.content}>
        <ThemedView style={styles.infoCard}>
          <Feather name="lock" size={24} color={theme.success} />
          <View style={styles.infoContent}>
            <ThemedText style={styles.infoTitle}>Secure Payment Details</ThemedText>
            <ThemedText style={[styles.infoDescription, { color: theme.secondaryText }]}>
              Your bank details are encrypted and securely stored. We use them only to pay your earnings.
            </ThemedText>
          </View>
        </ThemedView>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>
              Account Holder Name
            </ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={accountName}
              onChangeText={setAccountName}
              placeholder="As shown on your bank account"
              placeholderTextColor={theme.secondaryText}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>
              Sort Code
            </ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={sortCode}
              onChangeText={(text) => setSortCode(formatSortCode(text))}
              placeholder="00-00-00"
              placeholderTextColor={theme.secondaryText}
              keyboardType="number-pad"
              maxLength={8}
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>
              Account Number
            </ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: theme.backgroundDefault, 
                borderColor: theme.backgroundSecondary,
                color: theme.text 
              }]}
              value={accountNumber}
              onChangeText={(text) => setAccountNumber(text.replace(/\D/g, '').slice(0, 8))}
              placeholder="8-digit account number"
              placeholderTextColor={theme.secondaryText}
              keyboardType="number-pad"
              maxLength={8}
            />
          </View>

          <Button
            title={loading ? 'Saving...' : 'Save Bank Details'}
            onPress={handleSave}
            disabled={loading}
            style={styles.saveButton}
          />
        </View>

        <View style={[styles.noteCard, { backgroundColor: theme.warning + '15' }]}>
          <Feather name="alert-circle" size={20} color={theme.warning} />
          <ThemedText style={[styles.noteText, { color: theme.text }]}>
            Please ensure your bank details are correct. Incorrect details may delay your payments.
          </ThemedText>
        </View>

        <View style={styles.paymentInfo}>
          <ThemedText style={styles.paymentTitle}>Payment Schedule</ThemedText>
          <View style={styles.paymentItem}>
            <Feather name="calendar" size={18} color={theme.secondaryText} />
            <ThemedText style={[styles.paymentText, { color: theme.secondaryText }]}>
              Payments are processed every Friday
            </ThemedText>
          </View>
          <View style={styles.paymentItem}>
            <Feather name="clock" size={18} color={theme.secondaryText} />
            <ThemedText style={[styles.paymentText, { color: theme.secondaryText }]}>
              Funds usually arrive within 2-3 working days
            </ThemedText>
          </View>
          <View style={styles.paymentItem}>
            <Feather name="dollar-sign" size={18} color={theme.secondaryText} />
            <ThemedText style={[styles.paymentText, { color: theme.secondaryText }]}>
              Minimum payout: £10.00
            </ThemedText>
          </View>
        </View>
      </View>
    </ScreenKeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 16,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  infoCard: {
    flexDirection: 'row',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing['2xl'],
    gap: Spacing.md,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  infoDescription: {
    fontSize: 17,
    lineHeight: 20,
  },
  form: {
    gap: Spacing.lg,
    marginBottom: Spacing['2xl'],
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: 17,
    fontWeight: '500',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  saveButton: {
    marginTop: Spacing.md,
  },
  noteCard: {
    flexDirection: 'row',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    marginBottom: Spacing['2xl'],
  },
  noteText: {
    fontSize: 17,
    flex: 1,
    lineHeight: 20,
  },
  paymentInfo: {
    gap: Spacing.md,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  paymentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  paymentText: {
    fontSize: 17,
  },
});
