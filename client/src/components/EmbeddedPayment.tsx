import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
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

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

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
  totalPrice: number;
  distance: number;
  estimatedTime: number;
  isMultiDrop: boolean;
  isReturnTrip: boolean;
  customerId?: string;
  customerEmail?: string;
  scheduledPickupTime?: string | null;
  scheduledDeliveryTime?: string | null;
}

interface EmbeddedPaymentProps {
  bookingData: BookingData;
  onSuccess: (trackingNumber: string, jobId: string) => void;
  onCancel: () => void;
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
      const response = await apiRequest('POST', '/api/booking/confirm-embedded-payment', {
        paymentIntentId: intentId,
        bookingData,
      });
      
      const result = await response.json();
      
      if (result.success) {
        onSuccess(result.trackingNumber, result.jobId);
      } else {
        setBookingError(result.error || 'Failed to create booking. Your payment was successful - please contact support with your payment reference.');
        setIsConfirmingBooking(false);
      }
    } catch (err: any) {
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

export function EmbeddedPayment({ bookingData, onSuccess, onCancel }: EmbeddedPaymentProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const createPaymentIntent = async () => {
      try {
        const response = await apiRequest('POST', '/api/booking/create-payment-intent', bookingData);
        const data = await response.json();
        
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
          setPaymentIntentId(data.paymentIntentId);
        } else {
          setError(data.error || 'Failed to initialize payment');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to initialize payment');
      } finally {
        setIsLoading(false);
      }
    };

    createPaymentIntent();
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Initializing secure payment...</p>
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
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <PaymentForm 
        bookingData={bookingData} 
        onSuccess={onSuccess} 
        onCancel={onCancel}
        paymentIntentId={paymentIntentId!}
      />
    </Elements>
  );
}
