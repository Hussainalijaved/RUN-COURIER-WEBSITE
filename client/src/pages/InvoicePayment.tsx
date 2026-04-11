import { useState, useEffect, useRef } from 'react';
import { useParams, useSearch } from 'wouter';
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
  Building2,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface InvoiceData {
  invoiceNumber: string;
  customerName: string;
  amount: number;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  notes: string | null;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function InvoicePayment() {
  const { token } = useParams<{ token: string }>();
  const search   = useSearch();

  const [invoiceData, setInvoiceData]       = useState<InvoiceData | null>(null);
  const [isLoading, setIsLoading]           = useState(true);
  const [pageError, setPageError]           = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [isProcessing, setIsProcessing]     = useState(false);
  const [paymentError, setPaymentError]     = useState<string | null>(null);
  const [stripeReady, setStripeReady]       = useState(false);

  // Refs for the vanilla Stripe instances so they survive re-renders
  const stripeRef   = useRef<any>(null);
  const elementsRef = useRef<any>(null);
  const mountedRef  = useRef(false);

  // div that Stripe will mount its PaymentElement iframe into
  const paymentElementRef = useRef<HTMLDivElement>(null);

  // ── Detect Stripe redirect after 3DS ──────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const params         = new URLSearchParams(search);
    const redirectStatus = params.get('redirect_status');
    const piId           = params.get('payment_intent');

    if (redirectStatus === 'succeeded' && piId) {
      setIsLoading(false);
      (async () => {
        try {
          const r = await fetch(`/api/invoice-pay/${token}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntentId: piId }),
          });
          if (r.ok) {
            setPaymentSuccess(true);
          } else {
            const d = await r.json();
            setPageError(d.error || 'Failed to confirm payment');
          }
        } catch {
          setPageError('Failed to confirm payment. Please contact support.');
        }
      })();
      return;
    }

    if (redirectStatus === 'failed') {
      setIsLoading(false);
      setPageError('Payment authentication failed. Please try again.');
    }
  }, [token, search]);

  // ── Fetch invoice details + create PaymentIntent ───────────────────────
  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams(search);
    if (params.get('redirect_status')) return; // handled above

    (async () => {
      try {
        // 1. Fetch invoice details
        const invoiceRes = await fetch(`/api/invoice-pay/${token}`);
        if (!invoiceRes.ok) {
          const d = await invoiceRes.json();
          throw new Error(d.error || 'Failed to load invoice');
        }
        const ivData: InvoiceData = await invoiceRes.json();
        setInvoiceData(ivData);

        // 2. Create (or reuse) the PaymentIntent
        const intentRes = await fetch(`/api/invoice-pay/${token}/create-payment-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!intentRes.ok) {
          const d = await intentRes.json();
          throw new Error(d.error || 'Failed to initialise payment');
        }
        const { clientSecret } = await intentRes.json();
        if (!clientSecret) throw new Error('No client secret returned from server');

        // 3. Load Stripe publishable key
        let publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
        if (!publishableKey) {
          const cfgRes = await fetch('/api/stripe/config');
          if (!cfgRes.ok) throw new Error('Could not load payment configuration');
          const cfg = await cfgRes.json();
          publishableKey = cfg.publishableKey;
        }
        if (!publishableKey) throw new Error('Payment system is not configured');

        // 4. Initialise Stripe.js — it's already loaded via @stripe/stripe-js in the bundle
        //    We use the global loadStripe from the package to avoid a second network fetch.
        const { loadStripe } = await import('@stripe/stripe-js');
        const stripe = await loadStripe(publishableKey);
        if (!stripe) throw new Error('Failed to load Stripe');
        stripeRef.current = stripe;

        // 5. Create Elements instance with the clientSecret
        const elements = stripe.elements({
          clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary:     '#007BFF',
              colorBackground:  '#ffffff',
              colorText:        '#1a1a1a',
              colorDanger:      '#ef4444',
              fontFamily:       'system-ui, sans-serif',
              borderRadius:     '8px',
            },
          },
          loader: 'auto',
        });
        elementsRef.current = elements;

        setIsLoading(false);
      } catch (err: any) {
        setPageError(err.message || 'Failed to load invoice');
        setIsLoading(false);
      }
    })();
  }, [token, search]);

  // ── Mount the PaymentElement once the div is in the DOM ───────────────
  useEffect(() => {
    if (
      isLoading ||
      pageError ||
      paymentSuccess ||
      !elementsRef.current ||
      !paymentElementRef.current ||
      mountedRef.current
    ) return;

    mountedRef.current = true;

    const paymentElement = elementsRef.current.create('payment', {
      layout: {
        type: 'tabs',
        defaultCollapsed: false,
      },
      wallets: {
        applePay: 'auto',
        googlePay: 'auto',
      },
      paymentMethodOrder: ['apple_pay', 'google_pay', 'card'],
    });

    paymentElement.mount(paymentElementRef.current);

    paymentElement.on('ready', () => {
      setStripeReady(true);
    });

    paymentElement.on('loaderError', (event: any) => {
      console.error('[Stripe] PaymentElement loaderError', event);
      setPaymentError('Payment form failed to load. Please refresh and try again.');
    });

    return () => {
      // Unmount cleanly if component is destroyed
      try { paymentElement.unmount(); } catch { /* ignore */ }
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, pageError, paymentSuccess]);

  // ── Handle form submission ─────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripeRef.current || !elementsRef.current || isProcessing) return;

    setIsProcessing(true);
    setPaymentError(null);

    const { error, paymentIntent } = await stripeRef.current.confirmPayment({
      elements: elementsRef.current,
      confirmParams: {
        return_url: `${window.location.origin}/invoice-pay/${token}`,
      },
      redirect: 'if_required',
    });

    if (error) {
      setPaymentError(error.message || 'Payment failed. Please try again.');
      setIsProcessing(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      setIsProcessing(false);
      try {
        const r = await fetch(`/api/invoice-pay/${token}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
        });
        if (r.ok) {
          setPaymentSuccess(true);
        } else {
          const d = await r.json();
          setPaymentError(d.error || 'Payment received but confirmation failed. Please contact support.');
        }
      } catch {
        setPaymentError('Payment received but confirmation failed. Please contact support.');
      }
    } else {
      setPaymentError('Payment was not completed. Please try again.');
      setIsProcessing(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────
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
              <div className="text-center pt-4">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-2" />
                <p className="text-sm text-muted-foreground">Setting up secure payment…</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────
  if (pageError) {
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
            <CardDescription className="text-base mt-2">{pageError}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This invoice payment link may have expired, been paid, or is invalid.
              Please contact us if you need assistance.
            </p>
          </CardContent>
          <div className="p-6 pt-0 flex justify-center gap-4 flex-wrap">
            <Button variant="outline" onClick={() => window.location.reload()}>Try Again</Button>
            <Button asChild><a href="mailto:info@runcourier.co.uk">Contact Support</a></Button>
          </div>
        </Card>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────
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
            <CardDescription className="text-base mt-2">Thank you for your payment</CardDescription>
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
            <Button asChild className="w-full"><a href="/">Go to Homepage</a></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Payment page ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 py-8 px-4">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <img src="/run-loader.png" alt="Run Courier" className="h-14 object-contain mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pay Invoice</h1>
          <p className="text-muted-foreground mt-2">Secure payment for your invoice</p>
        </div>

        {/* Invoice details */}
        {invoiceData && (
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
                <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{invoiceData.customerName}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-sm text-muted-foreground">Billing period</p>
                  <p className="font-medium">{invoiceData.periodStart} – {invoiceData.periodEnd}</p>
                </div>
              </div>

              {invoiceData.notes && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
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
        )}

        {/* Payment form */}
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Card for payment element */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-5 w-5" />
                Payment Details
              </CardTitle>
              <CardDescription>
                Enter your card details — Apple Pay &amp; Google Pay also accepted
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Stripe mounts its iframe here */}
              <div
                ref={paymentElementRef}
                id="payment-element"
                style={{ minHeight: '160px' }}
              />

              {/* Show a subtle spinner while Stripe's iframe loads */}
              {!stripeReady && (
                <div className="flex items-center justify-center gap-2 pt-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading payment form…</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment error */}
          {paymentError && (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <p className="text-red-700 dark:text-red-300 text-sm">{paymentError}</p>
            </div>
          )}

          {/* Pay button */}
          <Button
            type="submit"
            disabled={isProcessing || !stripeReady}
            className="w-full"
            size="lg"
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
                Pay £{invoiceData?.amount.toFixed(2)} Now
              </>
            )}
          </Button>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span>Secure payment powered by Stripe</span>
          </div>
        </form>

        {/* Bank transfer alternative */}
        {invoiceData && (
          <div className="text-center mt-8">
            <Separator className="mb-4" />
            <p className="text-sm text-muted-foreground mb-2">Prefer to pay by bank transfer?</p>
            <div className="bg-muted rounded-lg p-4 text-left text-sm space-y-1">
              <p className="font-medium">Bank Details:</p>
              <p>Account Name: <span className="font-semibold">RUN COURIER</span></p>
              <p>Sort Code: <span className="font-mono">30-99-50</span></p>
              <p>Account Number: <span className="font-mono">36113363</span></p>
              <p className="pt-1">
                Reference: <span className="font-mono font-bold">{invoiceData.invoiceNumber}</span>
              </p>
            </div>
          </div>
        )}

        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>
            Need help?{' '}
            <a href="mailto:info@runcourier.co.uk" className="text-primary hover:underline">
              Contact us
            </a>
          </p>
          <p className="mt-2">
            Run Courier — Same Day Delivery Across the UK
            <br />
            <a href="https://www.runcourier.co.uk" className="text-primary hover:underline">
              www.runcourier.co.uk
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
