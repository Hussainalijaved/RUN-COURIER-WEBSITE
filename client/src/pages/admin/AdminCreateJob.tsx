import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { PostcodeAutocomplete } from '@/components/PostcodeAutocomplete';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { calculateQuote, formatPrice, type QuoteBreakdown } from '@/lib/pricing';
import { calculateDistanceFromPostcodes } from '@/lib/maps';
import type { Driver, VehicleType } from '@shared/schema';
import {
  Package,
  MapPin,
  Truck,
  Calculator,
  Send,
  Loader2,
  Edit3,
  User,
  Phone,
  Weight,
  Route,
  Banknote,
  CheckCircle,
  RefreshCw,
  Calendar,
  Clock,
} from 'lucide-react';

const createJobSchema = z.object({
  pickupAddress: z.string().min(5, 'Pickup address is required'),
  pickupPostcode: z.string().min(3, 'Pickup postcode is required'),
  pickupInstructions: z.string().optional(),
  deliveryAddress: z.string().min(5, 'Delivery address is required'),
  deliveryPostcode: z.string().min(3, 'Delivery postcode is required'),
  deliveryInstructions: z.string().optional(),
  recipientName: z.string().min(2, 'Recipient name is required'),
  recipientPhone: z.string().min(10, 'Valid phone number is required'),
  weight: z.coerce.number().min(0.1, 'Weight must be greater than 0'),
  vehicleType: z.enum(['motorbike', 'car', 'small_van', 'medium_van']),
  isMultiDrop: z.boolean().default(false),
  isReturnTrip: z.boolean().default(false),
  driverId: z.string().optional(),
  pickupDate: z.string().min(1, 'Pickup date is required'),
  pickupTime: z.string().min(1, 'Pickup time is required'),
  deliveryDate: z.string().optional(),
  deliveryTime: z.string().optional(),
});

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

type CreateJobInput = z.infer<typeof createJobSchema>;

