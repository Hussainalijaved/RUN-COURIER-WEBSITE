import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { bookingQuoteSchema, type BookingQuoteInput, type VehicleType, type User as UserType, type DeliveryContact } from '@shared/schema';
import { calculateQuote, defaultPricingConfig, shouldSwitchVehicle, type QuoteBreakdown, SERVICE_TYPE_CONFIG, applyServiceTypeAdjustment, type ServiceType } from '@/lib/pricing';
import { geocodePostcode, calculateDistance, calculateETA, calculateOptimizedRoute } from '@/lib/maps';
import { EmbeddedPayment } from '@/components/EmbeddedPayment';
import { useBooking } from '@/context/BookingContext';

const vehicleOptions: { type: VehicleType; icon: any; name: string; maxWeight: number }[] = [
  { type: 'motorbike', icon: Bike, name: 'Motorbike', maxWeight: 5 },
  { type: 'car', icon: Car, name: 'Car', maxWeight: 50 },
  { type: 'small_van', icon: Truck, name: 'Small Van', maxWeight: 400 },
  { type: 'medium_van', icon: Package, name: 'Medium Van', maxWeight: 750 },
  { type: 'lwb_van', icon: Truck, name: 'LWB Van', maxWeight: 1000 },
  { type: 'luton_van', icon: Truck, name: 'Luton Van', maxWeight: 1200 },
];

