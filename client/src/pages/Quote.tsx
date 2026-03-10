import { useState, useCallback, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useBooking } from '@/context/BookingContext';
import { PostcodeAutocomplete } from '@/components/PostcodeAutocomplete';
import { 
  Bike, 
  Car, 
  Truck, 
  Package,
  MapPin,
  ArrowRight,
  Plus,
  Loader2,
  Clock,
  X,
  Calculator,
  User,
  LogIn,
  Calendar
} from 'lucide-react';
import { bookingQuoteSchema, type BookingQuoteInput, type VehicleType } from '@shared/schema';
import { calculateQuote, defaultPricingConfig, shouldSwitchVehicle, type QuoteBreakdown } from '@/lib/pricing';
import { geocodePostcode, calculateDistance, calculateOptimizedRoute } from '@/lib/maps';

// Helper functions for default date/time
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function getCurrentTime(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = (Math.ceil(now.getMinutes() / 15) * 15 % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

const vehicleOptions: { type: VehicleType; icon: any; name: string; maxWeight: number }[] = [
  { type: 'motorbike', icon: Bike, name: 'Motorbike', maxWeight: 5 },
  { type: 'car', icon: Car, name: 'Car', maxWeight: 50 },
  { type: 'small_van', icon: Truck, name: 'Small Van', maxWeight: 400 },
  { type: 'medium_van', icon: Package, name: 'Medium Van', maxWeight: 750 },
];

export default function Quote() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { booking, updateBooking } = useBooking();
  const { toast } = useToast();
  const [isCalculating, setIsCalculating] = useState(false);
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [distance, setDistance] = useState<number>(0);
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
  const [multiDropStops, setMultiDropStops] = useState<string[]>([]);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [pickupDate, setPickupDate] = useState(getTodayDate());
  const [pickupTime, setPickupTime] = useState(getCurrentTime());

  const form = useForm<BookingQuoteInput>({
    resolver: zodResolver(bookingQuoteSchema),
    defaultValues: {
      pickupPostcode: '',
      deliveryPostcode: '',
      weight: 1,
      vehicleType: '' as VehicleType,
      isMultiDrop: false,
      isReturnTrip: false,
      returnToSameLocation: true,
      returnPostcode: '',
    },
  });

  useEffect(() => {
    updateBooking({
      pickupPostcode: '',
      deliveryPostcode: '',
      vehicleType: undefined,
      weight: 1,
      isMultiDrop: false,
      isReturnTrip: false,
      returnToSameLocation: true,
      returnPostcode: '',
      multiDropStops: [],
      distance: 0,
      estimatedTime: 0,
      totalPrice: 0,
      basePrice: 0,
      distancePrice: 0,
      weightSurcharge: 0,
      rushHourCharge: 0,
      centralLondonCharge: 0,
      multiDropCharge: 0,
      returnTripCharge: 0,
      waitingTimeCharge: 0,
    });
  }, []);

  const pickupPostcode = form.watch('pickupPostcode');
  const deliveryPostcode = form.watch('deliveryPostcode');
  const weight = form.watch('weight');
  const vehicleType = form.watch('vehicleType');
  const isMultiDrop = form.watch('isMultiDrop');
  const isReturnTrip = form.watch('isReturnTrip');
  const returnToSameLocation = form.watch('returnToSameLocation');
  const returnPostcode = form.watch('returnPostcode');

  const handleGetQuote = useCallback(async () => {
    if (!pickupPostcode || !deliveryPostcode || pickupPostcode.length < 3 || deliveryPostcode.length < 3) {
      toast({
        title: 'Enter Postcodes',
        description: 'Please enter both pickup and delivery postcodes.',
        variant: 'destructive',
      });
      return;
    }

    if (!vehicleType) {
      toast({
        title: 'Select Vehicle',
        description: 'Please select a vehicle type for your delivery.',
        variant: 'destructive',
      });
      return;
    }

    setIsCalculating(true);
    setQuote(null);
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
          let totalEstimatedTime = distanceResult.duration;
          let multiDropDistances: number[] = [];
          let totalDistance = distanceResult.distance;
          let allDropPostcodes = [deliveryPostcode];
          let baseDistance = distanceResult.distance;
          let firstDropPostcode = deliveryPostcode;
          
          // Use optimized route API for multi-drop (same logic as AdminBusinessQuote)
          if (isMultiDrop && multiDropStops.length > 0) {
            const validStops = multiDropStops.filter(stop => stop.length >= 3);
            
            if (validStops.length > 0) {
              // All drops: first delivery + additional stops (same as AdminBusinessQuote)
              const allDrops = [deliveryPostcode, ...validStops];
              const optimizedRoute = await calculateOptimizedRoute(pickupPostcode, allDrops);
              
              if (optimizedRoute && optimizedRoute.legs.length > 0) {
                // Validate optimizedOrder matches drop count (same validation as AdminBusinessQuote)
                if (!optimizedRoute.optimizedOrder || optimizedRoute.optimizedOrder.length !== allDrops.length) {
                  toast({
                    title: 'Route Optimization Failed',
                    description: 'Could not optimize route. Please check your postcodes and try again.',
                    variant: 'destructive',
                  });
                  setIsCalculating(false);
                  return;
                }
                
                // Use optimized route distances for consistent pricing
                totalDistance = optimizedRoute.totalDistance;
                totalEstimatedTime = optimizedRoute.totalDuration;
                
                // First leg is pickup to first optimized drop (base distance)
                baseDistance = optimizedRoute.legs[0]?.distance || 0;
                
                // Remaining legs are multi-drop distances
                multiDropDistances = optimizedRoute.legs.slice(1).map(leg => leg.distance);
                
                // Reorder drops based on optimized route
                allDropPostcodes = optimizedRoute.optimizedOrder.map((idx: number) => allDrops[idx]);
                firstDropPostcode = allDropPostcodes[0];
              } else {
                // Route optimization failed - fail fast like AdminBusinessQuote
                toast({
                  title: 'Could Not Calculate Route',
                  description: 'Unable to calculate optimized multi-drop route. Please check your postcodes and try again.',
                  variant: 'destructive',
                });
                setIsCalculating(false);
                return;
              }
            }
          }
          
          setDistance(totalDistance);
          setEstimatedTime(totalEstimatedTime);
          
          let returnDistance = 0;
          if (isReturnTrip && !returnToSameLocation && returnPostcode && returnPostcode.length >= 3) {
            const lastDropPostcode = allDropPostcodes[allDropPostcodes.length - 1];
            const lastStopLocation = await geocodePostcode(lastDropPostcode);
            const returnLocation = await geocodePostcode(returnPostcode);
            
            if (lastStopLocation && returnLocation) {
              const returnResult = await calculateDistance(
                { lat: lastStopLocation.lat, lng: lastStopLocation.lng },
                { lat: returnLocation.lat, lng: returnLocation.lng }
              );
              if (returnResult) {
                returnDistance = returnResult.distance;
              }
            }
          }
          
          let finalVehicleType = vehicleType;
          const switchTo = shouldSwitchVehicle(vehicleType, totalDistance + returnDistance);
          
          if (switchTo) {
            finalVehicleType = switchTo;
            form.setValue('vehicleType', switchTo);
            toast({
              title: 'Vehicle Changed',
              description: `Distance exceeds ${defaultPricingConfig.vehicles[vehicleType].maxDistance} miles for ${vehicleType}. Switched to ${switchTo}.`,
            });
          }
          
          // Create scheduled time from date and time for rush hour calculation
          const scheduledTime = pickupDate && pickupTime 
            ? new Date(`${pickupDate}T${pickupTime}`) 
            : new Date();
          
          // Calculate quote: base distance is first leg, multiDropDistances for additional legs
          // multiDropCount is number of additional drops beyond the first (same as AdminBusinessQuote)
          const calculatedQuote = calculateQuote(finalVehicleType, baseDistance, weight, {
            pickupPostcode,
            deliveryPostcode: firstDropPostcode,
            isMultiDrop,
            multiDropCount: allDropPostcodes.length - 1,
            multiDropDistances,
            allDropPostcodes,
            isReturnTrip,
            returnToSameLocation,
            returnDistance,
            scheduledTime,
          });
          setQuote(calculatedQuote);
          toast({
            title: 'Quote Ready',
            description: `Your delivery quote is £${calculatedQuote.totalPrice.toFixed(2)}`,
          });
          fetch('/api/quote-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pickupPostcode,
              deliveryPostcode,
              vehicleType: finalVehicleType,
              weight,
              distance: totalDistance,
              totalPrice: calculatedQuote.totalPrice,
              isMultiDrop,
              multiDropStops: isMultiDrop ? multiDropStops.filter(Boolean) : undefined,
              isReturnTrip,
              pickupDate,
              pickupTime,
            }),
          }).catch(() => {});
        } else {
          toast({
            title: 'Unable to Calculate',
            description: 'Could not calculate route between these locations.',
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Invalid Postcodes',
          description: 'Could not find one or both postcodes. Please check and try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error calculating quote:', error);
      toast({
        title: 'Error',
        description: 'Failed to calculate quote. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCalculating(false);
    }
  }, [pickupPostcode, deliveryPostcode, weight, vehicleType, isMultiDrop, isReturnTrip, returnToSameLocation, returnPostcode, multiDropStops, pickupDate, pickupTime, toast]);

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

  const buildBookingParams = () => {
    const params = new URLSearchParams();
    params.set('pickup', pickupPostcode);
    params.set('delivery', deliveryPostcode);
    params.set('vehicle', vehicleType);
    params.set('weight', weight.toString());
    if (pickupDate) {
      params.set('pickupDate', pickupDate);
    }
    if (pickupTime) {
      params.set('pickupTime', pickupTime);
    }
    if (isMultiDrop) {
      params.set('multiDrop', 'true');
      if (multiDropStops.length > 0) {
        params.set('stops', multiDropStops.filter(s => s.length >= 3).join(','));
      }
    }
    if (isReturnTrip) {
      params.set('return', 'true');
      params.set('returnSame', returnToSameLocation ? 'true' : 'false');
      if (!returnToSameLocation && returnPostcode) {
        params.set('returnPostcode', returnPostcode);
      }
    }
    if (quote) {
      params.set('price', quote.totalPrice.toFixed(2));
    }
    params.set('time', estimatedTime.toString());
    return params.toString();
  };

  const saveBookingToContext = () => {
    updateBooking({
      pickupPostcode,
      deliveryPostcode,
      vehicleType: vehicleType as any,
      weight,
      isMultiDrop,
      isReturnTrip,
      returnToSameLocation,
      returnPostcode,
      multiDropStops,
      distance,
      estimatedTime,
      totalPrice: quote?.totalPrice || 0,
      basePrice: quote?.baseCharge || 0,
      distancePrice: quote?.distanceCharge || 0,
      weightSurcharge: quote?.weightSurcharge || 0,
      rushHourCharge: quote?.rushHourApplied ? (quote.totalPrice * 0.15) : 0,
      centralLondonCharge: quote?.congestionZoneCharge || 0,
      multiDropCharge: quote?.multiDropCharge || 0,
      returnTripCharge: quote?.returnTripCharge || 0,
      waitingTimeCharge: 0,
    });
  };

  const handleBookNow = () => {
    saveBookingToContext();
    if (user) {
      setLocation(`/book?${buildBookingParams()}`);
    } else {
      setShowLoginDialog(true);
    }
  };

  const handleContinueAsGuest = () => {
    setShowLoginDialog(false);
    saveBookingToContext();
    setLocation(`/book?${buildBookingParams()}`);
  };

  const handleLoginToBook = () => {
    setShowLoginDialog(false);
    saveBookingToContext();
    const bookingParams = buildBookingParams();
    setLocation(`/login?redirect=/book?${encodeURIComponent(bookingParams)}`);
  };

  return (
    <PublicLayout>
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 py-12">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2" data-testid="text-page-title">
              Get a Quick Quote
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Enter your delivery details to get an instant price estimate
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="grid lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calculator className="h-5 w-5 text-primary" />
                      Delivery Details
                    </CardTitle>
                    <CardDescription>
                      Enter pickup and delivery information for your quote
                    </CardDescription>
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
                                  <PostcodeAutocomplete
                                    value={field.value}
                                    onChange={(value) => field.onChange(value)}
                                    placeholder="e.g., SW1A 1AA"
                                    data-testid="input-pickup-postcode"
                                  />
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
                                  <PostcodeAutocomplete
                                    value={field.value}
                                    onChange={(value) => field.onChange(value)}
                                    placeholder="e.g., EC1A 1BB"
                                    data-testid="input-delivery-postcode"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Calendar className="h-4 w-4 text-primary" />
                            <Label className="text-base font-medium">Pickup Date & Time</Label>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="pickupDate">Date</Label>
                              <Input
                                id="pickupDate"
                                type="date"
                                value={pickupDate}
                                min={getTodayDate()}
                                onChange={(e) => setPickupDate(e.target.value)}
                                data-testid="input-pickup-date"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="pickupTime">Time</Label>
                              <Input
                                id="pickupTime"
                                type="time"
                                step="900"
                                value={pickupTime}
                                onChange={(e) => setPickupTime(e.target.value)}
                                data-testid="input-pickup-time"
                              />
                            </div>
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-4">
                          <Label>Vehicle Type</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {vehicleOptions.map((vehicle) => {
                              const Icon = vehicle.icon;
                              const isSelected = vehicleType === vehicle.type;
                              return (
                                <button
                                  key={vehicle.type}
                                  type="button"
                                  onClick={() => form.setValue('vehicleType', vehicle.type)}
                                  className={`p-4 rounded-lg border-2 transition-all text-center ${
                                    isSelected
                                      ? 'border-primary bg-primary/10'
                                      : 'border-border hover:border-primary/50'
                                  }`}
                                  data-testid={`button-vehicle-${vehicle.type}`}
                                >
                                  <Icon className={`h-6 w-6 mx-auto mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                                  <div className={`text-sm font-medium ${isSelected ? 'text-primary' : ''}`}>
                                    {vehicle.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    Up to {vehicle.maxWeight}kg
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <FormField
                          control={form.control}
                          name="weight"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Package Weight (kg)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0.1}
                                  max={vehicleOptions.find(v => v.type === vehicleType)?.maxWeight || 50}
                                  step={0.1}
                                  placeholder="Enter weight in kg"
                                  value={field.value}
                                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                  data-testid="input-weight"
                                />
                              </FormControl>
                              <FormDescription>
                                Max weight for {vehicleOptions.find(v => v.type === vehicleType)?.name || 'selected vehicle'}: {vehicleOptions.find(v => v.type === vehicleType)?.maxWeight || 50}kg
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Separator />

                        <div className="space-y-4">
                          <FormField
                            control={form.control}
                            name="isMultiDrop"
                            render={({ field }) => (
                              <FormItem className="flex items-center gap-3">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={(checked) => {
                                      field.onChange(checked);
                                      if (checked && multiDropStops.length === 0) {
                                        setMultiDropStops(['']);
                                      }
                                    }}
                                    data-testid="checkbox-multi-drop"
                                  />
                                </FormControl>
                                <div>
                                  <FormLabel className="cursor-pointer">Multi-drop Delivery</FormLabel>
                                  <FormDescription>Add multiple delivery stops</FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />

                          {isMultiDrop && (
                            <div className="space-y-3 pl-7 p-4 bg-muted/30 rounded-lg border">
                              <div className="flex items-center justify-between">
                                <Label className="text-base font-medium">Delivery Stops</Label>
                                <Badge variant="secondary" className="text-xs">
                                  {multiDropStops.filter(s => s.length >= 3).length} stop{multiDropStops.filter(s => s.length >= 3).length !== 1 ? 's' : ''} added
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Enter the postcode for each additional delivery stop
                              </p>
                              {multiDropStops.map((stop, index) => (
                                <div key={index} className="flex gap-2">
                                  <div className="flex-1">
                                    <PostcodeAutocomplete
                                      value={stop}
                                      onChange={(value) => updateMultiDropStop(index, value)}
                                      placeholder={`Stop ${index + 1} postcode (e.g., SW1A 1AA)`}
                                      data-testid={`input-stop-${index}`}
                                    />
                                  </div>
                                  {multiDropStops.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="icon"
                                      onClick={() => removeMultiDropStop(index)}
                                      data-testid={`button-remove-stop-${index}`}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addMultiDropStop}
                                className="gap-1"
                                data-testid="button-add-stop"
                              >
                                <Plus className="h-3 w-3" />
                                Add Another Stop
                              </Button>
                            </div>
                          )}

                          <FormField
                            control={form.control}
                            name="isReturnTrip"
                            render={({ field }) => (
                              <FormItem className="flex items-center gap-3">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-return-trip"
                                  />
                                </FormControl>
                                <div>
                                  <FormLabel className="cursor-pointer">Return Trip</FormLabel>
                                  <FormDescription>Driver returns after delivery</FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />

                          {isReturnTrip && (
                            <div className="space-y-3 pl-7">
                              <FormField
                                control={form.control}
                                name="returnToSameLocation"
                                render={({ field }) => (
                                  <FormItem className="flex items-center gap-3">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        data-testid="checkbox-return-same"
                                      />
                                    </FormControl>
                                    <FormLabel className="cursor-pointer">Return to pickup location</FormLabel>
                                  </FormItem>
                                )}
                              />
                              {!returnToSameLocation && (
                                <FormField
                                  control={form.control}
                                  name="returnPostcode"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Return Destination</FormLabel>
                                      <FormControl>
                                        <PostcodeAutocomplete
                                          value={field.value || ''}
                                          onChange={(value) => field.onChange(value)}
                                          placeholder="Return postcode"
                                          data-testid="input-return-postcode"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              )}
                            </div>
                          )}
                        </div>

                        <Button
                          type="button"
                          className="w-full"
                          size="lg"
                          onClick={handleGetQuote}
                          disabled={isCalculating}
                          data-testid="button-get-quote"
                        >
                          {isCalculating ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Calculating...
                            </>
                          ) : (
                            <>
                              <Calculator className="mr-2 h-4 w-4" />
                              Get Quote
                            </>
                          )}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-2">
                <Card className="sticky top-24">
                  <CardHeader>
                    <CardTitle>Your Quote</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {quote ? (
                      <div className="space-y-6">
                        <div className="bg-primary/10 rounded-lg p-6 text-center">
                          <div className="text-4xl font-bold text-primary" data-testid="text-total-price">
                            £{quote.totalPrice.toFixed(2)}
                          </div>
                          <p className="text-muted-foreground text-sm mt-2">Total delivery cost</p>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Vehicle</span>
                            <Badge variant="secondary">{vehicleOptions.find(v => v.type === quote.vehicleType)?.name}</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Est. Time</span>
                            <span className="font-medium flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {estimatedTime >= 60 
                                ? `${Math.floor(estimatedTime / 60)}h ${estimatedTime % 60}m`
                                : `${estimatedTime} mins`}
                            </span>
                          </div>
                        </div>

                        <Button className="w-full gap-2" size="lg" onClick={handleBookNow} data-testid="button-book-now">
                          Book Now
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full gap-2"
                          onClick={() => {
                            form.reset({
                              pickupPostcode: '',
                              deliveryPostcode: '',
                              weight: 1,
                              vehicleType: '' as VehicleType,
                              isMultiDrop: false,
                              isReturnTrip: false,
                              returnToSameLocation: true,
                              returnPostcode: '',
                            });
                            setQuote(null);
                            setDistance(0);
                            setEstimatedTime(0);
                            setMultiDropStops([]);
                            updateBooking({
                              pickupPostcode: '',
                              deliveryPostcode: '',
                              vehicleType: undefined,
                              weight: 1,
                              isMultiDrop: false,
                              isReturnTrip: false,
                              returnToSameLocation: true,
                              returnPostcode: '',
                              multiDropStops: [],
                              distance: 0,
                              estimatedTime: 0,
                              totalPrice: 0,
                              basePrice: 0,
                              distancePrice: 0,
                              weightSurcharge: 0,
                              rushHourCharge: 0,
                              centralLondonCharge: 0,
                              multiDropCharge: 0,
                              returnTripCharge: 0,
                              waitingTimeCharge: 0,
                            });
                          }}
                          data-testid="button-new-quote"
                        >
                          <Calculator className="h-4 w-4" />
                          Get New Quote
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <MapPin className="h-12 w-12 mx-auto mb-4 opacity-20" />
                        <p className="text-sm">Enter postcodes and click Get Quote</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Complete Your Booking</DialogTitle>
            <DialogDescription className="text-center">
              How would you like to proceed with your booking?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-primary">£{quote?.totalPrice.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">Your quoted price</p>
            </div>
            <Button 
              className="w-full gap-2" 
              size="lg"
              onClick={handleLoginToBook}
              data-testid="button-login-to-book"
            >
              <LogIn className="h-4 w-4" />
              Login to Complete Booking
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>
            <Button 
              variant="outline" 
              className="w-full gap-2" 
              size="lg"
              onClick={handleContinueAsGuest}
              data-testid="button-continue-guest"
            >
              <User className="h-4 w-4" />
              Continue as Guest
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Create an account during checkout to track your deliveries
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
}
