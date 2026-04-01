import { useEffect, useRef, useState } from 'react';
import { useSearch, Link, useLocation } from 'wouter';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Package, Home, Loader2, AlertCircle, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

const CONVERSION_TAG = 'AW-17051034778/8V4hCmnKgpQceEJrJyMI_';

/**
 * Fire a Google Ads conversion event.
 *
 * • Deduplicates via sessionStorage (key = rc_ads_conv_<transactionId>).
 * • Polls window.gtag every 300 ms for up to 5 s (gtag is deferred in index.html).
 * • If gtag never arrives, removes the sessionStorage key so the next page load retries.
 */
function fireGoogleAdsConversion(value: number, transactionId: string) {
  const key = `rc_ads_conv_${transactionId}`;

  if (sessionStorage.getItem(key)) {
    console.log('[GoogleAds] Conversion already fired for', transactionId, '— skipping duplicate');
    return;
  }

  // Mark immediately so concurrent renders cannot slip through
  sessionStorage.setItem(key, '1');

  console.log('Firing Google Ads conversion', { trackingNumber: transactionId, paidAmount: value });

  const doFire = () => {
    window.gtag!('event', 'conversion', {
      send_to: CONVERSION_TAG,
      value: value || 1,
      currency: 'GBP',
      transaction_id: transactionId || String(Date.now()),
    });
    console.log('[GoogleAds] gtag conversion sent', { send_to: CONVERSION_TAG, value, transactionId });
  };

  if (typeof window.gtag === 'function') {
    doFire();
    return;
  }

  // gtag not yet ready — poll every 300 ms, give up after 5 s
  console.log('[GoogleAds] window.gtag not ready — polling every 300 ms (max 5 s)');
  let elapsed = 0;
  const interval = setInterval(() => {
    elapsed += 300;
    if (typeof window.gtag === 'function') {
      clearInterval(interval);
      doFire();
    } else if (elapsed >= 5000) {
      clearInterval(interval);
      // Remove lock so the next navigation can retry
      sessionStorage.removeItem(key);
      console.warn('[GoogleAds] window.gtag never became available — conversion not sent');
    }
  }, 300);
}

