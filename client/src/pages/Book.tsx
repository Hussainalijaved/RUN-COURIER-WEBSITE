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
  CreditCard,
  X,
  User,
  Calculator,
  Lock,
  Calendar
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
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
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
  const [customerEmail, setCustomerEmail] = useState('');
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

  const isEligibleForNewCustomerDiscount = !!(
    user && 
    userProfile && 
    (userProfile.completedBookingsCount ?? 0) < 3
  );
  
  const isPayLaterEnabled = !!(user && userProfile?.payLaterEnabled);
  
  const newCustomerDiscountPercent = 0.20;
  const discountAmount = isEligibleForNewCustomerDiscount && quote 
    ? quote.totalPrice * newCustomerDiscountPercent 
    : 0;
  const finalPrice = quote ? quote.totalPrice - discountAmount : 0;

  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const getCurrentTime = () => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = Math.ceil(now.getMinutes() / 15) * 15;
    if (minutes === 60) {
      return `${(parseInt(hours) + 1).toString().padStart(2, '0')}:00`;
    }
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  };

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
      pickupDate: getTodayDate(),
      pickupTime: getCurrentTime(),
      deliveryDate: '',
      deliveryTime: '',
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

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  useEffect(() => {
    if (userProfile) {
      setPickupAddress(userProfile.address || '');
      setPickupBuildingName(userProfile.buildingName || '');
      setPickupName(userProfile.fullName || '');
      setPickupPhone(userProfile.phone || '');
      setCustomerEmail(userProfile.email || '');
      if (userProfile.postcode && !form.getValues('pickupPostcode')) {
        form.setValue('pickupPostcode', userProfile.postcode);
      }
    } else if (user) {
      setPickupName(user.fullName || '');
      setPickupPhone(user.phone || '');
      setCustomerEmail(user.email || '');
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

                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-primary" />
                              Pickup Date & Time
                            </Label>
                            <div className="grid grid-cols-2 gap-2">
                              <FormField
                                control={form.control}
                                name="pickupDate"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="date"
                                        min={getTodayDate()}
                                        {...field}
                                        data-testid="input-pickup-date"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="pickupTime"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="time"
                                        step="900"
                                        {...field}
                                        data-testid="input-pickup-time"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                          <div className="space-y-3">
                            <Label className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-primary" />
                              Delivery Date & Time (optional)
                            </Label>
                            <div className="grid grid-cols-2 gap-2">
                              <FormField
                                control={form.control}
                                name="deliveryDate"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="date"
                                        min={form.watch('pickupDate') || getTodayDate()}
                                        {...field}
                                        data-testid="input-delivery-date"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="deliveryTime"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input
                                        type="time"
                                        step="900"
                                        {...field}
                                        data-testid="input-delivery-time"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <FormDescription className="text-xs">
                              Leave empty for ASAP delivery
                            </FormDescription>
                          </div>
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
                      {form.watch('pickupDate') && form.watch('pickupTime') && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Pickup</span>
                          <span className="font-medium">
                            {new Date(form.watch('pickupDate') + 'T' + form.watch('pickupTime')).toLocaleString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                      )}
                      {form.watch('deliveryDate') && form.watch('deliveryTime') && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Delivery</span>
                          <span className="font-medium">
                            {new Date(form.watch('deliveryDate') + 'T' + form.watch('deliveryTime')).toLocaleString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
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
                            {isEligibleForNewCustomerDiscount ? (
                              <>
                                <p className="text-sm line-through text-muted-foreground">
                                  £{quote.totalPrice.toFixed(2)}
                                </p>
                                <p className="text-2xl font-bold text-primary" data-testid="text-final-price">
                                  £{finalPrice.toFixed(2)}
                                </p>
                                <p className="text-xs text-green-600 font-medium mt-1" data-testid="text-discount-label">
                                  New customer discount (20% off first 3 bookings)
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-2xl font-bold text-primary" data-testid="text-final-price">
                                  £{quote.totalPrice.toFixed(2)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Total delivery cost
                                </p>
                              </>
                            )}
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
                        placeholder="+44 7XXX XXX XXX" 
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
                        placeholder="+44 7XXX XXX XXX" 
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
                                placeholder="+44 7XXX XXX XXX" 
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
                <CardTitle>Review & Pay</CardTitle>
                <CardDescription>Review your booking and complete payment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold">Pickup Details</h3>
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                      <p><span className="text-muted-foreground">Postcode:</span> {pickupPostcode}</p>
                      <p><span className="text-muted-foreground">Address:</span> {pickupAddress || pickupFullAddress || '-'}</p>
                      {pickupBuildingName && <p><span className="text-muted-foreground">Building:</span> {pickupBuildingName}</p>}
                      <p><span className="text-muted-foreground">Contact:</span> {pickupName}</p>
                      <p><span className="text-muted-foreground">Phone:</span> {pickupPhone}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="font-semibold">Delivery Details</h3>
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                      <p><span className="text-muted-foreground">Postcode:</span> {deliveryPostcode}</p>
                      <p><span className="text-muted-foreground">Address:</span> {deliveryAddress || deliveryFullAddress || '-'}</p>
                      {deliveryBuildingName && <p><span className="text-muted-foreground">Building:</span> {deliveryBuildingName}</p>}
                      <p><span className="text-muted-foreground">Recipient:</span> {recipientName}</p>
                      <p><span className="text-muted-foreground">Phone:</span> {recipientPhone}</p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="bg-muted/50 rounded-lg p-6">
                  <h3 className="font-semibold mb-4">Order Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vehicle</span>
                      <span>{selectedVehicle?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Weight</span>
                      <span>{weight}kg</span>
                    </div>
                    {isMultiDrop && multiDropStops.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Multi-drop Stops</span>
                        <span>{multiDropStops.length + 1} stops</span>
                      </div>
                    )}
                    {isReturnTrip && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Return Trip</span>
                        <span>Yes</span>
                      </div>
                    )}
                    <Separator className="my-4" />
                    {quote && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span>£{quote.totalPrice.toFixed(2)}</span>
                        </div>
                        {isEligibleForNewCustomerDiscount && (
                          <div className="flex justify-between text-green-600" data-testid="order-discount-line">
                            <span>New customer discount (20% off)</span>
                            <span>-£{discountAmount.toFixed(2)}</span>
                          </div>
                        )}
                        <Separator className="my-2" />
                        <div className="flex justify-between font-bold text-lg text-primary" data-testid="order-total">
                          <span>Total to Pay</span>
                          <span>£{finalPrice.toFixed(2)}</span>
                        </div>
                        {isEligibleForNewCustomerDiscount && (
                          <p className="text-xs text-green-600 text-right mt-1" data-testid="discount-remaining-text">
                            {3 - (userProfile?.completedBookingsCount ?? 0)} discount booking{(3 - (userProfile?.completedBookingsCount ?? 0)) !== 1 ? 's' : ''} remaining
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {!user && (
                  <div className="space-y-2">
                    <Label htmlFor="customer-email">Email Address *</Label>
                    <Input
                      id="customer-email"
                      type="email"
                      placeholder="Enter your email for booking confirmation"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      data-testid="input-customer-email"
                    />
                    <p className="text-xs text-muted-foreground">
                      We'll send your booking confirmation and tracking details to this email
                    </p>
                  </div>
                )}
                
                {isPayLaterEnabled ? (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="font-medium text-blue-700 dark:text-blue-400">Pay Later Enabled</p>
                        <p className="text-sm text-blue-600 dark:text-blue-500">
                          Your account is approved for weekly invoicing. No payment required now.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <Lock className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-700 dark:text-green-400">Secure Payment</p>
                        <p className="text-sm text-green-600 dark:text-green-500">
                          Your payment is processed securely via Stripe
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  <Button variant="outline" onClick={() => setStep(2)} data-testid="button-back-step2" disabled={isProcessingPayment}>
                    Back
                  </Button>
                  <Button 
                    className="flex-1" 
                    onClick={async () => {
                      if (!customerEmail && !user) {
                        toast({
                          title: 'Email Required',
                          description: 'Please enter your email address to receive booking confirmation.',
                          variant: 'destructive',
                        });
                        return;
                      }

                      if (!quote) {
                        toast({
                          title: 'Quote Required',
                          description: 'Please get a quote before proceeding to payment.',
                          variant: 'destructive',
                        });
                        return;
                      }

                      setIsProcessingPayment(true);
                      try {
                        const pickupDateVal = form.getValues('pickupDate');
                        const pickupTimeVal = form.getValues('pickupTime');
                        const deliveryDateVal = form.getValues('deliveryDate');
                        const deliveryTimeVal = form.getValues('deliveryTime');
                        
                        const scheduledPickupTime = pickupDateVal && pickupTimeVal 
                          ? new Date(`${pickupDateVal}T${pickupTimeVal}`).toISOString()
                          : null;
                        const scheduledDeliveryTime = deliveryDateVal && deliveryTimeVal
                          ? new Date(`${deliveryDateVal}T${deliveryTimeVal}`).toISOString()
                          : null;
                        
                        const bookingData = {
                          pickupPostcode,
                          pickupAddress: pickupAddress || pickupFullAddress,
                          pickupBuildingName,
                          pickupName,
                          pickupPhone,
                          pickupInstructions,
                          deliveryPostcode,
                          deliveryAddress: deliveryAddress || deliveryFullAddress,
                          deliveryBuildingName,
                          recipientName,
                          recipientPhone,
                          deliveryInstructions,
                          vehicleType,
                          weight,
                          originalPrice: quote.totalPrice,
                          discountAmount: isEligibleForNewCustomerDiscount ? discountAmount : 0,
                          discountApplied: isEligibleForNewCustomerDiscount,
                          basePrice: quote.baseFare,
                          distancePrice: quote.distanceCharge,
                          totalPrice: finalPrice,
                          distance,
                          estimatedTime,
                          isMultiDrop,
                          isReturnTrip,
                          multiDropStops: multiDropStops.join(','),
                          customerId: user?.id || undefined,
                          customerEmail: customerEmail || user?.email,
                          scheduledPickupTime,
                          scheduledDeliveryTime,
                          payLater: isPayLaterEnabled,
                        };

                        if (isPayLaterEnabled) {
                          const response = await fetch('/api/booking/pay-later', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(bookingData),
                          });

                          const result = await response.json();

                          if (!response.ok) {
                            throw new Error(result.error || 'Failed to create booking');
                          }

                          toast({
                            title: 'Booking Confirmed',
                            description: `Your booking has been created. Tracking number: ${result.trackingNumber}`,
                          });
                          
                          setLocation(`/payment/success?tracking=${result.trackingNumber}&payLater=true`);
                        } else {
                          const response = await fetch('/api/booking/checkout', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(bookingData),
                          });

                          const result = await response.json();

                          if (!response.ok) {
                            throw new Error(result.error || 'Failed to create checkout session');
                          }

                          if (result.url) {
                            window.location.href = result.url;
                          } else {
                            throw new Error('No checkout URL received');
                          }
                        }
                      } catch (error: any) {
                        console.error('Booking error:', error);
                        toast({
                          title: 'Booking Error',
                          description: error.message || 'Failed to process booking. Please try again.',
                          variant: 'destructive',
                        });
                        setIsProcessingPayment(false);
                      }
                    }}
                    disabled={isProcessingPayment}
                    data-testid="button-pay-now"
                  >
                    {isProcessingPayment ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : isPayLaterEnabled ? (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Confirm Booking (Pay Later)
                      </>
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Pay £{finalPrice.toFixed(2)} Now
                      </>
                    )}
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
