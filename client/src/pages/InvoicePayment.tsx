import { useState, useEffect } from 'react';
import { useParams, useSearch } from 'wouter';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  CreditCard, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Loader2,
  ShieldCheck,
  FileText,
  Calendar,
  Building2
} from 'lucide-react';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

interface InvoiceData {
  invoiceNumber: string;
  customerName: string;
  amount: number;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  notes: string | null;
}

function PaymentForm({ 
  invoiceData,
  token,
  onSuccess 
}: { 
  invoiceData: InvoiceData;
  token: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setIsProcessing(true);
    setPaymentError(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // Redirect back to this same page — the query params Stripe adds
        // (payment_intent, payment_intent_client_secret, redirect_status) are
        // detected on mount to show the success state without a separate route.
        return_url: `${window.location.origin}/invoice-pay/${token}`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setPaymentError(error.message || 'Payment failed. Please try again.');
      setIsProcessing(false);
      return;
    }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      await confirmPayment(token, paymentIntent.id, setIsConfirming, setPaymentError, onSuccess);
    } else if (paymentIntent && paymentIntent.status === 'requires_action') {
      setPaymentError('Additional authentication required. Please complete the verification.');
    } else {
      setPaymentError('Payment was not completed. Please try again.');
    }
    setIsProcessing(false);
  };

  if (isConfirming) {
    return (
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
        <CardContent className="pt-6 text-center">
          <Loader2 className="mx-auto h-12 w-12 text-blue-600 animate-spin mb-4" />
          <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200">Payment Successful!</h3>
          <p className="text-blue-700 dark:text-blue-300 mt-2">Confirming your payment…</p>
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
            Enter your card details to pay this invoice
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

      <Button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full h-14 text-lg"
        data-testid="button-pay-invoice"
      >
        {isProcessing ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Processing…
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-5 w-5" />
            Pay £{invoiceData.amount.toFixed(2)} Now
          </>
        )}
      </Button>

      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4" />
        <span>Secure payment powered by Stripe</span>
      </div>
    </form>
  );
}

