import { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, CreditCard, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

// Cache the stripe promise to avoid re-fetching
let stripePromiseCache: Promise<Stripe | null> | null = null;

async function getStripePromise(): Promise<Stripe | null> {
  if (stripePromiseCache) {
    return stripePromiseCache;
  }
  
  stripePromiseCache = (async () => {
    try {
      // First try build-time env var
      const buildTimeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
      if (buildTimeKey) {
        console.log('[Payment] Using build-time Stripe publishable key');
        return loadStripe(buildTimeKey);
      }
      
      // Fall back to fetching from API at runtime
      console.log('[Payment] Fetching Stripe config from API...');
      const response = await fetch('/api/stripe/config');
      if (!response.ok) {
        console.error('[Payment] Failed to fetch Stripe config');
        return null;
      }
      const { publishableKey } = await response.json();
      if (!publishableKey) {
        console.error('[Payment] No publishable key in config response');
        return null;
      }
      console.log('[Payment] Using runtime Stripe publishable key');
      return loadStripe(publishableKey);
    } catch (error) {
      console.error('[Payment] Error loading Stripe:', error);
      return null;
    }
  })();
  
  return stripePromiseCache;
}

interface BookingData {
  pickupPostcode: string;
  pickupAddress: string;
  pickupBuildingName: string;
  pickupName: string;
  pickupPhone: string;
  pickupInstructions: string;
  deliveryPostcode: string;
  deliveryAddress: string;
  deliveryBuildingName: string;
  recipientName: string;
  recipientPhone: string;
  deliveryInstructions: string;
  vehicleType: string;
  weight: number;
  basePrice?: number;
  distancePrice?: number;
  weightSurcharge?: number;
  multiDropCharge?: number;
  returnTripCharge?: number;
  centralLondonCharge?: number;
  waitingTimeCharge?: number;
  totalPrice: number;
  distance: number;
  estimatedTime: number;
  isMultiDrop: boolean;
  isReturnTrip: boolean;
  isCentralLondon?: boolean;
  isRushHour?: boolean;
  customerId?: string;
  customerEmail?: string;
  scheduledPickupTime?: string | null;
  scheduledDeliveryTime?: string | null;
}

interface EmbeddedPaymentProps {
  bookingData: BookingData;
  onSuccess: (trackingNumber: string, jobId: string) => void;
  onCancel: () => void;
  prefetchedClientSecret?: string;
  prefetchedPaymentIntentId?: string;
}

function PaymentForm({ 
  bookingData, 
  onSuccess, 
  onCancel,
  paymentIntentId 
}: EmbeddedPaymentProps & { paymentIntentId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmingBooking, setIsConfirmingBooking] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [paymentSucceeded, setPaymentSucceeded] = useState(false);
  const [confirmedPaymentIntentId, setConfirmedPaymentIntentId] = useState<string | null>(null);

  const confirmBooking = async (intentId: string) => {
    setIsConfirmingBooking(true);
    setBookingError(null);
    
    try {
      // Use fetch directly to handle error responses properly
      const response = await fetch('/api/booking/confirm-embedded-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: intentId,
          bookingData,
        }),
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        onSuccess(result.trackingNumber, result.jobId);
      } else {
        console.error('[Payment] Booking creation failed:', result);
        setBookingError(result.error || 'Failed to create booking. Your payment was successful - please contact support with your payment reference.');
        setIsConfirmingBooking(false);
      }
    } catch (err: any) {
      console.error('[Payment] Booking creation error:', err);
      setBookingError('Failed to create booking. Your payment was successful - please contact support.');
      setIsConfirmingBooking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);
    setBookingError(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment/complete`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setPaymentError(error.message || 'Payment failed. Please try again.');
      setIsProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      setPaymentSucceeded(true);
      setConfirmedPaymentIntentId(paymentIntent.id);
      setIsProcessing(false);
      
      await confirmBooking(paymentIntent.id);
    } else if (paymentIntent && paymentIntent.status === 'requires_action') {
      setPaymentError('Additional authentication required. Please complete the verification.');
      setIsProcessing(false);
    } else {
      setPaymentError('Payment was not completed. Please try again.');
      setIsProcessing(false);
    }
  };

  if (isConfirmingBooking) {
    return (
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
        <CardContent className="pt-6 text-center">
          <Loader2 className="mx-auto h-12 w-12 text-blue-600 animate-spin mb-4" />
          <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200">Payment Successful!</h3>
          <p className="text-blue-700 dark:text-blue-300 mt-2">Creating your booking...</p>
        </CardContent>
      </Card>
    );
  }

  if (bookingError && paymentSucceeded && confirmedPaymentIntentId) {
    return (
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
        <CardContent className="pt-6 text-center space-y-4">
          <AlertCircle className="mx-auto h-12 w-12 text-amber-600 mb-4" />
          <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200">Payment Received</h3>
          <p className="text-amber-700 dark:text-amber-300">{bookingError}</p>
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Reference: {confirmedPaymentIntentId}
          </p>
          <div className="flex gap-4 justify-center pt-2">
            <Button
              variant="outline"
              onClick={onCancel}
              data-testid="button-go-back"
            >
              Go Back
            </Button>
            <Button
              onClick={() => confirmBooking(confirmedPaymentIntentId)}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-retry-booking"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry Booking
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Details
          </CardTitle>
          <CardDescription>
            Enter your card details to complete the booking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentElement 
            options={{
              layout: 'tabs',
              wallets: {
                applePay: 'auto',
                googlePay: 'auto',
              },
              paymentMethodOrder: ['apple_pay', 'google_pay', 'card'],
            }}
          />
        </CardContent>
      </Card>

      {paymentError && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <p className="text-red-700 dark:text-red-300 text-sm">{paymentError}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1"
          data-testid="button-cancel-payment"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          className="flex-1 bg-primary hover:bg-primary/90"
          data-testid="button-confirm-payment"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            `Pay £${bookingData.totalPrice.toFixed(2)}`
          )}
        </Button>
      </div>
    </form>
  );
}

export function EmbeddedPayment({ 
  bookingData, 
  onSuccess, 
  onCancel, 
  prefetchedClientSecret,
  prefetchedPaymentIntentId 
}: EmbeddedPaymentProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(prefetchedClientSecret || null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(prefetchedPaymentIntentId || null);
  const [isLoading, setIsLoading] = useState(!prefetchedClientSecret);
  const [error, setError] = useState<string | null>(null);
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);
  const [stripeLoading, setStripeLoading] = useState(true);

  // Load Stripe instance
  useEffect(() => {
    getStripePromise().then((stripe) => {
      setStripeInstance(stripe);
      setStripeLoading(false);
    }).catch((err) => {
      console.error('[Payment] Failed to load Stripe:', err);
      setStripeLoading(false);
    });
  }, []);

  useEffect(() => {
    // Skip fetching if we have prefetched values
    if (prefetchedClientSecret && prefetchedPaymentIntentId) {
      console.log('[Payment] Using prefetched payment intent');
      return;
    }

    const createPaymentIntent = async () => {
      try {
        console.log('[Payment] Creating payment intent for amount:', bookingData.totalPrice);
        const response = await apiRequest('POST', '/api/booking/create-payment-intent', bookingData);
        const data = await response.json();
        
        if (data.clientSecret) {
          console.log('[Payment] Payment intent created successfully');
          setClientSecret(data.clientSecret);
          setPaymentIntentId(data.paymentIntentId);
        } else {
          console.error('[Payment] No client secret in response:', data);
          setError(data.error || 'Failed to initialize payment');
        }
      } catch (err: any) {
        console.error('[Payment] Error creating payment intent:', err);
        if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
          setError('Unable to start payment. Please check your internet connection and try again.');
        } else {
          setError(err.message || 'Failed to initialize payment. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    createPaymentIntent();
  }, [prefetchedClientSecret, prefetchedPaymentIntentId]);

  if (isLoading || stripeLoading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground font-medium">Setting up secure payment...</p>
            <p className="text-xs text-muted-foreground mt-1">Apple Pay, Google Pay & Cards accepted</p>
          </div>
          <div className="space-y-3 animate-pulse">
            <div className="h-12 bg-muted rounded-lg" />
            <div className="h-12 bg-muted rounded-lg" />
            <div className="flex gap-3">
              <div className="h-12 bg-muted rounded-lg flex-1" />
              <div className="h-12 bg-muted rounded-lg w-24" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-600 mb-4" />
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">Payment Error</h3>
          <p className="text-red-700 dark:text-red-300 mt-2">{error}</p>
          <Button variant="outline" onClick={onCancel} className="mt-4">
            Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!clientSecret) {
    return null;
  }

  if (!stripeInstance) {
    return (
      <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-600 mb-4" />
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">Payment Configuration Error</h3>
          <p className="text-red-700 dark:text-red-300 mt-2">Payment system is not configured. Please contact support.</p>
          <Button variant="outline" onClick={onCancel} className="mt-4">
            Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  const appearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#007BFF',
      colorBackground: '#ffffff',
      colorText: '#1a1a1a',
      colorDanger: '#ef4444',
      fontFamily: 'system-ui, sans-serif',
      borderRadius: '8px',
    },
  };

  return (
    <Elements 
      stripe={stripeInstance} 
      options={{ 
        clientSecret, 
        appearance,
        loader: 'auto',
      }}
    >
      <PaymentForm 
        bookingData={bookingData} 
        onSuccess={onSuccess} 
        onCancel={onCancel}
        paymentIntentId={paymentIntentId!}
      />
    </Elements>
  );
}
