import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { 
  Bike, 
  Car, 
  Truck, 
  Package,
  MapPin,
  ArrowRight,
  Plus,
  Minus,
  Loader2,
  Clock,
  CheckCircle,
  X
} from 'lucide-react';
import { bookingQuoteSchema, type BookingQuoteInput, type VehicleType } from '@shared/schema';
import { calculateQuote, defaultPricingConfig, type QuoteBreakdown } from '@/lib/pricing';
import { geocodePostcode, calculateDistance } from '@/lib/maps';

const vehicleOptions: { type: VehicleType; icon: any; name: string; maxWeight: number }[] = [
  { type: 'motorbike', icon: Bike, name: 'Motorbike', maxWeight: 5 },
  { type: 'car', icon: Car, name: 'Car', maxWeight: 50 },
  { type: 'small_van', icon: Truck, name: 'Small Van', maxWeight: 400 },
  { type: 'medium_van', icon: Package, name: 'Medium Van', maxWeight: 750 },
];

export default function Book() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isCalculating, setIsCalculating] = useState(false);
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [distance, setDistance] = useState<number>(0);
  const [multiDropStops, setMultiDropStops] = useState<string[]>([]);

  const form = useForm<BookingQuoteInput>({
    resolver: zodResolver(bookingQuoteSchema),
    defaultValues: {
      pickupPostcode: '',
      deliveryPostcode: '',
      weight: 1,
      vehicleType: 'car',
      isMultiDrop: false,
      isReturnTrip: false,
      returnToSameLocation: true,
      returnPostcode: '',
    },
  });

  const pickupPostcode = form.watch('pickupPostcode');
  const deliveryPostcode = form.watch('deliveryPostcode');
  const weight = form.watch('weight');
  const vehicleType = form.watch('vehicleType');
  const isMultiDrop = form.watch('isMultiDrop');
  const isReturnTrip = form.watch('isReturnTrip');
  const returnToSameLocation = form.watch('returnToSameLocation');

  const calculateQuoteHandler = useCallback(async () => {
    if (!pickupPostcode || !deliveryPostcode || pickupPostcode.length < 3 || deliveryPostcode.length < 3) {
      return;
    }

    setIsCalculating(true);
    try {
      const [pickupLocation, deliveryLocation] = await Promise.all([
        geocodePostcode(pickupPostcode),
        geocodePostcode(deliveryPostcode),
      ]);

      if (pickupLocation && deliveryLocation) {
        const distanceResult = await calculateDistance(
          { lat: pickupLocation.lat, lng: pickupLocation.lng },
          { lat: deliveryLocation.lat, lng: deliveryLocation.lng }
        );

        if (distanceResult) {
          setDistance(distanceResult.distance);
          const calculatedQuote = calculateQuote(vehicleType, distanceResult.distance, weight, {
            pickupPostcode,
            deliveryPostcode,
            isMultiDrop,
            multiDropCount: multiDropStops.length,
            isReturnTrip,
            returnToSameLocation,
          });
          setQuote(calculatedQuote);
        }
      }
    } catch (error) {
      console.error('Error calculating quote:', error);
    } finally {
      setIsCalculating(false);
    }
  }, [pickupPostcode, deliveryPostcode, weight, vehicleType, isMultiDrop, isReturnTrip, returnToSameLocation, multiDropStops.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      calculateQuoteHandler();
    }, 500);
    return () => clearTimeout(timer);
  }, [calculateQuoteHandler]);

  const addMultiDropStop = () => {
    setMultiDropStops([...multiDropStops, '']);
  };

  const removeMultiDropStop = (index: number) => {
    setMultiDropStops(multiDropStops.filter((_, i) => i !== index));
  };

  const updateMultiDropStop = (index: number, value: string) => {
    const newStops = [...multiDropStops];
    newStops[index] = value;
    setMultiDropStops(newStops);
  };

  const handleContinue = () => {
    if (!quote) {
      toast({
        title: 'Details Required',
        description: 'Please enter valid postcodes to continue.',
        variant: 'destructive',
      });
      return;
    }

    if (!user) {
      toast({
        title: 'Login Required',
        description: 'Please login or create an account to continue booking.',
      });
      setLocation('/login');
      return;
    }

    setStep(2);
  };

  const selectedVehicle = vehicleOptions.find(v => v.type === vehicleType);

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Book a Delivery</h1>
            <p className="text-muted-foreground">Book your delivery in minutes</p>
          </div>

          <div className="flex items-center justify-center gap-4 mb-8">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                1
              </div>
              <span className="hidden sm:inline font-medium">Details</span>
            </div>
            <div className="w-8 h-0.5 bg-border" />
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                2
              </div>
              <span className="hidden sm:inline font-medium">Address</span>
            </div>
            <div className="w-8 h-0.5 bg-border" />
            <div className={`flex items-center gap-2 ${step >= 3 ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                3
              </div>
              <span className="hidden sm:inline font-medium">Confirm</span>
            </div>
          </div>

          {step === 1 && (
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Delivery Details</CardTitle>
                    <CardDescription>Enter pickup and delivery information</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...form}>
                      <form className="space-y-6">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="pickupPostcode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Pickup Postcode</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                      placeholder="e.g., EC1A 1BB" 
                                      className="pl-10" 
                                      {...field} 
                                      data-testid="input-pickup-postcode"
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="deliveryPostcode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Delivery Postcode</FormLabel>
                                <FormControl>
                                  <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                      placeholder="e.g., SW1A 1AA" 
                                      className="pl-10" 
                                      {...field}
                                      data-testid="input-delivery-postcode"
                                    />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="vehicleType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Vehicle Type</FormLabel>
                              <FormControl>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {vehicleOptions.map((vehicle) => {
                                    const isSelected = field.value === vehicle.type;
                                    const isDisabled = weight > vehicle.maxWeight;
                                    return (
                                      <button
                                        key={vehicle.type}
                                        type="button"
                                        disabled={isDisabled}
                                        onClick={() => field.onChange(vehicle.type)}
                                        className={`p-4 rounded-lg border-2 transition-all ${
                                          isSelected 
                                            ? 'border-primary bg-primary/5' 
                                            : 'border-border hover:border-primary/50'
                                        } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                        data-testid={`vehicle-${vehicle.type}`}
                                      >
                                        <vehicle.icon className={`h-8 w-8 mx-auto mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <div className="text-sm font-medium">{vehicle.name}</div>
                                        <div className="text-xs text-muted-foreground">Up to {vehicle.maxWeight}kg</div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="weight"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Weight (kg): {field.value}</FormLabel>
                              <FormControl>
                                <Slider
                                  min={0.1}
                                  max={selectedVehicle?.maxWeight || 50}
                                  step={0.5}
                                  value={[field.value]}
                                  onValueChange={(value) => field.onChange(value[0])}
                                  data-testid="slider-weight"
                                />
                              </FormControl>
                              <FormDescription>
                                Max weight for {selectedVehicle?.name}: {selectedVehicle?.maxWeight}kg
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid sm:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="isMultiDrop"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-multidrop"
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Multi-Drop</FormLabel>
                                  <FormDescription>
                                    Add multiple delivery stops
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="isReturnTrip"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-return"
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel>Return Trip</FormLabel>
                                  <FormDescription>
                                    Driver returns to pickup location
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>

                        {isMultiDrop && (
                          <div className="space-y-3">
                            <Label>Additional Stops</Label>
                            {multiDropStops.map((stop, index) => (
                              <div key={index} className="flex gap-2">
                                <Input
                                  placeholder={`Stop ${index + 1} postcode`}
                                  value={stop}
                                  onChange={(e) => updateMultiDropStop(index, e.target.value)}
                                  data-testid={`input-stop-${index}`}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => removeMultiDropStop(index)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addMultiDropStop}
                              data-testid="button-add-stop"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Add Stop
                            </Button>
                          </div>
                        )}
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </div>

              <div>
                <Card className="sticky top-24">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      Delivery Summary
                      {isCalculating && <Loader2 className="h-4 w-4 animate-spin" />}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {quote ? (
                      <div className="space-y-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Distance</span>
                          <span>{distance} miles</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Vehicle</span>
                          <span>{selectedVehicle?.name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Weight</span>
                          <span>{weight} kg</span>
                        </div>
                        {isMultiDrop && multiDropStops.length > 0 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Additional stops</span>
                            <span>{multiDropStops.length}</span>
                          </div>
                        )}
                        {isReturnTrip && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Return trip</span>
                            <span>
                              <CheckCircle className="h-4 w-4 text-green-500 inline" />
                            </span>
                          </div>
                        )}
                        <Separator />
                        <div className="bg-primary/10 rounded-lg p-4 text-center">
                          <CheckCircle className="h-8 w-8 text-primary mx-auto mb-2" />
                          <p className="font-semibold text-primary">Ready to Book</p>
                          <p className="text-sm text-muted-foreground">Your delivery details are complete</p>
                        </div>
                        <Button 
                          className="w-full" 
                          onClick={handleContinue}
                          data-testid="button-continue"
                        >
                          Continue
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Enter postcodes to continue</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Delivery Details</CardTitle>
                <CardDescription>Enter pickup and delivery information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold">Pickup Details</h3>
                    <Input placeholder="Full address" data-testid="input-pickup-address" />
                    <Input placeholder="Contact name" data-testid="input-pickup-name" />
                    <Input placeholder="Phone number" data-testid="input-pickup-phone" />
                    <Input placeholder="Special instructions (optional)" data-testid="input-pickup-instructions" />
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-semibold">Delivery Details</h3>
                    <Input placeholder="Full address" data-testid="input-delivery-address" />
                    <Input placeholder="Recipient name" data-testid="input-recipient-name" />
                    <Input placeholder="Phone number" data-testid="input-recipient-phone" />
                    <Input placeholder="Special instructions (optional)" data-testid="input-delivery-instructions" />
                  </div>
                </div>
                <div className="flex gap-4">
                  <Button variant="outline" onClick={() => setStep(1)} data-testid="button-back-step1">Back</Button>
                  <Button onClick={() => setStep(3)} data-testid="button-to-payment">
                    Continue to Payment
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Confirm Booking</CardTitle>
                <CardDescription>Review and confirm your delivery</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted/50 rounded-lg p-6">
                  <h3 className="font-semibold mb-4">Order Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">From</span>
                      <span>{pickupPostcode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">To</span>
                      <span>{deliveryPostcode}</span>
                    </div>
                    <Separator className="my-4" />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vehicle</span>
                      <span>{selectedVehicle?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Weight</span>
                      <span>{weight}kg</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Distance</span>
                      <span>{distance} miles</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-primary/10 rounded-lg p-6 text-center">
                  <CheckCircle className="h-10 w-10 text-primary mx-auto mb-3" />
                  <p className="font-semibold text-lg">Ready to Confirm</p>
                  <p className="text-sm text-muted-foreground">We'll contact you with final pricing details</p>
                </div>

                <div className="flex gap-4">
                  <Button variant="outline" onClick={() => setStep(2)} data-testid="button-back-step2">Back</Button>
                  <Button 
                    className="flex-1" 
                    onClick={() => {
                      toast({
                        title: 'Booking Confirmed!',
                        description: 'Your delivery has been booked. We will contact you shortly with pricing details.',
                      });
                      setLocation('/customer');
                    }}
                    data-testid="button-confirm"
                  >
                    Confirm Booking
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