export default function PaymentSuccess() {
  const searchParams = useSearch();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [jobNumber, setJobNumber]           = useState<string | null>(null);
  const [isLoading, setIsLoading]           = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [isPayLater, setIsPayLater]         = useState(false);
  const [countdown, setCountdown]           = useState(5);
  const [paidAmount, setPaidAmount]         = useState<number | null>(null);

  // Prevent double-fire on React StrictMode double-invoke
  const conversionFiredRef = useRef(false);

  // ── Step 1: Parse URL and kick off any async confirmation ─────────────────
  useEffect(() => {
    const params      = new URLSearchParams(searchParams);
    const sessionId   = params.get('session_id');
    const tracking    = params.get('tracking');
    const payLater    = params.get('payLater');
    const jn          = params.get('jobNumber');
    const amountParam = params.get('amount');

    console.log('[PaymentSuccess] Params:', { tracking, jobNumber: jn, amount: amountParam, payLater, sessionId });

    if (jn)          setJobNumber(jn);
    if (amountParam) setPaidAmount(parseFloat(amountParam));

    if (payLater === 'true' && tracking) {
      setIsPayLater(true);
      setTrackingNumber(tracking);
      setIsLoading(false);
    } else if (tracking) {
      setTrackingNumber(tracking);
      setIsLoading(false);
    } else if (sessionId) {
      confirmPayment(sessionId);
    } else {
      setError('No payment session found');
      setIsLoading(false);
    }
  }, [searchParams]);

  // ── Step 2: Fire Google Ads conversion ───────────────────────────────────
  // Fires as soon as payment is confirmed and a trackingNumber is available.
  // Uses paidAmount if already known, falls back to 1 (value is a bonus — the
  // conversion event itself is what matters for Tag Assistant detection).
  // Does NOT block on the price fetch — avoids race with the 5-s redirect.
  useEffect(() => {
    if (isLoading || error || !trackingNumber) return;
    if (conversionFiredRef.current) return;
    conversionFiredRef.current = true;

    const transactionId = jobNumber || trackingNumber || String(Date.now());
    // Use real price if available in state; fall back to 1 so we never pass NaN/null
    const value = (paidAmount !== null && paidAmount > 0) ? paidAmount : 1;

    fireGoogleAdsConversion(value, transactionId);

    // If price wasn't in the URL, fetch it for display purposes only (not for conversion)
    if (paidAmount === null && !isPayLater) {
      fetch(`/api/booking/confirmed-price?tracking=${encodeURIComponent(trackingNumber)}`)
        .then(r => r.json())
        .then(d => {
          if (typeof d.totalPrice === 'number' && d.totalPrice > 0) {
            setPaidAmount(d.totalPrice);
          }
        })
        .catch(() => {}); // silent — display only
    }
  }, [isLoading, error, trackingNumber]); // intentionally not depending on paidAmount

  // ── Step 3: Auto-redirect countdown ──────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !error && trackingNumber) {
      const timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setLocation(user ? '/customer' : `/track?q=${trackingNumber}`);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isLoading, error, trackingNumber, user, setLocation]);

  // ── Stripe Checkout session confirmation ──────────────────────────────────
  const confirmPayment = async (sessionId: string) => {
    try {
      const response = await fetch('/api/booking/confirm-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to confirm payment');
      }

      setTrackingNumber(result.trackingNumber);
      if (result.jobNumber)  setJobNumber(result.jobNumber);
      if (result.totalPrice) setPaidAmount(parseFloat(String(result.totalPrice)));
      setIsLoading(false);
    } catch (err: any) {
      console.error('Payment confirmation error:', err);
      setError(err.message || 'Failed to confirm your booking. Please contact support.');
      setIsLoading(false);
    }
  };

  return (
    <PublicLayout>
      <div className="container max-w-2xl mx-auto py-12 px-4">
        <Card>
          <CardHeader className="text-center">
            {isLoading ? (
              <>
                <Loader2 className="h-16 w-16 text-primary mx-auto mb-4 animate-spin" />
                <CardTitle className="text-2xl">Processing Your Booking...</CardTitle>
                <CardDescription>Please wait while we confirm your payment</CardDescription>
              </>
            ) : error ? (
              <>
                <AlertCircle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
                <CardTitle className="text-2xl">Payment Issue</CardTitle>
                <CardDescription>{error}</CardDescription>
              </>
            ) : isPayLater ? (
              <>
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <CardTitle className="text-2xl">Booking Confirmed!</CardTitle>
                <CardDescription>Your delivery has been booked successfully - payment will be invoiced weekly</CardDescription>
              </>
            ) : (
              <>
                <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                <CardTitle className="text-2xl">Payment Successful!</CardTitle>
                <CardDescription>Your delivery has been booked and confirmed</CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {!isLoading && !error && (
              <>
                {(jobNumber || trackingNumber) && (
                  <div className="bg-primary/10 rounded-lg p-6 text-center space-y-4">
                    {jobNumber && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Your Job Number</p>
                        <p className="text-3xl font-bold text-primary font-mono" data-testid="text-job-number">
                          {jobNumber}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Use this number when contacting us about your delivery
                        </p>
                      </div>
                    )}
                    {trackingNumber && (
                      <div className={jobNumber ? 'pt-3 border-t border-primary/20' : ''}>
                        <p className="text-sm text-muted-foreground mb-1">Tracking Number</p>
                        <p className="text-lg font-medium text-primary font-mono" data-testid="text-tracking-number">
                          {trackingNumber}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Use this to track your delivery status online
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    {isPayLater ? (
                      <>
                        <Clock className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <span>Pay Later - you will be invoiced weekly for this booking</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>Payment received - your booking is confirmed</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-start gap-3">
                    <Package className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>A driver will be assigned to your delivery shortly</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Package className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>You'll receive updates via email and SMS</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Package className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <span>Track your delivery in real-time using your tracking number</span>
                  </div>
                </div>

                <div className="text-center text-sm text-muted-foreground" data-testid="text-redirect-countdown">
                  Redirecting in {countdown} second{countdown !== 1 ? 's' : ''}...
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  {trackingNumber && (
                    <Button asChild className="flex-1" data-testid="link-track-delivery">
                      <Link href={`/track?q=${trackingNumber}`}>
                        <Package className="mr-2 h-4 w-4" />
                        Track Delivery
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="outline" className="flex-1" data-testid="link-home">
                    <Link href={user ? '/customer' : '/'}>
                      <Home className="mr-2 h-4 w-4" />
                      {user ? 'Go to Dashboard' : 'Return Home'}
                    </Link>
                  </Button>
                </div>
              </>
            )}

            {!isLoading && error && (
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild className="flex-1" data-testid="link-contact">
                  <Link href="/contact">Contact Support</Link>
                </Button>
                <Button asChild variant="outline" className="flex-1" data-testid="link-home-error">
                  <Link href="/">
                    <Home className="mr-2 h-4 w-4" />
                    Return Home
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
