import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { ScreenKeyboardAwareScrollView } from '@/components/ScreenKeyboardAwareScrollView';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/Card';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';

export function PaymentScreen() {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const { amount } = route.params || {};

  const handlePayment = () => {
    window.alert('Mobile Payment Required\n\nTo complete your payment securely, please scan the QR code with Expo Go and use the mobile app.');
  };

  return (
    <ScreenKeyboardAwareScrollView hasTabBar={true}>
      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Payment Summary</ThemedText>
        <View style={styles.summaryRow}>
          <ThemedText style={{ color: theme.secondaryText }}>Total Amount</ThemedText>
          <ThemedText style={[styles.amount, { color: theme.primary }]}>
            {'\u00A3'}{amount}
          </ThemedText>
        </View>
      </Card>

      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Payment Method</ThemedText>
        <View style={styles.paymentInfo}>
          <View style={[styles.cardIconContainer, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="credit-card" size={32} color={theme.primary} />
          </View>
          <ThemedText style={[styles.paymentDescription, { color: theme.secondaryText }]}>
            Secure payment available via Expo Go mobile app
          </ThemedText>
        </View>
      </Card>

      <Card style={[styles.section, styles.securityNote] as any}>
        <View style={styles.securityRow}>
          <Feather name="shield" size={16} color={theme.success} />
          <ThemedText style={[styles.securityText, { color: theme.secondaryText }]}>
            Your payment is secure and encrypted with bank-level security
          </ThemedText>
        </View>
      </Card>

      <Pressable
        style={[styles.payButton, { backgroundColor: theme.primary }]}
        onPress={handlePayment}
      >
        <Feather name="smartphone" size={20} color="#fff" />
        <ThemedText style={styles.payButtonText}>
          Pay on Mobile App
        </ThemedText>
      </Pressable>

      <ThemedText style={[styles.webNote, { color: theme.secondaryText }]}>
        For card payment, scan the QR code with Expo Go
      </ThemedText>

      <ThemedText style={[styles.disclaimer, { color: theme.secondaryText }]}>
        By completing this payment, you agree to our terms of service
      </ThemedText>
    </ScreenKeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  section: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h4,
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amount: {
    ...Typography.h2,
  },
  paymentInfo: {
    alignItems: 'center',
    padding: Spacing.lg,
  },
  cardIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  paymentDescription: {
    ...Typography.body,
    textAlign: 'center',
  },
  securityNote: {
    padding: Spacing.md,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  securityText: {
    ...Typography.caption,
    flex: 1,
  },
  payButton: {
    flexDirection: 'row',
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  payButtonText: {
    ...Typography.button,
    color: '#fff',
  },
  webNote: {
    ...Typography.caption,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  disclaimer: {
    ...Typography.caption,
    textAlign: 'center',
    marginBottom: Spacing['3xl'],
  },
});
