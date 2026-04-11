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

interface InvoiceData {
  invoiceNumber: string;
  customerName: string;
  amount: number;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  notes: string | null;
}

// Load Stripe once from official CDN via loadStripe
let stripeInstanceCache: any = null;
async function getStripe(): Promise<any> {
  if (stripeInstanceCache) return stripeInstanceCache;
  let publishableKey = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) || '';
  if (!publishableKey) {
    try {
      const res = await fetch('/api/stripe/config');
      if (res.ok) {
        const cfg = await res.json();
        publishableKey = cfg.publishableKey || '';
      }
    } catch { /* ignore */ }
  }
  if (!publishableKey) throw new Error('Stripe not configured');
  const { loadStripe } = await import('@stripe/stripe-js');
  const stripe = await loadStripe(publishableKey);
  if (!stripe) throw new Error('Failed to load Stripe');
  stripeInstanceCache = stripe;
  return stripe;
}

export default function InvoicePayment() {
  const { token } = useParams<{ token: string }>();
  const search = useSearch();

  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Payment form state
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [cardMounted, setCardMounted] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);

  // Refs for vanilla Stripe mounting
  const paymentElementRef = useRef<HTMLDivElement>(null);
  const stripeRef        = useRef<any>(null);
  const elementsRef      = useRef<any>(null);
  const clientSecretRef  = useRef<string | null>(null);

  // ── Handle 3DS redirect return ─────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams(search);
    const redirectStatus = params.get('redirect_status');
    const piId = params.get('payment_intent');

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

  // ── Fetch invoice + create PaymentIntent ───────────────────────────────
  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams(search);
    if (params.get('redirect_status')) return;

    (async () => {
      try {
        const invoiceRes = await fetch(`/api/invoice-pay/${token}`);
        if (!invoiceRes.ok) {
          const d = await invoiceRes.json();
          throw new Error(d.error || 'Failed to load invoice');
        }
        const ivData: InvoiceData = await invoiceRes.json();
        setInvoiceData(ivData);

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
        clientSecretRef.current = clientSecret;

        setIsLoading(false);
        setCardLoading(true);
      } catch (err: any) {
        setPageError(err.message || 'Failed to load invoice');
        setIsLoading(false);
      }
    })();
  }, [token, search]);

  // ── Mount Stripe PaymentElement once DOM ref is ready ──────────────────
  useEffect(() => {
    if (!cardLoading || !clientSecretRef.current || !paymentElementRef.current) return;
    if (elementsRef.current) return; // already mounted

    let destroyed = false;
    (async () => {
      try {
        const stripe = await getStripe();
        if (destroyed) return;
        stripeRef.current = stripe;

        const elements = stripe.elements({
          clientSecret: clientSecretRef.current,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#007BFF',
              colorBackground: '#ffffff',
              colorText: '#1a1a1a',
              colorDanger: '#ef4444',
              fontFamily: 'system-ui, sans-serif',
              borderRadius: '8px',
            },
          },
        });
        elementsRef.current = elements;

        const paymentElement = elements.create('payment', {
          layout: { type: 'tabs', defaultCollapsed: false },
          wallets: { applePay: 'auto', googlePay: 'auto' },
        });

        paymentElement.on('ready', () => {
          if (!destroyed) {
            setCardLoading(false);
            setCardMounted(true);
          }
        });

        paymentElement.on('loaderror', (e: any) => {
          if (!destroyed) {
            setCardLoading(false);
            setPaymentError(
              (e?.error?.message) || 'Payment form failed to load. Please refresh the page.'
            );
          }
        });

        if (paymentElementRef.current) {
          paymentElement.mount(paymentElementRef.current);
        }
      } catch (err: any) {
        if (!destroyed) {
          setCardLoading(false);
          setPaymentError(err.message || 'Failed to initialise payment form.');
        }
      }
    })();

    return () => {
      destroyed = true;
    };
  }, [cardLoading]);

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
    } else if (paymentIntent) {
      setPaymentError('Payment was not completed. Please try again.');
    }
    setIsProcessing(false);
  };

  // ── Loading ─────────────────────────────────────────────────────────────
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

  // ── Error ────────────────────────────────────────────────────────────────
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

  // ── Payment page ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 py-8 px-4">
      <div className="max-w-lg mx-auto">

        <div className="text-center mb-8">
          <img src="/run-loader.png" alt="Run Courier" className="h-14 object-contain mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pay Invoice</h1>
          <p className="text-muted-foreground mt-2">Secure payment for your invoice</p>
        </div>

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

        {/* Payment form — vanilla Stripe mounting via ref */}
        <form onSubmit={handleSubmit} className="space-y-5">
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
              {/* Loading indicator — shown while Stripe iframe loads */}
              {cardLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading secure payment form…</span>
                </div>
              )}

              {/* This div is where Stripe mounts its payment iframe.
                  MUST always be in the DOM and visible — Stripe cannot mount into display:none */}
              <div
                ref={paymentElementRef}
                id="payment-element"
              />
            </CardContent>
          </Card>

          {paymentError && (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <p className="text-red-700 dark:text-red-300 text-sm">{paymentError}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={isProcessing || !cardMounted}
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
                Pay {invoiceData ? `£${invoiceData.amount.toFixed(2)}` : ''} Now
              </>
            )}
          </Button>

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span>Secure payment powered by Stripe</span>
          </div>
        </form>

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
