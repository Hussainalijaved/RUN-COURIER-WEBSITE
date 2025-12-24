import { useEffect, useState } from 'react';
import { useSearch, Link, useLocation } from 'wouter';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Package, Home, Loader2, AlertCircle, Clock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function PaymentSuccess() {
  const searchParams = useSearch();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPayLater, setIsPayLater] = useState(false);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const sessionId = params.get('session_id');
    const tracking = params.get('tracking');
    const payLater = params.get('payLater');
    
    if (payLater === 'true' && tracking) {
      setIsPayLater(true);
      setTrackingNumber(tracking);
      setIsLoading(false);
    } else if (tracking) {
      // Embedded payment already confirmed - just show success
      setTrackingNumber(tracking);
      setIsLoading(false);
    } else if (sessionId) {
      confirmPayment(sessionId);
    } else {
      setError('No payment session found');
      setIsLoading(false);
    }
  }, [searchParams]);

  // Auto-redirect countdown after booking is confirmed
  useEffect(() => {
    if (!isLoading && !error && trackingNumber) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            // Redirect to customer dashboard if logged in, otherwise to tracking page
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
                {trackingNumber && (
                  <div className="bg-primary/10 rounded-lg p-6 text-center">
                    <p className="text-sm text-muted-foreground mb-2">Your Tracking Number</p>
                    <p className="text-2xl font-bold text-primary font-mono" data-testid="text-tracking-number">
                      {trackingNumber}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Save this number to track your delivery
                    </p>
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

                {/* Auto-redirect countdown */}
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
