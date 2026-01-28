import { useState, useEffect } from 'react';
import { useParams } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { 
  MapPin, 
  Package, 
  Truck, 
  Scale, 
  Navigation, 
  CreditCard, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Loader2,
  ShieldCheck
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface PaymentLinkData {
  trackingNumber: string;
  amount: string;
  expiresAt: string;
  pickup: {
    address: string;
    postcode: string;
  };
  delivery: {
    address: string;
    postcode: string;
  };
  vehicleType: string;
  weight: string;
  distance: string;
  pricing: {
    basePrice: string;
    distancePrice: string;
    weightSurcharge: string;
    centralLondonCharge: string;
    multiDropCharge: string;
    returnTripCharge: string;
    totalPrice: string;
  };
  isMultiDrop: boolean;
  isReturnTrip: boolean;
  isCentralLondon: boolean;
}

export default function PaymentLink() {
  const { token } = useParams<{ token: string }>();

  const { data: linkData, isLoading, error, isError } = useQuery<PaymentLinkData>({
    queryKey: ['/api/payment-links', token],
    queryFn: async () => {
      const res = await fetch(`/api/payment-links/${token}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to load payment link');
      }
      return res.json();
    },
    retry: false,
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/payment-links/${token}/checkout`);
    },
    onSuccess: async (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });

  const formatVehicleName = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatPrice = (price: string | number | null | undefined) => {
    if (!price) return '£0.00';
    const num = typeof price === 'string' ? parseFloat(price) : price;
    return `£${num.toFixed(2)}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <Skeleton className="h-12 w-48 mx-auto mb-4" />
            <Skeleton className="h-6 w-64 mx-auto" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    const errorMessage = error instanceof Error ? error.message : 'Invalid or expired payment link';
    
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
            <CardTitle className="text-2xl text-red-600">Payment Link Unavailable</CardTitle>
            <CardDescription className="text-base mt-2">
              {errorMessage}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This payment link may have expired, been cancelled, or already been used.
              Please contact us if you need assistance.
            </p>
          </CardContent>
          <CardFooter className="justify-center gap-4 flex-wrap">
            <Button variant="outline" asChild>
              <a href="/">Go to Homepage</a>
            </Button>
            <Button asChild>
              <a href="/contact">Contact Support</a>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!linkData) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <img src="/run-loader.png" alt="Run Courier" className="h-14 object-contain mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Complete Your Payment</h1>
          <p className="text-muted-foreground mt-2">Secure payment for your delivery booking</p>
        </div>

        <Card className="mb-6">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-lg">Booking Details</CardTitle>
              <Badge variant="outline" className="font-mono">
                {linkData.trackingNumber}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-green-600">
                  <MapPin className="h-4 w-4" />
                  Pickup Location
                </h3>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                  <p className="text-sm">{linkData.pickup.address}</p>
                  <p className="text-sm font-mono font-bold text-green-700 dark:text-green-400 mt-1">
                    {linkData.pickup.postcode}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2 text-red-600">
                  <MapPin className="h-4 w-4" />
                  Delivery Location
                </h3>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                  <p className="text-sm">{linkData.delivery.address}</p>
                  <p className="text-sm font-mono font-bold text-red-700 dark:text-red-400 mt-1">
                    {linkData.delivery.postcode}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="space-y-1">
                <Truck className="h-5 w-5 mx-auto text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Vehicle</p>
                <p className="font-medium text-sm">{formatVehicleName(linkData.vehicleType)}</p>
              </div>
              <div className="space-y-1">
                <Scale className="h-5 w-5 mx-auto text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Weight</p>
                <p className="font-medium text-sm">{linkData.weight} kg</p>
              </div>
              <div className="space-y-1">
                <Navigation className="h-5 w-5 mx-auto text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Distance</p>
                <p className="font-medium text-sm">{linkData.distance} miles</p>
              </div>
            </div>

            {(linkData.isMultiDrop || linkData.isReturnTrip || linkData.isCentralLondon) && (
              <div className="flex flex-wrap gap-2 justify-center">
                {linkData.isMultiDrop && (
                  <Badge variant="secondary">Multi-Drop</Badge>
                )}
                {linkData.isReturnTrip && (
                  <Badge variant="secondary">Return Trip</Badge>
                )}
                {linkData.isCentralLondon && (
                  <Badge variant="secondary">Central London</Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-muted-foreground mb-2">Amount Due</p>
              <p className="text-4xl font-bold text-primary">{formatPrice(linkData.amount)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary">
          <CardContent className="pt-6">
            <Button 
              className="w-full h-14 text-lg"
              onClick={() => checkoutMutation.mutate()}
              disabled={checkoutMutation.isPending}
              data-testid="button-pay-now"
            >
              {checkoutMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Redirecting to payment...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-5 w-5" />
                  Pay {formatPrice(linkData.amount)}
                </>
              )}
            </Button>
            
            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              <span>Secure payment powered by Stripe</span>
            </div>

            <div className="flex items-center justify-center gap-2 mt-3 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Link expires: {formatDate(linkData.expiresAt)}</span>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>Need help? <a href="/contact" className="text-primary hover:underline">Contact us</a></p>
          <p className="mt-2">
            Run Courier - Same Day Delivery Across the UK<br />
            <a href="https://www.runcourier.co.uk" className="text-primary hover:underline">www.runcourier.co.uk</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export function PaymentLinkSuccess() {
  const { token } = useParams<{ token: string }>();
  const [isVerifying, setIsVerifying] = useState(true);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        const res = await fetch(`/api/payment-links/${token}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        setVerified(res.ok);
      } catch (err) {
        console.error('Error verifying payment:', err);
      } finally {
        setIsVerifying(false);
      }
    };
    verifyPayment();
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg text-center">
        <CardHeader>
          <div className="mx-auto mb-4">
            <img src="/run-loader.png" alt="Run Courier" className="h-12 object-contain mx-auto" />
          </div>
          {isVerifying ? (
            <>
              <Loader2 className="h-16 w-16 text-primary mx-auto animate-spin" />
              <CardTitle className="text-2xl mt-4">Verifying Payment...</CardTitle>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <div className="p-4 bg-green-100 dark:bg-green-900/30 rounded-full">
                  <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <CardTitle className="text-2xl text-green-600">Payment Successful!</CardTitle>
              <CardDescription className="text-base mt-2">
                Thank you for your payment. Your booking is now confirmed.
              </CardDescription>
            </>
          )}
        </CardHeader>
        {!isVerifying && (
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              You will receive a confirmation email shortly with your tracking details.
              Our team will assign a driver and you'll be notified when your delivery is on the way.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild>
                <a href="/">Go to Homepage</a>
              </Button>
              <Button variant="outline" asChild>
                <a href="/track">Track Delivery</a>
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
// Build: 20260128022725
