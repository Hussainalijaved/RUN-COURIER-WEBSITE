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
import { Loader2, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
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
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.href,
      },
      redirect: 'if_required',
    });

    if (error) {
      setPaymentError(error.message || 'Payment failed. Please try again.');
      setIsProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      setPaymentSuccess(true);
      
      try {
        const response = await apiRequest('POST', '/api/booking/confirm-embedded-payment', {
          paymentIntentId: paymentIntent.id,
          bookingData,
        });
        
        const result = await response.json();
        
        if (result.success) {
          onSuccess(result.trackingNumber, result.jobId);
        } else {
          setPaymentError('Payment successful but booking creation failed. Please contact support.');
        }
      } catch (err) {
        setPaymentError('Payment successful but booking creation failed. Please contact support.');
      }
    } else {
      setPaymentError('Payment was not completed. Please try again.');
    }

    setIsProcessing(false);
  };

  if (paymentSuccess) {
    return (
      <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
        <CardContent className="pt-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-600 mb-4" />
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">Payment Successful!</h3>
          <p className="text-green-700 dark:text-green-300 mt-2">Creating your booking...</p>
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
