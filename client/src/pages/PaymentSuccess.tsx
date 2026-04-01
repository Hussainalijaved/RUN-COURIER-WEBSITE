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
const LOG = '[GoogleAds]';

function fireGoogleAdsConversion(value: number, transactionId: string) {
  const key = `rc_ads_conv_${transactionId}`;

  // ── Guard 1: sessionStorage duplicate prevention ─────────────────────────
  if (sessionStorage.getItem(key)) {
    console.log(`${LOG} Conversion Blocked by sessionStorage`, { key });
    return;
  }

  // Mark as fired BEFORE the async gtag call so a rapid re-render can't slip in
  sessionStorage.setItem(key, '1');

  const fire = () => {
    console.log(`${LOG} Google Ads Conversion Fired`, {
      send_to: CONVERSION_TAG,
      value,
      currency: 'GBP',
      transaction_id: transactionId,
    });
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'conversion', {
        send_to: CONVERSION_TAG,
        value,
        currency: 'GBP',
        transaction_id: transactionId,
      });
    } else {
      console.warn(`${LOG} window.gtag not available after polling — conversion could not be sent`);
    }
  };

  // gtag is deferred-loaded 2 s after page load in index.html — poll until ready
  if (typeof window.gtag === 'function') {
    fire();
  } else {
    console.log(`${LOG} window.gtag not yet ready — starting poll (max 6 s)`);
    let waited = 0;
    const timer = setInterval(() => {
      waited += 250;
      if (typeof window.gtag === 'function') {
        clearInterval(timer);
        fire();
      } else if (waited >= 6000) {
        clearInterval(timer);
        console.warn(`${LOG} window.gtag never became available — conversion not sent`);
        // Undo the sessionStorage mark so a future page load can retry
        sessionStorage.removeItem(key);
      }
    }, 250);
  }
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

  // Ref to prevent double-firing in StrictMode double-invoke
  const conversionFiredRef = useRef(false);

  // ── Step 1: Parse URL params and kick off confirmation if needed ──────────
  useEffect(() => {
    const params      = new URLSearchParams(searchParams);
    const sessionId   = params.get('session_id');
    const tracking    = params.get('tracking');
    const payLater    = params.get('payLater');
    const jn          = params.get('jobNumber');
    const amountParam = params.get('amount');

    console.log(`${LOG} PaymentSuccess mounted`, {
      route: '/payment/success',
      tracking,
      jobNumber: jn,
      amount: amountParam,
      payLater,
      sessionId,
    });

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

  // ── Step 2: When tracking is confirmed but amount is missing, fetch it ────
  // This handles the case where the customer lands on the page without ?amount=
  // in the URL (e.g. deployed site before the ?amount= fix, or manual navigation).
  useEffect(() => {
    if (!trackingNumber || isPayLater || isLoading || error || paidAmount !== null) return;

    console.log(`${LOG} Amount not in URL — fetching from server for tracking: ${trackingNumber}`);

    fetch(`/api/booking/confirmed-price?tracking=${encodeURIComponent(trackingNumber)}`)
      .then(r => r.json())
      .then(data => {
        if (typeof data.totalPrice === 'number' && data.totalPrice > 0) {
          console.log(`${LOG} Server returned totalPrice: ${data.totalPrice}`);
          setPaidAmount(data.totalPrice);
        } else {
          console.warn(`${LOG} Server returned no valid price:`, data);
          // Set 0 so the conversion fires even without price — better than not firing
          setPaidAmount(0);
        }
      })
      .catch(err => {
        console.error(`${LOG} Price fetch failed:`, err);
        setPaidAmount(0);
      });
  }, [trackingNumber, isPayLater, isLoading, error, paidAmount]);

  // ── Step 3: Fire conversion once all guards are satisfied ─────────────────
  useEffect(() => {
    const transactionId = jobNumber || trackingNumber;

    console.log(`${LOG} Conversion guard check`, {
      isPayLater,
      isLoading,
      error,
      trackingNumber,
      paidAmount,
      transactionId,
      'typeof window.gtag': typeof window.gtag,
      alreadyFiredThisRender: conversionFiredRef.current,
    });

    if (conversionFiredRef.current) {
      console.log(`${LOG} Conversion Skipped — already fired this render cycle`);
      return;
    }

    if (isPayLater) {
      console.log(`${LOG} Conversion Skipped — isPayLater: true (no card charge)`);
      return;
    }
    if (isLoading) {
      console.log(`${LOG} Conversion Skipped — isLoading: true (payment not yet confirmed)`);
      return;
    }
    if (error) {
      console.log(`${LOG} Conversion Skipped — error: "${error}"`);
      return;
    }
    if (!trackingNumber) {
      console.log(`${LOG} Conversion Skipped — trackingNumber: null`);
      return;
    }
    if (paidAmount === null) {
      console.log(`${LOG} Conversion Skipped — paidAmount: null (waiting for price fetch)`);
      return;
    }
    if (!transactionId) {
      console.log(`${LOG} Conversion Skipped — transactionId is empty`);
      return;
    }

    conversionFiredRef.current = true;
    fireGoogleAdsConversion(paidAmount, transactionId);

  }, [isPayLater, isLoading, error, trackingNumber, jobNumber, paidAmount]);

  // ── Auto-redirect countdown ───────────────────────────────────────────────
  useEffect(() => {
    if (!isLoading && !error && trackingNumber) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            const redirectUrl = user ? '/customer' : `/track?q=${trackingNumber}`;
            setLocation(redirectUrl);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isLoading, error, trackingNumber, user, setLocation]);

  // ── Stripe Checkout session confirmation (session_id path) ────────────────
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
      if (result.jobNumber)   setJobNumber(result.jobNumber);
      if (result.totalPrice)  setPaidAmount(parseFloat(String(result.totalPrice)));
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
                      <div className={jobNumber ? "pt-3 border-t border-primary/20" : ""}>
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
                  <Link href="/contact">
                    Contact Support
                  </Link>
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