export default function Book() {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const { user } = useAuth();
  const { booking, updateBooking, clearBooking } = useBooking();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [showEmbeddedPayment, setShowEmbeddedPayment] = useState(false);
  const [pendingBookingData, setPendingBookingData] = useState<any>(null);
  const [prefetchedClientSecret, setPrefetchedClientSecret] = useState<string | null>(null);
  const [prefetchedPaymentIntentId, setPrefetchedPaymentIntentId] = useState<string | null>(null);
  const [distance, setDistance] = useState<number>(booking.distance || 0);
  const [estimatedTime, setEstimatedTime] = useState<number>(booking.estimatedTime || 0);
  const [multiDropStops, setMultiDropStops] = useState<string[]>(booking.multiDropStops || []);
  const [pickupFullAddress, setPickupFullAddress] = useState(booking.pickupAddress || '');
  const [deliveryFullAddress, setDeliveryFullAddress] = useState(booking.deliveryAddress || '');
  const [quoteFromParams, setQuoteFromParams] = useState(false);

  const [pickupAddress, setPickupAddress] = useState(booking.pickupAddress || '');
  const [pickupBuildingName, setPickupBuildingName] = useState(booking.pickupBuildingName || '');
  const [pickupName, setPickupName] = useState(booking.pickupName || '');
  const [pickupPhone, setPickupPhone] = useState(booking.pickupPhone || '');
  const [pickupInstructions, setPickupInstructions] = useState(booking.pickupInstructions || '');
  const [customerEmail, setCustomerEmail] = useState(booking.customerEmail || '');
  const [deliveryAddress, setDeliveryAddress] = useState(booking.deliveryAddress || '');
  const [deliveryBuildingName, setDeliveryBuildingName] = useState(booking.deliveryBuildingName || '');
  const [recipientName, setRecipientName] = useState(booking.recipientName || '');
  const [recipientPhone, setRecipientPhone] = useState(booking.recipientPhone || '');
  const [deliveryInstructions, setDeliveryInstructions] = useState(booking.deliveryInstructions || '');
  
  interface StopDetails {
    postcode: string;
    address: string;
    buildingName: string;
    name: string;
    phone: string;
    instructions: string;
  }
  const [multiDropStopDetails, setMultiDropStopDetails] = useState<StopDetails[]>([]);
  
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [saveDeliveryContact, setSaveDeliveryContact] = useState(false);
  const [savedContactLabel, setSavedContactLabel] = useState('');

  const { data: userProfile } = useQuery<UserType>({
    queryKey: ['/api/users', user?.id],
    enabled: !!user?.id,
  });

  const isBusinessUser = userProfile?.userType === 'business';

  const { data: savedContacts = [] } = useQuery<DeliveryContact[]>({
    queryKey: ['/api/delivery-contacts', { customerId: user?.id }],
    enabled: !!user?.id && isBusinessUser,
  });

  const saveContactMutation = useMutation({
    mutationFn: async (contactData: {
      customerId: string;
      label: string;
      recipientName: string;
      recipientPhone: string;
      deliveryAddress: string;
      deliveryPostcode: string;
      buildingName?: string;
      deliveryInstructions?: string;
    }) => {
      const response = await apiRequest('POST', '/api/delivery-contacts', contactData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/delivery-contacts', { customerId: user?.id }] });
      toast({
        title: 'Contact Saved',
        description: 'Delivery contact saved for future bookings.',
      });
    },
  });

  const handleSelectSavedContact = (contactId: string) => {
    setSelectedContactId(contactId);
    if (contactId === 'new') {
      setDeliveryAddress('');
      setDeliveryBuildingName('');
      setRecipientName('');
      setRecipientPhone('');
      setDeliveryInstructions('');
      return;
    }
    const contact = savedContacts.find(c => c.id === contactId);
    if (contact) {
      setDeliveryAddress(contact.deliveryAddress);
      setDeliveryBuildingName(contact.buildingName || '');
      setRecipientName(contact.recipientName);
      setRecipientPhone(contact.recipientPhone);
      setDeliveryInstructions(contact.deliveryInstructions || '');
      form.setValue('deliveryPostcode', contact.deliveryPostcode);
    }
  };

  const handleProceedToPayment = async () => {
    if (saveDeliveryContact && user && savedContactLabel && recipientName && recipientPhone && (deliveryAddress || deliveryFullAddress) && deliveryPostcode) {
      try {
        await saveContactMutation.mutateAsync({
          customerId: user.id,
          label: savedContactLabel,
          recipientName,
          recipientPhone,
          deliveryAddress: deliveryAddress || deliveryFullAddress,
          deliveryPostcode,
          buildingName: deliveryBuildingName || undefined,
          deliveryInstructions: deliveryInstructions || undefined,
        });
      } catch (error) {
        console.error('Failed to save contact:', error);
      }
    }
    setStep(3);
  };

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
  const priceAfterDiscount = quote ? quote.totalPrice - discountAmount : 0;
  // Service type is chosen on Quote page and stored in BookingContext
  const bookingServiceType = (booking.serviceType || 'flexible') as ServiceType;
  const serviceTypeAdj = applyServiceTypeAdjustment(priceAfterDiscount, bookingServiceType);
  const finalPrice = serviceTypeAdj.total;

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
      pickupPostcode: booking.pickupPostcode || '',
      deliveryPostcode: booking.deliveryPostcode || '',
      weight: booking.weight || 1,
      vehicleType: (booking.vehicleType || '') as VehicleType,
      isMultiDrop: booking.isMultiDrop || false,
      isReturnTrip: booking.isReturnTrip || false,
      returnToSameLocation: booking.returnToSameLocation ?? true,
      returnPostcode: booking.returnPostcode || '',
      pickupDate: booking.pickupDate || getTodayDate(),
      pickupTime: booking.pickupTime || getCurrentTime(),
      deliveryDate: booking.deliveryDate || '',
      deliveryTime: booking.deliveryTime || '',
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

  // Auto-save booking data to context (which persists to localStorage)
  useEffect(() => {
    if (pickupPostcode || deliveryPostcode || vehicleType) {
      updateBooking({
        pickupPostcode,
        deliveryPostcode,
        weight,
        vehicleType: vehicleType as any,
        isMultiDrop,
        isReturnTrip,
        returnToSameLocation,
        returnPostcode,
        pickupAddress: pickupFullAddress || pickupAddress,
        deliveryAddress: deliveryFullAddress || deliveryAddress,
        pickupBuildingName,
        pickupName,
        pickupPhone,
        pickupInstructions,
        customerEmail,
        deliveryBuildingName,
        recipientName,
        recipientPhone,
        deliveryInstructions,
        multiDropStops,
        distance,
        estimatedTime,
        totalPrice: quote?.totalPrice || booking.totalPrice || 0,
      });
    }
  }, [pickupPostcode, deliveryPostcode, weight, vehicleType, isMultiDrop, isReturnTrip, returnToSameLocation, returnPostcode, pickupFullAddress, deliveryFullAddress, pickupAddress, deliveryAddress, pickupBuildingName, pickupName, pickupPhone, pickupInstructions, customerEmail, deliveryBuildingName, recipientName, recipientPhone, deliveryInstructions, multiDropStops, distance, estimatedTime, quote]);

  useEffect(() => {
    if (userProfile) {
      // Only set pickup address from profile if not already set from quote/saved data
      // Note: Postcodes are intentionally NOT auto-filled - they should always be empty
      setPickupAddress(prev => prev || userProfile.address || '');
      setPickupBuildingName(prev => prev || userProfile.buildingName || '');
      setPickupName(prev => prev || userProfile.fullName || '');
      setPickupPhone(prev => prev || userProfile.phone || '');
      setCustomerEmail(prev => prev || userProfile.email || '');
    } else if (user) {
      setPickupName(prev => prev || user.fullName || '');
      setPickupPhone(prev => prev || user.phone || '');
      setCustomerEmail(prev => prev || user.email || '');
    }
  }, [userProfile, user, form]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const pickupParam = params.get('pickup');
    const deliveryParam = params.get('delivery');
    const vehicle = params.get('vehicle') as VehicleType;
    const weightParam = params.get('weight');
    const isMultiDropParam = params.get('multiDrop') === 'true';
    const stopsParam = params.get('stops');
    const isReturnParam = params.get('return') === 'true';
    const returnSameParam = params.get('returnSame') === 'true';
    const returnPostcodeParam = params.get('returnPostcode');
    const timeParam = params.get('time');
    const priceParam = params.get('price');

    // Load postcodes from URL params when coming from quote page
    if (pickupParam) {
      form.setValue('pickupPostcode', pickupParam);
    }
    if (deliveryParam) {
      form.setValue('deliveryPostcode', deliveryParam);
    }

    if (vehicle) {
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
        if (!returnSameParam && returnPostcodeParam) {
          form.setValue('returnPostcode', returnPostcodeParam);
        }
      }
      if (timeParam) {
        setEstimatedTime(parseInt(timeParam));
      }
      // Mark that quote came from params so we can auto-calculate
      if (priceParam && pickupParam && deliveryParam) {
        setQuoteFromParams(true);
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
          setPickupAddress(pickupLocation.formattedAddress);
        }
        if (deliveryLocation.formattedAddress) {
          setDeliveryFullAddress(deliveryLocation.formattedAddress);
          setDeliveryAddress(deliveryLocation.formattedAddress);
        }

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
          
          // Create scheduled time from selected pickup date/time for rush hour calculation
          const pickupDateVal = form.getValues('pickupDate');
          const pickupTimeVal = form.getValues('pickupTime');
          const scheduledTime = pickupDateVal && pickupTimeVal 
            ? new Date(`${pickupDateVal}T${pickupTimeVal}`) 
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
              pickupDate: form.getValues('pickupDate'),
              pickupTime: form.getValues('pickupTime'),
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
  }, [pickupPostcode, deliveryPostcode, weight, vehicleType, isMultiDrop, isReturnTrip, returnToSameLocation, returnPostcode, multiDropStops, toast]);

  // Auto-calculate quote when coming from quote page with pre-filled data
  useEffect(() => {
    if (quoteFromParams && pickupPostcode && deliveryPostcode && vehicleType && !quote && !isCalculating) {
      handleGetQuote();
      setQuoteFromParams(false);
    }
  }, [quoteFromParams, pickupPostcode, deliveryPostcode, vehicleType, quote, isCalculating, handleGetQuote]);

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
                                    placeholder="e.g., SW1A 1AA"
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
                                <FormLabel>{isMultiDrop ? 'Drop 1 (First Delivery)' : 'Delivery Postcode'}</FormLabel>
                                <FormControl>
                                  <PostcodeAutocomplete
                                    value={field.value}
                                    onChange={(value, fullAddress) => {
                                      field.onChange(value);
                                      if (fullAddress) setDeliveryFullAddress(fullAddress);
                                    }}
                                    placeholder="e.g., EC1A 1BB"
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

                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-primary" />
                              Pickup Date & Time
                            </Label>
                            <FormField
                              control={form.control}
                              name="pickupDate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm">Date</FormLabel>
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
                                  <FormLabel className="text-sm">Time</FormLabel>
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
                          <div className="space-y-3">
                            <Label className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-primary" />
                              Delivery Date & Time (optional)
                            </Label>
                            <FormField
                              control={form.control}
                              name="deliveryDate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-sm">Date</FormLabel>
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
                                  <FormLabel className="text-sm">Time</FormLabel>
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

                        <div className="space-y-3">
                          <label className="text-sm font-medium leading-none">Service Level</label>
                          <div className="grid grid-cols-2 gap-2">
                            {(Object.entries(SERVICE_TYPE_CONFIG) as [ServiceType, typeof SERVICE_TYPE_CONFIG[ServiceType]][]).map(([key, cfg]) => (
                              <button
                                key={key}
                                type="button"
                                data-testid={`button-service-type-${key}`}
                                onClick={() => updateBooking({ serviceType: key })}
                                className={`rounded-md border p-3 text-left transition-colors ${
                                  bookingServiceType === key
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border bg-background hover-elevate'
                                }`}
                              >
                                <div className="text-sm font-semibold">{cfg.label}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{cfg.description}</div>
                              </button>
                            ))}
                          </div>
                        </div>

                        <FormField
                          control={form.control}
                          name="weight"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Weight (kg)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={0.1}
                                  max={selectedVehicle?.maxWeight || 50}
                                  step={0.1}
                                  placeholder="Enter weight in kg"
                                  value={field.value === 0 ? '' : field.value}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    field.onChange(val === '' ? 0 : parseFloat(val));
                                  }}
                                  onFocus={(e) => { if (field.value === 0) e.target.value = ''; }}
                                  data-testid="input-weight"
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
                            <Label>Additional Drops</Label>
                            <p className="text-xs text-muted-foreground">
                              Your first delivery address above is Drop 1. Add more drops below.
                            </p>
                            {multiDropStops.map((stop, index) => (
                              <div key={index} className="flex gap-2 items-center">
                                <span className="text-sm font-medium text-muted-foreground w-16">Drop {index + 2}</span>
                                <div className="flex-1">
                                  <PostcodeAutocomplete
                                    value={stop}
                                    onChange={(value, fullAddress) => updateMultiDropStop(index, value, fullAddress)}
                                    placeholder={`Drop ${index + 2} postcode or address`}
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
                              Add Drop {multiDropStops.length + 2}
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
                                <p className="text-2xl font-bold text-primary" data-testid="text-final-price">
                                  £{finalPrice.toFixed(2)}
                                </p>
                                <p className="text-xs text-green-600 font-medium mt-1" data-testid="text-discount-label">
                                  New customer discount applied (20% off first 3 bookings)
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="text-2xl font-bold text-primary" data-testid="text-final-price">
                                  £{finalPrice.toFixed(2)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {SERVICE_TYPE_CONFIG[bookingServiceType].label} — Total delivery cost
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
                      <PhoneInput 
                        value={pickupPhone}
                        onChange={setPickupPhone}
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
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <h3 className="font-semibold">Delivery Details (Stop 1)</h3>
                      {isBusinessUser && savedContacts.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          <User className="h-3 w-3 mr-1" />
                          Business Account
                        </Badge>
                      )}
                    </div>
                    
                    {isBusinessUser && savedContacts.length > 0 && (
                      <div className="space-y-2">
                        <Label>Saved Contacts</Label>
                        <Select value={selectedContactId} onValueChange={handleSelectSavedContact}>
                          <SelectTrigger data-testid="select-saved-contact">
                            <SelectValue placeholder="Select a saved contact or enter new" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">Enter new details</SelectItem>
                            {savedContacts.map((contact) => (
                              <SelectItem key={contact.id} value={contact.id}>
                                {contact.label} - {contact.recipientName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
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
                      <PhoneInput 
                        value={recipientPhone}
                        onChange={setRecipientPhone}
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
                    
                    {isBusinessUser && selectedContactId !== '' && !savedContacts.find(c => c.id === selectedContactId) && (
                      <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="save-contact" 
                            checked={saveDeliveryContact}
                            onCheckedChange={(checked) => setSaveDeliveryContact(checked as boolean)}
                            data-testid="checkbox-save-contact"
                          />
                          <Label htmlFor="save-contact" className="text-sm cursor-pointer">
                            Save this contact for future bookings
                          </Label>
                        </div>
                        {saveDeliveryContact && (
                          <div className="space-y-2">
                            <Label>Contact Label</Label>
                            <Input 
                              placeholder="e.g., Head Office, Warehouse A" 
                              value={savedContactLabel}
                              onChange={(e) => setSavedContactLabel(e.target.value)}
                              data-testid="input-contact-label"
                            />
                          </div>
                        )}
                      </div>
                    )}
                    
                    {isBusinessUser && savedContacts.length === 0 && (
                      <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                        <div className="flex items-center space-x-2">
                          <Checkbox 
                            id="save-first-contact" 
                            checked={saveDeliveryContact}
                            onCheckedChange={(checked) => setSaveDeliveryContact(checked as boolean)}
                            data-testid="checkbox-save-first-contact"
                          />
                          <Label htmlFor="save-first-contact" className="text-sm cursor-pointer">
                            Save this contact for future bookings
                          </Label>
                        </div>
                        {saveDeliveryContact && (
                          <div className="space-y-2">
                            <Label>Contact Label</Label>
                            <Input 
                              placeholder="e.g., Head Office, Warehouse A" 
                              value={savedContactLabel}
                              onChange={(e) => setSavedContactLabel(e.target.value)}
                              data-testid="input-first-contact-label"
                            />
                          </div>
                        )}
                      </div>
                    )}
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
                              <PhoneInput 
                                value={stopDetail.phone}
                                onChange={(val) => updateStopDetail(index, 'phone', val)}
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
                  <Button 
                    onClick={handleProceedToPayment} 
                    disabled={saveContactMutation.isPending}
                    data-testid="button-to-payment"
                  >
                    {saveContactMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Continue to Payment
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
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
                        {isEligibleForNewCustomerDiscount && (
                          <>
                            <div className="flex justify-between text-green-600" data-testid="order-discount-line">
                              <span>New customer discount (20% off)</span>
                              <span>-£{discountAmount.toFixed(2)}</span>
                            </div>
                            <Separator className="my-2" />
                          </>
                        )}
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
                          basePrice: quote.baseCharge,
                          distancePrice: quote.distanceCharge,
                          weightSurcharge: quote.weightSurcharge || 0,
                          multiDropCharge: quote.multiDropCharge || 0,
                          returnTripCharge: quote.returnTripCharge || 0,
                          centralLondonCharge: quote.congestionZoneCharge || 0,
                          waitingTimeCharge: 0,
                          serviceType: bookingServiceType,
                          serviceTypePercent: serviceTypeAdj.percent,
                          serviceTypeAmount: serviceTypeAdj.amount,
                          totalPrice: priceAfterDiscount,
                          distance,
                          estimatedTime,
                          isMultiDrop,
                          isReturnTrip,
                          isCentralLondon: quote.congestionZoneCharge > 0,
                          isRushHour: quote.rushHourApplied || false,
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
                          
                          clearBooking();
                          setLocation(`/payment/success?tracking=${result.trackingNumber}&jobNumber=${result.jobNumber || ''}&payLater=true`);
                        } else {
                          // Prefetch payment intent for faster loading
                          try {
                            const response = await apiRequest('POST', '/api/booking/create-payment-intent', bookingData);
                            const data = await response.json();
                            
                            if (data.clientSecret && data.paymentIntentId) {
                              setPrefetchedClientSecret(data.clientSecret);
                              setPrefetchedPaymentIntentId(data.paymentIntentId);
                            }
                          } catch (prefetchError) {
                            console.log('[Payment] Prefetch failed, will retry in component');
                          }
                          
                          setPendingBookingData(bookingData);
                          setShowEmbeddedPayment(true);
                          setIsProcessingPayment(false);
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

          {/* Embedded Payment Step */}
          {showEmbeddedPayment && pendingBookingData && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Secure Payment
                </CardTitle>
                <CardDescription>
                  Complete your booking by entering your payment details below
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EmbeddedPayment
                  bookingData={pendingBookingData}
                  prefetchedClientSecret={prefetchedClientSecret || undefined}
                  prefetchedPaymentIntentId={prefetchedPaymentIntentId || undefined}
                  onSuccess={(trackingNumber, jobId, jobNumber) => {
                    toast({
                      title: 'Payment Successful!',
                      description: `Your booking has been confirmed. Job number: ${jobNumber || trackingNumber}`,
                    });
                    const paidAmount = pendingBookingData?.totalPrice ?? 0;
                    clearBooking();
                    setPrefetchedClientSecret(null);
                    setPrefetchedPaymentIntentId(null);
                    setLocation(`/payment/success?tracking=${trackingNumber}&jobNumber=${jobNumber || ''}&amount=${paidAmount}`);
                  }}
                  onCancel={() => {
                    setShowEmbeddedPayment(false);
                    setPendingBookingData(null);
                    setPrefetchedClientSecret(null);
                    setPrefetchedPaymentIntentId(null);
                  }}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}
