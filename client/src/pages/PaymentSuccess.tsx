import { useEffect, useState } from 'react';
import { useSearch, Link } from 'wouter';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Package, Home, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function PaymentSuccess() {
  const searchParams = useSearch();
  const { user } = useAuth();
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const sessionId = params.get('session_id');
    
    if (sessionId) {
      confirmPayment(sessionId);
    } else {
      setError('No payment session found');
      setIsLoading(false);
    }
  }, [searchParams]);

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
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Payment received - your booking is confirmed</span>
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
