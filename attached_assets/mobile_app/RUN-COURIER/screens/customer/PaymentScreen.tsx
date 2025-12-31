import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { StripeProvider, useStripe } from '@stripe/stripe-react-native';
import { ScreenKeyboardAwareScrollView } from '@/components/ScreenKeyboardAwareScrollView';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/Card';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { customerService } from '@/services/customerService';
import { sendBookingConfirmationEmail } from '@/services/emailService';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';
import Constants from 'expo-constants';

const getConfig = () => {
  try {
    const extra = 
      Constants.expoConfig?.extra ||
      (Constants as any).manifest?.extra ||
      (Constants as any).manifest2?.extra?.expoClient?.extra ||
      {};
    
    const stripeKey = extra.stripePublishableKey || 
      (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) || '';
    
    const apiUrl = extra.apiUrl || 
      (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) || '';
    
    return { stripeKey, apiUrl };
  } catch (error) {
    console.warn('Failed to get config from Constants:', error);
    return { stripeKey: '', apiUrl: '' };
  }
};

const config = getConfig();

// API URL for payment backend - uses EXPO_PUBLIC_API_URL as-is, no port manipulation
const API_BASE_URL = config.apiUrl || '';

function NativePaymentContent() {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const stripe = useStripe();
  const { user, userRole, customerProfile } = useAuth();
  const { bookingId, trackingNumber, amount: rawAmount, paymentOption: routePaymentOption } = route.params || {};
  
  const [loading, setLoading] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amount = typeof rawAmount === 'string' ? parseFloat(rawAmount) : (rawAmount || 0);
  const amountDisplay = isNaN(amount) ? '0.00' : amount.toFixed(2);
  
  const isBusiness = userRole === 'business';
  const canPayLater = isBusiness && customerProfile?.pay_later_enabled === true;
  const paymentOption = routePaymentOption || 'pay_now';
  const showInvoiceFlow = isBusiness && paymentOption === 'pay_later' && canPayLater;

  const sendConfirmationEmail = async () => {
    try {
      const booking = await customerService.getBookingById(bookingId);
      if (!booking || !user?.email) return;
      
      await sendBookingConfirmationEmail({
        customerEmail: user.email,
        customerName: customerProfile?.full_name || 'Customer',
        trackingNumber: booking.tracking_number,
        pickupAddress: booking.pickup_address,
        deliveryAddress: booking.delivery_address,
        scheduledDate: booking.scheduled_date,
        scheduledTime: booking.scheduled_time,
        price: booking.price_final || booking.price_estimate,
        vehicleType: booking.vehicle_type,
      });
    } catch (err) {
      console.warn('Failed to send confirmation email:', err);
    }
  };

  const initializePayment = async () => {
    if (showInvoiceFlow) return;
    
    if (isNaN(amount) || amount <= 0) {
      console.error('Payment error: Invalid amount', amount);
      setError('Invalid payment amount. Please go back and try again.');
      return;
    }
    
    if (!API_BASE_URL) {
      console.error('Payment config error: API_BASE_URL not configured');
      setError('Payment backend is not configured. Please contact support.');
      return;
    }

    console.log('Initializing payment with API:', API_BASE_URL, 'amount:', amount);
    setLoading(true);
    setError(null);
    
    try {
      const endpoint = `${API_BASE_URL}/api/stripe/create-payment-intent`;
      console.log('Calling:', endpoint);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amount,
          currency: 'gbp',
          bookingId,
          trackingNumber: trackingNumber || '',
          customerId: user?.id,
          customerEmail: user?.email,
        }),
      });

      console.log('Response status:', response.status);
      
      // Check if response is JSON (valid API response) or HTML (404/error page)
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Payment API returned non-JSON response:', contentType);
        setError('Payment service temporarily unavailable. Please try again later.');
        return;
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Payment API error:', errorData);
        setError(errorData.error || `Server error: ${response.status}`);
        return;
      }

      const data = await response.json();
      console.log('Payment intent created:', data.paymentIntentId ? 'success' : 'failed');
      
      if (data.error) {
        setError(data.error);
        return;
      }

      setPaymentIntentId(data.paymentIntentId);

      const { error: initError } = await stripe.initPaymentSheet({
        paymentIntentClientSecret: data.clientSecret,
        merchantDisplayName: 'Run Courier',
        style: 'automatic',
        returnURL: 'runcourier://payment-complete',
      });

      if (initError) {
        console.error('Stripe init error:', initError.message);
        setError(initError.message);
      } else {
        console.log('PaymentSheet initialized successfully');
        setPaymentReady(true);
      }
    } catch (err: any) {
      console.error('Payment setup failed:', err.message);
      setError('Failed to connect to payment server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!showInvoiceFlow) {
      initializePayment();
    }
  }, [showInvoiceFlow]);

  const handlePayment = async () => {
    if (!paymentReady || !paymentIntentId) return;

    setLoading(true);
    try {
      const { error } = await stripe.presentPaymentSheet();

      if (error) {
        if (error.code !== 'Canceled') {
          Alert.alert('Payment Failed', error.message);
        }
      } else {
        // Payment sheet completed successfully - Stripe has confirmed the payment
        // Try to verify with our backend, but don't block success if endpoint unavailable
        try {
          const verifyResponse = await fetch(`${API_BASE_URL}/api/stripe/confirm-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paymentIntentId,
              bookingId,
            }),
          });

          const contentType = verifyResponse.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const result = await verifyResponse.json();
            if (verifyResponse.ok && result.succeeded) {
              await sendConfirmationEmail();
              Alert.alert(
                'Payment Successful',
                'Your delivery has been booked and paid for!',
                [{ text: 'OK', onPress: () => navigation.popToTop() }]
              );
              return;
            }
          }
        } catch (verifyError) {
          console.log('Payment verification skipped:', verifyError);
        }

        // Payment still succeeded via Stripe - send confirmation email
        await sendConfirmationEmail();
        Alert.alert(
          'Payment Successful',
          'Your delivery has been booked and paid for!',
          [{ text: 'OK', onPress: () => navigation.popToTop() }]
        );
      }
    } catch (error: any) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmBusinessBooking = async () => {
    setLoading(true);
    try {
      await customerService.updateBookingStatus(bookingId, 'confirmed');
      await sendConfirmationEmail();
      Alert.alert(
        'Booking Confirmed',
        'Your delivery has been booked. An invoice will be sent to your business account.',
        [{ text: 'OK', onPress: () => navigation.popToTop() }]
      );
    } catch (err: any) {
      Alert.alert('Error', 'Failed to confirm booking. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (showInvoiceFlow) {
    return (
      <ScreenKeyboardAwareScrollView hasTabBar={true}>
        <Card style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Booking Summary</ThemedText>
          <View style={styles.summaryRow}>
            <ThemedText style={{ color: theme.secondaryText }}>Total Amount</ThemedText>
            <ThemedText style={[styles.amount, { color: theme.primary }]}>
              {'\u00A3'}{amountDisplay}
            </ThemedText>
          </View>
        </Card>

        <Card style={styles.section}>
          <View style={styles.paymentInfo}>
            <View style={[styles.cardIconContainer, { backgroundColor: theme.primary + '15' }]}>
              <Feather name="file-text" size={32} color={theme.primary} />
            </View>
            <ThemedText style={[styles.sectionTitle, { marginBottom: Spacing.sm }]}>
              Pay Later - Weekly Invoice
            </ThemedText>
            <ThemedText style={[styles.paymentDescription, { color: theme.secondaryText }]}>
              This delivery will be added to your weekly invoice. No upfront payment required.
            </ThemedText>
          </View>
        </Card>

        <Pressable
          style={[styles.payButton, { backgroundColor: theme.primary }, loading && { opacity: 0.6 }]}
          onPress={handleConfirmBusinessBooking}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="check-circle" size={20} color="#fff" />
          )}
          <ThemedText style={styles.payButtonText}>
            {loading ? 'Confirming...' : 'Confirm Booking'}
          </ThemedText>
        </Pressable>

        <ThemedText style={[styles.disclaimer, { color: theme.secondaryText }]}>
          An invoice will be sent to your registered business email weekly
        </ThemedText>
      </ScreenKeyboardAwareScrollView>
    );
  }

  return (
    <ScreenKeyboardAwareScrollView hasTabBar={true}>
      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Payment Summary</ThemedText>
        <View style={styles.summaryRow}>
          <ThemedText style={{ color: theme.secondaryText }}>Total Amount</ThemedText>
          <ThemedText style={[styles.amount, { color: theme.primary }]}>
            {'\u00A3'}{amountDisplay}
          </ThemedText>
        </View>
      </Card>

      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Payment Method</ThemedText>
        
        {error ? (
          <View style={styles.paymentInfo}>
            <View style={[styles.cardIconContainer, { backgroundColor: theme.error + '20' }]}>
              <Feather name="alert-circle" size={32} color={theme.error} />
            </View>
            <ThemedText style={[styles.paymentDescription, { color: theme.error }]}>
              {error}
            </ThemedText>
            <Pressable
              style={[styles.retryButton, { borderColor: theme.primary }]}
              onPress={initializePayment}
            >
              <ThemedText style={{ color: theme.primary }}>Retry</ThemedText>
            </Pressable>
          </View>
        ) : loading && !paymentReady ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <ThemedText style={[styles.loadingText, { color: theme.secondaryText }]}>
              Setting up secure payment...
            </ThemedText>
          </View>
        ) : (
          <View style={styles.paymentInfo}>
            <View style={[styles.cardIconContainer, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="credit-card" size={32} color={theme.primary} />
            </View>
            <ThemedText style={[styles.paymentDescription, { color: theme.secondaryText }]}>
              Secure payment powered by Stripe
            </ThemedText>
          </View>
        )}
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
        style={[
          styles.payButton, 
          { backgroundColor: theme.primary }, 
          (!paymentReady || loading || error) && { opacity: 0.6 }
        ]}
        onPress={handlePayment}
        disabled={!paymentReady || loading || !!error}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Feather name="lock" size={20} color="#fff" />
        )}
        <ThemedText style={styles.payButtonText}>
          {loading ? 'Processing...' : `Pay \u00A3${amountDisplay}`}
        </ThemedText>
      </Pressable>

      <ThemedText style={[styles.disclaimer, { color: theme.secondaryText }]}>
        By completing this payment, you agree to our terms of service
      </ThemedText>
    </ScreenKeyboardAwareScrollView>
  );
}

export function PaymentScreen() {
  const { theme } = useTheme();
  
  // Use Stripe publishable key from environment config
  const publishableKey = config.stripeKey;

  if (!publishableKey) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.errorContainer}>
          <Feather name="credit-card" size={48} color={theme.secondaryText} />
          <ThemedText style={[styles.errorTitle, { color: theme.text }]}>
            Payment Unavailable
          </ThemedText>
          <ThemedText style={{ color: theme.secondaryText, textAlign: 'center', padding: Spacing.lg }}>
            The payment system is currently being configured. Please try again later or contact support.
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <StripeProvider publishableKey={publishableKey}>
      <NativePaymentContent />
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  errorTitle: {
    ...Typography.h3,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
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
  loadingContainer: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    ...Typography.body,
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
  disclaimer: {
    ...Typography.caption,
    textAlign: 'center',
    marginBottom: Spacing['3xl'],
  },
  retryButton: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
  },
});
