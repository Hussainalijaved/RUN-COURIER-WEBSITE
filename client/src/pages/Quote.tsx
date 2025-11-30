import { useState, useCallback } from 'react';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
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
  Calculator
} from 'lucide-react';
import { bookingQuoteSchema, type BookingQuoteInput, type VehicleType } from '@shared/schema';
import { calculateQuote, defaultPricingConfig, shouldSwitchVehicle, type QuoteBreakdown } from '@/lib/pricing';
import { geocodePostcode, calculateDistance } from '@/lib/maps';

const vehicleOptions: { type: VehicleType; icon: any; name: string; maxWeight: number }[] = [
  { type: 'motorbike', icon: Bike, name: 'Motorbike', maxWeight: 5 },
  { type: 'car', icon: Car, name: 'Car', maxWeight: 50 },
  { type: 'small_van', icon: Truck, name: 'Small Van', maxWeight: 400 },
  { type: 'medium_van', icon: Package, name: 'Medium Van', maxWeight: 750 },
];

export default function Quote() {
  const { toast } = useToast();
  const [isCalculating, setIsCalculating] = useState(false);
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [distance, setDistance] = useState<number>(0);
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
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
          const multiDropDistances: number[] = [];
          
          if (isMultiDrop && multiDropStops.length > 0) {
            const validStops = multiDropStops.filter(stop => stop.length >= 3);
            
            if (validStops.length > 0) {
              let previousLocation = { lat: deliveryLocation.lat, lng: deliveryLocation.lng };
              
              for (const stop of validStops) {
                const stopLocation = await geocodePostcode(stop);
                if (stopLocation) {
                  const legDistance = await calculateDistance(previousLocation, { lat: stopLocation.lat, lng: stopLocation.lng });
                  if (legDistance) {
                    multiDropDistances.push(legDistance.distance);
                    totalEstimatedTime += legDistance.duration;
                  }
                  previousLocation = { lat: stopLocation.lat, lng: stopLocation.lng };
                }
              }
            }
          }
          
          const totalDistance = distanceResult.distance + multiDropDistances.reduce((sum, d) => sum + d, 0);
          setDistance(totalDistance);
          setEstimatedTime(totalEstimatedTime);
          
          let returnDistance = 0;
          if (isReturnTrip && !returnToSameLocation && returnPostcode && returnPostcode.length >= 3) {
            const lastStopLocation = isMultiDrop && multiDropStops.length > 0 
              ? await geocodePostcode(multiDropStops[multiDropStops.length - 1]) 
              : deliveryLocation;
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
          
          const calculatedQuote = calculateQuote(finalVehicleType, distanceResult.distance, weight, {
            pickupPostcode,
            deliveryPostcode,
            isMultiDrop,
            multiDropCount: multiDropStops.filter(s => s.length >= 3).length,
            multiDropDistances,
            isReturnTrip,
            returnToSameLocation,
            returnDistance,
          });
          setQuote(calculatedQuote);
          toast({
            title: 'Quote Ready',
            description: `Your delivery quote is £${calculatedQuote.totalPrice.toFixed(2)}`,
          });
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
  }, [pickupPostcode, deliveryPostcode, weight, vehicleType, isMultiDrop, isReturnTrip, returnToSameLocation, returnPostcode, multiDropStops, toast]);

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
                              <FormLabel>Package Weight: {field.value}kg</FormLabel>
                              <FormControl>
                                <Slider
                                  value={[field.value]}
                                  onValueChange={(value) => field.onChange(value[0])}
                                  min={0.5}
                                  max={vehicleOptions.find(v => v.type === vehicleType)?.maxWeight || 50}
                                  step={0.5}
                                  className="py-4"
                                  data-testid="slider-weight"
                                />
                              </FormControl>
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
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-multi-drop"
                                  />
                                </FormControl>
                                <div>
                                  <FormLabel className="cursor-pointer">Multi-drop Delivery</FormLabel>
                                  <FormDescription>Add multiple delivery stops (+£3 per stop)</FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />

                          {isMultiDrop && (
                            <div className="space-y-3 pl-7">
                              <Label>Additional Stops</Label>
                              {multiDropStops.map((stop, index) => (
                                <div key={index} className="flex gap-2">
                                  <div className="flex-1">
                                    <PostcodeAutocomplete
                                      value={stop}
                                      onChange={(value) => updateMultiDropStop(index, value)}
                                      placeholder={`Stop ${index + 1} postcode`}
                                      data-testid={`input-stop-${index}`}
                                    />
                                  </div>
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
                                className="gap-1"
                              >
                                <Plus className="h-3 w-3" />
                                Add Stop
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
                                    <FormLabel className="cursor-pointer">Return to pickup location (+60%)</FormLabel>
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

                        <Link href="/book">
                          <Button className="w-full gap-2" size="lg" data-testid="button-book-now">
                            Book Now
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </Link>
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
    </PublicLayout>
  );
}