async function confirmPayment(
  token: string,
  paymentIntentId: string,
  setIsConfirming: (v: boolean) => void,
  setPaymentError: (v: string | null) => void,
  onSuccess: () => void,
) {
  setIsConfirming(true);
  try {
    const response = await fetch(`/api/invoice-pay/${token}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId }),
    });
    if (response.ok) {
      onSuccess();
    } else {
      const data = await response.json();
      setPaymentError(data.error || 'Failed to confirm payment');
    }
  } catch {
    setPaymentError('Failed to confirm payment. Please contact support.');
  }
  setIsConfirming(false);
}

export default function InvoicePayment() {
  const { token } = useParams<{ token: string }>();
  const search = useSearch();

  const [invoiceData, setInvoiceData]   = useState<InvoiceData | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading]       = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // ── Detect Stripe redirect after 3DS authentication ──────────────────────
  useEffect(() => {
    if (!token) return;
    const params  = new URLSearchParams(search);
    const redirectStatus  = params.get('redirect_status');
    const paymentIntentId = params.get('payment_intent');

    if (redirectStatus === 'succeeded' && paymentIntentId) {
      // Customer was redirected back after completing 3DS — confirm the payment
      setIsLoading(false);
      setPaymentSuccess(false); // will flip via confirmPayment

      let confirmed = false;
      confirmPayment(
        token,
        paymentIntentId,
        (v) => { if (!confirmed) setIsLoading(v); },
        (msg) => { if (msg) setError(msg); },
        () => { confirmed = true; setPaymentSuccess(true); },
      );
      return;
    }

    if (redirectStatus === 'failed') {
      setIsLoading(false);
      setError('Payment authentication failed. Please try again.');
      return;
    }
  }, [token, search]);

  // ── Normal page load: fetch invoice + create payment intent ──────────────
  useEffect(() => {
    if (!token) return;

    // If we already handled a redirect above, don't re-fetch
    const params = new URLSearchParams(search);
    if (params.get('redirect_status')) return;

    const loadInvoice = async () => {
      try {
        const [invoiceResponse, intentResponse] = await Promise.all([
          fetch(`/api/invoice-pay/${token}`),
          fetch(`/api/invoice-pay/${token}/create-payment-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }),
        ]);

        if (!invoiceResponse.ok) {
          const data = await invoiceResponse.json();
          throw new Error(data.error || 'Failed to load invoice');
        }
        if (!intentResponse.ok) {
          const intentData = await intentResponse.json();
          throw new Error(intentData.error || 'Failed to initialise payment');
        }

        const [ivData, piData] = await Promise.all([
          invoiceResponse.json(),
          intentResponse.json(),
        ]);

        setInvoiceData(ivData);
        setClientSecret(piData.clientSecret);
      } catch (err: any) {
        setError(err.message || 'Failed to load invoice');
      } finally {
        setIsLoading(false);
      }
    };

    loadInvoice();
  }, [token, search]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 py-8 px-4">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <Skeleton className="h-14 w-48 mx-auto mb-4" />
            <Skeleton className="h-6 w-64 mx-auto" />
          </div>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <img src="/run-loader.png" alt="Run Courier" className="h-12 object-contain mx-auto" />
            </div>
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-full">
                <XCircle className="h-12 w-12 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <CardTitle className="text-2xl text-red-600">Payment Unavailable</CardTitle>
            <CardDescription className="text-base mt-2">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This invoice payment link may have expired, been paid, or is invalid.
              Please contact us if you need assistance.
            </p>
          </CardContent>
          <div className="p-6 pt-0 flex justify-center gap-4 flex-wrap">
            <Button variant="outline" asChild>
              <a href="/">Go to Homepage</a>
            </Button>
            <Button asChild>
              <a href="mailto:info@runcourier.co.uk">Contact Support</a>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (paymentSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg text-center">
          <CardHeader>
            <div className="mx-auto mb-4">
              <img src="/run-loader.png" alt="Run Courier" className="h-12 object-contain mx-auto" />
            </div>
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-full">
                <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <CardTitle className="text-2xl text-green-600">Payment Successful!</CardTitle>
            <CardDescription className="text-base mt-2">
              Thank you for your payment
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {invoiceData && (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-green-800 dark:text-green-200 font-semibold">
                  Invoice {invoiceData.invoiceNumber}
                </p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">
                  £{invoiceData.amount.toFixed(2)} paid
                </p>
              </div>
            )}
            <p className="text-muted-foreground">
              You will receive a confirmation email shortly with your payment receipt.
            </p>
            <Button asChild className="w-full">
              <a href="/">Go to Homepage</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!invoiceData || !clientSecret) return null;

  // ── Payment form ─────────────────────────────────────────────────────────
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
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <img src="/run-loader.png" alt="Run Courier" className="h-14 object-contain mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pay Invoice</h1>
          <p className="text-muted-foreground mt-2">Secure payment for your invoice</p>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice Details
              </CardTitle>
              <span className="font-mono text-sm bg-primary/10 text-primary px-3 py-1 rounded-full">
                {invoiceData.invoiceNumber}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Customer</p>
                <p className="font-medium">{invoiceData.customerName}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Period</p>
                <p className="font-medium">{invoiceData.periodStart} – {invoiceData.periodEnd}</p>
              </div>
            </div>

            {invoiceData.notes && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border-l-4 border-amber-400">
                <p className="text-sm text-amber-800 dark:text-amber-200">{invoiceData.notes}</p>
              </div>
            )}

            <Separator />

            <div className="flex justify-between items-center">
              <span className="text-lg font-semibold">Amount Due</span>
              <span className="text-2xl font-bold text-primary">
                £{invoiceData.amount.toFixed(2)}
              </span>
            </div>

            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>Due by {invoiceData.dueDate}</span>
            </div>
          </CardContent>
        </Card>

        <Elements
          stripe={stripePromise}
          options={{ clientSecret, appearance, loader: 'auto' }}
        >
          <PaymentForm
            invoiceData={invoiceData}
            token={token!}
            onSuccess={() => setPaymentSuccess(true)}
          />
        </Elements>

        <div className="text-center mt-8">
          <Separator className="mb-4" />
          <p className="text-sm text-muted-foreground mb-2">
            Prefer to pay by bank transfer?
          </p>
          <div className="bg-muted rounded-lg p-4 text-left text-sm">
            <p className="font-medium mb-2">Bank Details:</p>
            <p>Account Name: RUN COURIER</p>
            <p>Sort Code: 30-99-50</p>
            <p>Account Number: 36113363</p>
            <p className="mt-2">Reference: <span className="font-mono font-bold">{invoiceData.invoiceNumber}</span></p>
          </div>
        </div>

        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>Need help? <a href="mailto:info@runcourier.co.uk" className="text-primary hover:underline">Contact us</a></p>
          <p className="mt-2">
            Run Courier — Same Day Delivery Across the UK<br />
            <a href="https://www.runcourier.co.uk" className="text-primary hover:underline">www.runcourier.co.uk</a>
          </p>
        </div>
      </div>
    </div>
  );
}