export default function AdminCreateJob() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [quote, setQuote] = useState<QuoteBreakdown | null>(null);
  const [distance, setDistance] = useState<number>(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [driverPrice, setDriverPrice] = useState<number | null>(null);
  const [isEditingDriverPrice, setIsEditingDriverPrice] = useState(false);

  const form = useForm<CreateJobInput>({
    resolver: zodResolver(createJobSchema),
    defaultValues: {
      pickupAddress: '',
      pickupPostcode: '',
      pickupInstructions: '',
      deliveryAddress: '',
      deliveryPostcode: '',
      deliveryInstructions: '',
      recipientName: '',
      recipientPhone: '',
      weight: 1,
      vehicleType: 'car',
      isMultiDrop: false,
      isReturnTrip: false,
      driverId: '',
      pickupDate: getTodayDate(),
      pickupTime: getCurrentTime(),
      deliveryDate: '',
      deliveryTime: '',
    },
  });

  const { data: drivers } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
  });

  const availableDrivers = drivers?.filter(d => d.isAvailable && d.isVerified) || [];

  const pickupPostcode = form.watch('pickupPostcode');
  const deliveryPostcode = form.watch('deliveryPostcode');
  const weight = form.watch('weight');
  const vehicleType = form.watch('vehicleType');
  const isReturnTrip = form.watch('isReturnTrip');

  const lastCalculatedRef = useRef<string>('');

  useEffect(() => {
    const calculateQuoteFromFields = async () => {
      const cacheKey = `${pickupPostcode}-${deliveryPostcode}-${weight}-${vehicleType}-${isReturnTrip}`;
      
      if (cacheKey === lastCalculatedRef.current) {
        return;
      }
      
      if (pickupPostcode && deliveryPostcode && pickupPostcode.length >= 3 && deliveryPostcode.length >= 3) {
        setIsCalculating(true);
        try {
          const distResult = await calculateDistanceFromPostcodes(pickupPostcode, deliveryPostcode);
          if (distResult) {
            setDistance(distResult.distance);
            
            const quoteResult = calculateQuote(vehicleType as VehicleType, distResult.distance, weight || 1, {
              pickupPostcode,
              deliveryPostcode,
              isReturnTrip: isReturnTrip || false,
              returnToSameLocation: isReturnTrip || false,
            });
            
            setQuote(quoteResult);
            setPriceOverride(null);
            setIsEditingPrice(false);
            lastCalculatedRef.current = cacheKey;
          }
        } catch (error) {
          console.error('Error calculating quote:', error);
        } finally {
          setIsCalculating(false);
        }
      }
    };

    const timer = setTimeout(calculateQuoteFromFields, 500);
    return () => clearTimeout(timer);
  }, [pickupPostcode, deliveryPostcode, weight, vehicleType, isReturnTrip]);

  const createJobMutation = useMutation({
    mutationFn: async (data: CreateJobInput) => {
      const finalPrice = priceOverride !== null ? priceOverride : (quote?.totalPrice || 0);
      
      const scheduledPickupTime = data.pickupDate && data.pickupTime 
        ? new Date(`${data.pickupDate}T${data.pickupTime}`).toISOString()
        : null;
      const scheduledDeliveryTime = data.deliveryDate && data.deliveryTime
        ? new Date(`${data.deliveryDate}T${data.deliveryTime}`).toISOString()
        : null;
      
      const jobData = {
        ...data,
        customerId: 'admin-created',
        distance: distance.toString(),
        basePrice: quote?.baseCharge.toString() || '0',
        distancePrice: quote?.distanceCharge.toString() || '0',
        weightSurcharge: quote?.weightSurcharge.toString() || '0',
        centralLondonCharge: quote?.centralLondonCharge.toString() || '0',
        returnTripCharge: quote?.returnTripCharge.toString() || '0',
        totalPrice: finalPrice.toString(),
        driverPrice: driverPrice !== null ? driverPrice.toString() : null,
        paymentStatus: 'pending',
        status: data.driverId ? 'assigned' : 'pending',
        scheduledPickupTime,
        scheduledDeliveryTime,
        isScheduled: !!scheduledPickupTime,
      };

      const res = await apiRequest('POST', '/api/jobs', jobData);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Job Created',
        description: `Job ${data.trackingNumber} has been created successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      navigate('/admin/jobs');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create job',
        variant: 'destructive',
      });
    },
  });

  const handleRecalculate = async () => {
    const values = form.getValues();
    if (values.pickupPostcode && values.deliveryPostcode) {
      setIsCalculating(true);
      try {
        const distResult = await calculateDistanceFromPostcodes(values.pickupPostcode, values.deliveryPostcode);
        if (distResult) {
          setDistance(distResult.distance);
          
          const quoteResult = calculateQuote(values.vehicleType as VehicleType, distResult.distance, values.weight || 1, {
            pickupPostcode: values.pickupPostcode,
            deliveryPostcode: values.deliveryPostcode,
            isReturnTrip: values.isReturnTrip || false,
            returnToSameLocation: values.isReturnTrip || false,
          });
          
          setQuote(quoteResult);
          setPriceOverride(null);
          setIsEditingPrice(false);
        }
      } catch (error) {
        console.error('Error recalculating:', error);
      } finally {
        setIsCalculating(false);
      }
    }
  };

  const onSubmit = (data: CreateJobInput) => {
    if (!quote && priceOverride === null) {
      toast({
        title: 'Quote Required',
        description: 'Please calculate a quote before creating the job.',
        variant: 'destructive',
      });
      return;
    }
    createJobMutation.mutate(data);
  };

  const getFinalPrice = () => {
    if (priceOverride !== null) return priceOverride;
    return quote?.totalPrice || 0;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Create New Job</h1>
            <p className="text-muted-foreground">Create a delivery job and assign it to a driver</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Pickup & Delivery Details */}
              <div className="lg:col-span-2 space-y-6">
                {/* Pickup Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-green-500" />
                      Pickup Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="pickupPostcode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pickup Postcode *</FormLabel>
                          <FormControl>
                            <PostcodeAutocomplete
                              value={field.value}
                              onChange={(postcode, address) => {
                                field.onChange(postcode);
                                if (address) {
                                  form.setValue('pickupAddress', address);
                                }
                              }}
                              placeholder="Enter pickup postcode"
                              data-testid="input-pickup-postcode"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="pickupAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pickup Address *</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Full pickup address"
                              data-testid="input-pickup-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="pickupInstructions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pickup Instructions</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="e.g., Ring doorbell, ask for John"
                              data-testid="input-pickup-instructions"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Delivery Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-red-500" />
                      Delivery Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="deliveryPostcode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Delivery Postcode *</FormLabel>
                          <FormControl>
                            <PostcodeAutocomplete
                              value={field.value}
                              onChange={(postcode, address) => {
                                field.onChange(postcode);
                                if (address) {
                                  form.setValue('deliveryAddress', address);
                                }
                              }}
                              placeholder="Enter delivery postcode"
                              data-testid="input-delivery-postcode"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="deliveryAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Delivery Address *</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Full delivery address"
                              data-testid="input-delivery-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="recipientName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Recipient Name *</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  className="pl-10"
                                  placeholder="John Smith"
                                  data-testid="input-recipient-name"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="recipientPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Recipient Phone *</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  className="pl-10"
                                  placeholder="+44 7XXX XXX XXX"
                                  data-testid="input-recipient-phone"
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
                      name="deliveryInstructions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Delivery Instructions</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="e.g., Leave with reception, call before arrival"
                              data-testid="input-delivery-instructions"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Schedule Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-purple-500" />
                      Schedule
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-primary" />
                          Pickup Date & Time *
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
                      <div className="space-y-2">
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
                  </CardContent>
                </Card>

                {/* Package & Vehicle Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-blue-500" />
                      Package & Vehicle
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="weight"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Weight (kg) *</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Weight className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  type="number"
                                  step="0.1"
                                  min="0.1"
                                  className="pl-10"
                                  placeholder="1.0"
                                  data-testid="input-weight"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="vehicleType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vehicle Type *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-vehicle-type">
                                  <SelectValue placeholder="Select vehicle" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="motorbike">Motorbike (up to 5kg)</SelectItem>
                                <SelectItem value="car">Car (up to 50kg)</SelectItem>
                                <SelectItem value="small_van">Small Van (up to 400kg)</SelectItem>
                                <SelectItem value="medium_van">Medium Van (up to 750kg)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="isReturnTrip"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>Return Trip</FormLabel>
                              <FormDescription>
                                Driver returns to pickup location
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-return-trip"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="isMultiDrop"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>Multi-Drop</FormLabel>
                              <FormDescription>
                                Multiple delivery stops
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="switch-multi-drop"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column - Quote & Driver Assignment */}
              <div className="space-y-6">
                {/* Quote Summary */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-primary" />
                        Quote Summary
                      </CardTitle>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleRecalculate}
                        disabled={isCalculating}
                        data-testid="button-recalculate"
                      >
                        {isCalculating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {isCalculating ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : quote ? (
                      <>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Distance</span>
                            <span className="font-medium" data-testid="text-distance">{distance.toFixed(1)} miles</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Base Charge</span>
                            <span data-testid="text-base-charge">{formatPrice(quote.baseCharge)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Distance Charge</span>
                            <span data-testid="text-distance-charge">{formatPrice(quote.distanceCharge)}</span>
                          </div>
                          {quote.weightSurcharge > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Weight Surcharge</span>
                              <span data-testid="text-weight-surcharge">{formatPrice(quote.weightSurcharge)}</span>
                            </div>
                          )}
                          {quote.centralLondonCharge > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Central London</span>
                              <span data-testid="text-london-charge">{formatPrice(quote.centralLondonCharge)}</span>
                            </div>
                          )}
                          {quote.returnTripCharge > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Return Trip</span>
                              <span data-testid="text-return-charge">{formatPrice(quote.returnTripCharge)}</span>
                            </div>
                          )}
                          {quote.rushHourApplied && (
                            <Badge variant="secondary" className="mt-2">
                              Rush Hour Rates Applied
                            </Badge>
                          )}
                        </div>
                        
                        <Separator />
                        
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold">Calculated Total</span>
                            <span className="text-lg" data-testid="text-calculated-total">
                              {formatPrice(quote.totalPrice)}
                            </span>
                          </div>
                          
                          {/* Customer Total Price - Admin Only */}
                          <div className="space-y-2 p-3 border border-primary/20 rounded-lg bg-primary/5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Label className="text-sm font-medium">Customer Total Price</Label>
                                <Badge variant="secondary" className="text-xs">Admin Only</Badge>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsEditingPrice(!isEditingPrice)}
                                data-testid="button-edit-price"
                              >
                                <Edit3 className="h-4 w-4 mr-1" />
                                {isEditingPrice ? 'Cancel' : 'Edit'}
                              </Button>
                            </div>
                            
                            {isEditingPrice ? (
                              <div className="relative">
                                <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={priceOverride !== null ? priceOverride : quote.totalPrice}
                                  onChange={(e) => setPriceOverride(parseFloat(e.target.value) || 0)}
                                  className="pl-10 text-lg font-bold"
                                  data-testid="input-price-override"
                                />
                              </div>
                            ) : (
                              <div className="flex items-center justify-between p-2 bg-background rounded">
                                <span className="font-bold text-xl" data-testid="text-final-price">
                                  {formatPrice(getFinalPrice())}
                                </span>
                                {priceOverride !== null && priceOverride !== quote.totalPrice && (
                                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                                    Modified
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <Separator />
                          
                          {/* Driver Price - What Driver Gets Paid */}
                          <div className="space-y-2 p-3 border border-green-500/20 rounded-lg bg-green-50 dark:bg-green-950/20">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Label className="text-sm font-medium text-green-700 dark:text-green-400">Driver Price</Label>
                                <Badge variant="outline" className="text-xs border-green-500 text-green-700 dark:text-green-400">
                                  Driver Sees This
                                </Badge>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsEditingDriverPrice(!isEditingDriverPrice)}
                                data-testid="button-edit-driver-price"
                              >
                                <Edit3 className="h-4 w-4 mr-1" />
                                {isEditingDriverPrice ? 'Cancel' : 'Edit'}
                              </Button>
                            </div>
                            
                            {isEditingDriverPrice ? (
                              <div className="relative">
                                <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={driverPrice !== null ? driverPrice : ''}
                                  onChange={(e) => setDriverPrice(parseFloat(e.target.value) || 0)}
                                  className="pl-10 text-lg font-bold border-green-300 focus:border-green-500"
                                  placeholder="Enter driver payment amount"
                                  data-testid="input-driver-price"
                                />
                              </div>
                            ) : (
                              <div className="flex items-center justify-between p-2 bg-background rounded">
                                <span className="font-bold text-xl text-green-700 dark:text-green-400" data-testid="text-driver-price">
                                  {driverPrice !== null ? formatPrice(driverPrice) : 'Not set'}
                                </span>
                                {driverPrice !== null && (
                                  <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                                    Set
                                  </Badge>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                              This is the amount the driver will see and get paid for this job.
                            </p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Route className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Enter pickup and delivery postcodes to calculate quote</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Driver Assignment */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-primary" />
                      Assign Driver
                    </CardTitle>
                    <CardDescription>
                      Optionally assign to an available driver
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="driverId"
                      render={({ field }) => (
                        <FormItem>
                          <Select 
                            onValueChange={(value) => field.onChange(value === "none" ? "" : value)} 
                            value={field.value || "none"}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-driver">
                                <SelectValue placeholder="Select driver (optional)" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No driver (pending assignment)</SelectItem>
                              {availableDrivers.map((driver) => (
                                <SelectItem key={driver.id} value={driver.id}>
                                  <div className="flex items-center gap-2">
                                    <span>{driver.fullName || driver.vehicleRegistration}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {driver.vehicleType}
                                    </Badge>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            {availableDrivers.length === 0 
                              ? 'No drivers currently available'
                              : `${availableDrivers.length} driver${availableDrivers.length > 1 ? 's' : ''} available`
                            }
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Submit Button */}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={createJobMutation.isPending || !quote}
                  data-testid="button-create-job"
                >
                  {createJobMutation.isPending ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Creating Job...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 mr-2" />
                      Create Job {quote && `(${formatPrice(getFinalPrice())})`}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </div>
    </DashboardLayout>
  );
}
