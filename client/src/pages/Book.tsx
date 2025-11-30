import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
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
import { PostcodeAutocomplete } from '@/components/PostcodeAutocomplete';
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
  X,
  User,
  Calculator
} from 'lucide-react';
import { bookingQuoteSchema, type BookingQuoteInput, type VehicleType, type User as UserType } from '@shared/schema';
import { calculateQuote, defaultPricingConfig, shouldSwitchVehicle, type QuoteBreakdown } from '@/lib/pricing';
import { geocodePostcode, calculateDistance, calculateETA } from '@/lib/maps';

const vehicleOptions: { type: VehicleType; icon: any; name: string; maxWeight: number }[] = [
  { type: 'motorbike', icon: Bike, name: 'Motorbike', maxWeight: 5 },
  { type: 'car', icon: Car, name: 'Car', maxWeight: 50 },
  { type: 'small_van', icon: Truck, name: 'Small Van', maxWeight: 400 },
  { type: 'medium_van', icon: Package, name: 'Medium Van', maxWeight: 750 },
];

export default function Book() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isCalculating, setIsCalculating] = useState(false);
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [distance, setDistance] = useState<number>(0);
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
  const [multiDropStops, setMultiDropStops] = useState<string[]>([]);
  const [pickupFullAddress, setPickupFullAddress] = useState('');
  const [deliveryFullAddress, setDeliveryFullAddress] = useState('');
  const [quoteFromParams, setQuoteFromParams] = useState(false);

  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupBuildingName, setPickupBuildingName] = useState('');
  const [pickupName, setPickupName] = useState('');
  const [pickupPhone, setPickupPhone] = useState('');
  const [pickupInstructions, setPickupInstructions] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryBuildingName, setDeliveryBuildingName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');
  
  interface StopDetails {
    postcode: string;
    address: string;
    buildingName: string;
    name: string;
    phone: string;
    instructions: string;
  }
  const [multiDropStopDetails, setMultiDropStopDetails] = useState<StopDetails[]>([]);

  const { data: userProfile } = useQuery<UserType>({
    queryKey: ['/api/users', user?.id],
    enabled: !!user?.id,
  });

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

  const pickupPostcode = form.watch('pickupPostcode');
  const deliveryPostcode = form.watch('deliveryPostcode');
  const weight = form.watch('weight');
  const vehicleType = form.watch('vehicleType');
  const isMultiDrop = form.watch('isMultiDrop');
  const isReturnTrip = form.watch('isReturnTrip');
  const returnToSameLocation = form.watch('returnToSameLocation');
  const returnPostcode = form.watch('returnPostcode');

  useEffect(() => {
    if (userProfile) {
      setPickupAddress(userProfile.address || '');
      setPickupName(userProfile.fullName || '');
      setPickupPhone(userProfile.phone || '');
      if (userProfile.postcode && !form.getValues('pickupPostcode')) {
        form.setValue('pickupPostcode', userProfile.postcode);
      }
    } else if (user) {
      setPickupName(user.fullName || '');
      setPickupPhone(user.phone || '');
    }
  }, [userProfile, user, form]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const pickup = params.get('pickup');
    const delivery = params.get('delivery');
    const vehicle = params.get('vehicle') as VehicleType;
    const weightParam = params.get('weight');
    const isMultiDropParam = params.get('multiDrop') === 'true';
    const stopsParam = params.get('stops');
    const isReturnParam = params.get('return') === 'true';
    const returnSameParam = params.get('returnSame') === 'true';
    const returnPostcodeParam = params.get('returnPostcode');
    const priceParam = params.get('price');
    const timeParam = params.get('time');

    if (pickup && delivery && vehicle) {
      form.setValue('pickupPostcode', pickup);
      form.setValue('deliveryPostcode', delivery);
      form.setValue('vehicleType', vehicle);
      if (weightParam) {
        form.setValue('weight', parseFloat(weightParam));
      }
      if (isMultiDropParam) {
        form.setValue('isMultiDrop', true);
        if (stopsParam) {
          setMultiDropStops(stopsParam.split(','));
        }
      }
      if (isReturnParam) {
        form.setValue('isReturnTrip', true);
        form.setValue('returnToSameLocation', returnSameParam);
        if (returnPostcodeParam) {
          form.setValue('returnPostcode', returnPostcodeParam);
        }
      }
      if (timeParam) {
        setEstimatedTime(parseInt(timeParam));
      }
      if (priceParam) {
        setQuoteFromParams(true);
        const selectedVehicle = vehicleOptions.find(v => v.type === vehicle);
        if (selectedVehicle) {
          setQuote({
            vehicleType: vehicle,
            baseCharge: 0,
            distanceCharge: 0,
            multiDropCharge: 0,
            multiDropDistanceCharge: 0,
            weightSurcharge: 0,
            centralLondonCharge: 0,
            returnTripCharge: 0,
            rushHourApplied: false,
            distance: 0,
            totalDistance: 0,
            totalPrice: parseFloat(priceParam),
            weight: weightParam ? parseFloat(weightParam) : 1,
          });
        }
      }
    }
  }, [searchParams, form]);

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
        if (pickupLocation.formattedAddress) {
          setPickupFullAddress(pickupLocation.formattedAddress);
        }
        if (deliveryLocation.formattedAddress) {
          setDeliveryFullAddress(deliveryLocation.formattedAddress);
        }

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
    setMultiDropStopDetails([...multiDropStopDetails, { postcode: '', address: '', buildingName: '', name: '', phone: '', instructions: '' }]);
  };

  const removeMultiDropStop = (index: number) => {
    setMultiDropStops(multiDropStops.filter((_, i) => i !== index));
    setMultiDropStopDetails(multiDropStopDetails.filter((_, i) => i !== index));
  };

  const updateMultiDropStop = (index: number, value: string, fullAddress?: string) => {
    const newStops = [...multiDropStops];
    newStops[index] = value;
    setMultiDropStops(newStops);
    
    const newDetails = [...multiDropStopDetails];
    if (!newDetails[index]) {
      newDetails[index] = { postcode: '', address: '', buildingName: '', name: '', phone: '', instructions: '' };
    }
    newDetails[index].postcode = value;
    if (fullAddress) {
      newDetails[index].address = fullAddress;
    }
    setMultiDropStopDetails(newDetails);
  };

  const updateStopDetail = (index: number, field: keyof StopDetails, value: string) => {
    const newDetails = [...multiDropStopDetails];
    if (!newDetails[index]) {
      newDetails[index] = { postcode: '', address: '', buildingName: '', name: '', phone: '', instructions: '' };
    }
    newDetails[index][field] = value;
    setMultiDropStopDetails(newDetails);
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
                                  <PostcodeAutocomplete
                                    value={field.value}
                                    onChange={(value, fullAddress) => {
                                      field.onChange(value);
                                      if (fullAddress) setPickupFullAddress(fullAddress);
                                    }}
                                    placeholder="e.g., HA4 6LW or start typing address"
                                    data-testid="input-pickup-postcode"
                                  />
                                </FormControl>
                                {pickupFullAddress && (
                                  <FormDescription className="text-xs truncate">
                                    {pickupFullAddress}
                                  </FormDescription>
                                )}
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
                                    onChange={(value, fullAddress) => {
                                      field.onChange(value);
                                      if (fullAddress) setDeliveryFullAddress(fullAddress);
                                    }}
                                    placeholder="e.g., SW1A 1AA or start typing address"
                                    data-testid="input-delivery-postcode"
                                  />
                                </FormControl>
                                {deliveryFullAddress && (
                                  <FormDescription className="text-xs truncate">
                                    {deliveryFullAddress}
                                  </FormDescription>
                                )}
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
                                <div className="flex-1">
                                  <PostcodeAutocomplete
                                    value={stop}
                                    onChange={(value, fullAddress) => updateMultiDropStop(index, value, fullAddress)}
                                    placeholder={`Stop ${index + 1} postcode or address`}
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
                    <div className="space-y-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Vehicle</span>
                        <span className="font-medium">{selectedVehicle?.name}</span>
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
                      
                      <Button 
                        className="w-full" 
                        onClick={handleGetQuote}
                        disabled={isCalculating || !pickupPostcode || !deliveryPostcode}
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

                      {quote && (
                        <>
                          <Separator />
                          <div className="bg-primary/10 rounded-lg p-4 text-center">
                            <p className="text-2xl font-bold text-primary">
                              £{quote.totalPrice.toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Total delivery cost
                            </p>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Est. Time</span>
                            <span className="font-medium">
                              {estimatedTime >= 60 
                                ? `${Math.floor(estimatedTime / 60)}h ${estimatedTime % 60}m`
                                : `${estimatedTime} mins`}
                            </span>
                          </div>
                          <Button 
                            className="w-full" 
                            onClick={handleContinue}
                            data-testid="button-continue"
                          >
                            Continue to Book
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </>
                      )}

                      {!quote && !isCalculating && (
                        <div className="text-center py-4 text-muted-foreground">
                          <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
                          <p className="text-sm">Enter postcodes and click Get Quote</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Delivery Details</CardTitle>
                <CardDescription>
                  {user ? 'Your saved details have been pre-filled. Update if needed.' : 'Enter pickup and delivery information'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Pickup Details</h3>
                      {user && (
                        <Badge variant="secondary" className="text-xs">
                          <User className="h-3 w-3 mr-1" />
                          From Profile
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Full Address</Label>
                      <Input 
                        placeholder="Full address" 
                        value={pickupAddress || pickupFullAddress}
                        onChange={(e) => setPickupAddress(e.target.value)}
                        data-testid="input-pickup-address" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Building Name / Number</Label>
                      <Input 
                        placeholder="Building name or number" 
                        value={pickupBuildingName}
                        onChange={(e) => setPickupBuildingName(e.target.value)}
                        data-testid="input-pickup-building" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Name</Label>
                      <Input 
                        placeholder="Contact name" 
                        value={pickupName}
                        onChange={(e) => setPickupName(e.target.value)}
                        data-testid="input-pickup-name" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input 
                        placeholder="Phone number" 
                        value={pickupPhone}
                        onChange={(e) => setPickupPhone(e.target.value)}
                        data-testid="input-pickup-phone" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Special Instructions</Label>
                      <Input 
                        placeholder="Special instructions (optional)" 
                        value={pickupInstructions}
                        onChange={(e) => setPickupInstructions(e.target.value)}
                        data-testid="input-pickup-instructions" 
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-semibold">Delivery Details (Stop 1)</h3>
                    <div className="space-y-2">
                      <Label>Full Address</Label>
                      <Input 
                        placeholder="Full address" 
                        value={deliveryAddress || deliveryFullAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        data-testid="input-delivery-address" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Building Name / Number</Label>
                      <Input 
                        placeholder="Building name or number" 
                        value={deliveryBuildingName}
                        onChange={(e) => setDeliveryBuildingName(e.target.value)}
                        data-testid="input-delivery-building" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Recipient Name</Label>
                      <Input 
                        placeholder="Recipient name" 
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        data-testid="input-recipient-name" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input 
                        placeholder="Phone number" 
                        value={recipientPhone}
                        onChange={(e) => setRecipientPhone(e.target.value)}
                        data-testid="input-recipient-phone" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Special Instructions</Label>
                      <Input 
                        placeholder="Special instructions (optional)" 
                        value={deliveryInstructions}
                        onChange={(e) => setDeliveryInstructions(e.target.value)}
                        data-testid="input-delivery-instructions" 
                      />
                    </div>
                  </div>
                </div>
                
                {isMultiDrop && multiDropStopDetails.length > 0 && (
                  <div className="space-y-6">
                    <Separator />
                    <h3 className="font-semibold text-lg">Additional Stop Details</h3>
                    {multiDropStopDetails.map((stopDetail, index) => (
                      <Card key={index} className="border-dashed">
                        <CardContent className="pt-4 space-y-4">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">Stop {index + 2}</Badge>
                            <span className="text-sm text-muted-foreground truncate flex-1">
                              {stopDetail.postcode || `Additional stop ${index + 1}`}
                            </span>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Full Address</Label>
                              <Input 
                                placeholder="Full address" 
                                value={stopDetail.address}
                                onChange={(e) => updateStopDetail(index, 'address', e.target.value)}
                                data-testid={`input-stop-${index}-address`} 
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Building Name / Number</Label>
                              <Input 
                                placeholder="Building name or number" 
                                value={stopDetail.buildingName}
                                onChange={(e) => updateStopDetail(index, 'buildingName', e.target.value)}
                                data-testid={`input-stop-${index}-building`} 
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Recipient Name</Label>
                              <Input 
                                placeholder="Recipient name" 
                                value={stopDetail.name}
                                onChange={(e) => updateStopDetail(index, 'name', e.target.value)}
                                data-testid={`input-stop-${index}-name`} 
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Phone Number</Label>
                              <Input 
                                placeholder="Phone number" 
                                value={stopDetail.phone}
                                onChange={(e) => updateStopDetail(index, 'phone', e.target.value)}
                                data-testid={`input-stop-${index}-phone`} 
                              />
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                              <Label>Special Instructions</Label>
                              <Input 
                                placeholder="Special instructions (optional)" 
                                value={stopDetail.instructions}
                                onChange={(e) => updateStopDetail(index, 'instructions', e.target.value)}
                                data-testid={`input-stop-${index}-instructions`} 
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
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
                    {quote && (
                      <div className="flex justify-between font-semibold text-primary pt-2">
                        <span>Total Price</span>
                        <span>£{quote.totalPrice.toFixed(2)}</span>
                      </div>
                    )}
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
