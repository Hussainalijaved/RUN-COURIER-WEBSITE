import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
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
import { calculateQuote, formatPrice, type QuoteBreakdown, SERVICE_TYPE_CONFIG, applyServiceTypeAdjustment, type ServiceType } from '@/lib/pricing';
import { calculateDistanceFromPostcodes } from '@/lib/maps';
import { RouteMapPreview } from '@/components/RouteMapPreview';
import type { Driver, VehicleType, CustomerType } from '@shared/schema';
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
  Building2,
  UserCircle,
  Plus,
  Trash2,
  ArrowRight,
} from 'lucide-react';

interface DropPoint {
  id: string;
  postcode: string;
  address: string;
  recipientName: string;
  recipientPhone: string;
  instructions: string;
}

const createJobSchema = z.object({
  customerType: z.enum(['individual', 'business']).default('individual'),
  pickupAddress: z.string().optional().default(''),
  pickupPostcode: z.string().optional().default(''),
  pickupInstructions: z.string().optional(),
  deliveryAddress: z.string().default(''),
  deliveryPostcode: z.string().default(''),
  deliveryInstructions: z.string().optional(),
  recipientName: z.string().default(''),
  recipientPhone: z.string().default(''),
  senderName: z.string().optional(),
  senderPhone: z.string().optional(),
  companyName: z.string().optional(),
  weight: z.coerce.number().optional().default(1),
  vehicleType: z.enum(['motorbike', 'car', 'small_van', 'medium_van']),
  isMultiDrop: z.boolean().default(false),
  isReturnTrip: z.boolean().default(false),
  waitingTime: z.coerce.number().min(0).optional().default(0),
  driverId: z.string().optional(),
  pickupDate: z.string().optional().default(''),
  pickupTime: z.string().optional().default(''),
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
  const [selectedServiceType, setSelectedServiceType] = useState<ServiceType>('flexible');

  // Multi-drop state
  const [drops, setDrops] = useState<DropPoint[]>([]);
  const [isMultiDropMode, setIsMultiDropMode] = useState(false);
  const [routeLegs, setRouteLegs] = useState<{ from: string; to: string; distance: number }[]>([]);
  
  
  const addDrop = () => {
    setDrops(prev => [...prev, { 
      id: String(Date.now()), 
      postcode: '', 
      address: '', 
      recipientName: '', 
      recipientPhone: '', 
      instructions: '' 
    }]);
  };

  const removeDrop = (id: string) => {
    setDrops(prev => prev.filter(d => d.id !== id));
  };

  const updateDrop = (id: string, field: keyof DropPoint, value: string) => {
    setDrops(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const form = useForm<CreateJobInput>({
    resolver: zodResolver(createJobSchema),
    defaultValues: {
      customerType: 'individual',
      pickupAddress: '',
      pickupPostcode: '',
      pickupInstructions: '',
      senderName: '',
      senderPhone: '',
      companyName: '',
      deliveryAddress: '',
      deliveryPostcode: '',
      deliveryInstructions: '',
      recipientName: '',
      recipientPhone: '',
      weight: 1,
      vehicleType: 'car',
      isMultiDrop: false,
      isReturnTrip: false,
      waitingTime: 0,
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

  // Fetch drivers from Supabase (authoritative source)
  interface SupabaseDriver {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    role: string;
    driverCode: string | null;
    vehicleType?: string;
    isVerified?: boolean;
    isAvailable?: boolean;
    createdAt: string;
  }
  
  const { data: supabaseDrivers, isError: supabaseDriversError } = useQuery<SupabaseDriver[]>({
    queryKey: ['/api/supabase-drivers'],
    retry: false, // Don't retry on Supabase schema errors
  });

  // Admin can assign to ANY driver (verified or not) - they have full control
  // Use Supabase drivers as primary source, fall back to local PostgreSQL drivers when Supabase fails
  const availableDrivers = useMemo(() => {
    // Fallback to local PostgreSQL drivers when Supabase is unavailable or has errors
    if (supabaseDriversError || !supabaseDrivers || supabaseDrivers.length === 0) {
      return (drivers || []).map(d => ({
        id: d.id,
        fullName: d.fullName || 'Unknown',
        driverCode: d.driverCode || null,
        vehicleType: d.vehicleType || 'car',
        vehicleRegistration: d.vehicleRegistration || '',
        isVerified: d.isVerified ?? false,
        isAvailable: d.isAvailable ?? false,
      }));
    }
    // Use Supabase drivers merged with local data
    return supabaseDrivers.map(sd => ({
      id: sd.id,
      fullName: sd.fullName,
      driverCode: sd.driverCode,
      vehicleType: sd.vehicleType || 'car',
      vehicleRegistration: drivers?.find(d => d.id === sd.id)?.vehicleRegistration || '',
      isVerified: sd.isVerified ?? false,
      isAvailable: sd.isAvailable ?? false,
    }));
  }, [supabaseDrivers, supabaseDriversError, drivers]);

  const pickupPostcode = form.watch('pickupPostcode');
  const deliveryPostcode = form.watch('deliveryPostcode');
  const weight = form.watch('weight');
  const vehicleType = form.watch('vehicleType');
  const isReturnTrip = form.watch('isReturnTrip');
  const waitingTime = form.watch('waitingTime');
  const pickupDate = form.watch('pickupDate');
  const pickupTime = form.watch('pickupTime');

  const lastCalculatedRef = useRef<string>('');

  // Calculate multi-drop quote using optimized route API
  // Supports unlimited drops via chunked Distance Matrix API requests
  
  const calculateMultiDropQuote = async () => {
    if (!pickupPostcode || pickupPostcode.length < 3) {
      toast({ title: 'Please enter a pickup postcode', variant: 'destructive' });
      return;
    }
    
    const validDrops = drops.filter(d => d.postcode.trim().length >= 3);
    if (validDrops.length === 0) {
      toast({ title: 'Please add at least one delivery drop', variant: 'destructive' });
      return;
    }

    setIsCalculating(true);
    setQuote(null);
    setRouteLegs([]);

    try {
      const dropPostcodes = validDrops.map(d => d.postcode).join('|');
      const routeResponse = await fetch(
        `/api/maps/optimized-route?origin=${encodeURIComponent(pickupPostcode)}&drops=${encodeURIComponent(dropPostcodes)}`
      );
      
      if (!routeResponse.ok) {
        const errorData = await routeResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to calculate optimized route');
      }
      
      const routeData = await routeResponse.json();
      
      // Validate optimized route response (same validation as Book.tsx/Quote.tsx/AdminBusinessQuote)
      if (!routeData.legs || routeData.legs.length === 0) {
        throw new Error('No valid route legs returned');
      }
      
      // Validate optimizedOrder exists and matches drop count
      if (!routeData.optimizedOrder || routeData.optimizedOrder.length !== validDrops.length) {
        throw new Error('Route optimization failed - please check postcodes');
      }
      
      // Extract distance legs from optimized route response
      const legs: { from: string; to: string; distance: number }[] = routeData.legs.map((leg: any) => ({
        from: leg.from || '',
        to: leg.to || '',
        distance: leg.distance || 0,
      }));
      
      const totalDistance = routeData.totalDistance || legs.reduce((sum: number, leg: any) => sum + leg.distance, 0);
      
      setDistance(totalDistance);
      setRouteLegs(legs);
      
      // Reorder drops based on optimized route (same as AdminBusinessQuote)
      const reorderedDrops = routeData.optimizedOrder.map((idx: number) => validDrops[idx]);
      
      // Get all postcodes for congestion check (in optimized order)
      const allDropPostcodes = reorderedDrops.map((d: any) => d.postcode);
      
      // Use scheduled pickup time for rush hour calculation if available
      let scheduledTime: Date | undefined;
      if (pickupDate && pickupTime) {
        scheduledTime = new Date(`${pickupDate}T${pickupTime}`);
      }
      
      // Calculate quote with multi-drop pricing (same logic as AdminBusinessQuote)
      // First leg is base distance (pickup to first optimized drop), remaining legs are multi-drop distances
      const baseDistance = legs[0]?.distance || 0;
      const multiDropDistances = legs.slice(1).map(l => l.distance);
      
      const quoteResult = calculateQuote(vehicleType as VehicleType, baseDistance, weight || 1, {
        pickupPostcode,
        deliveryPostcode: reorderedDrops[0]?.postcode || '',
        allDropPostcodes,
        isMultiDrop: true,
        multiDropCount: reorderedDrops.length - 1,
        multiDropDistances,
        isReturnTrip: isReturnTrip || false,
        returnToSameLocation: isReturnTrip || false,
        scheduledTime,
        waitingTimeMinutes: waitingTime || 0,
      });
      
      setQuote(quoteResult);
      setPriceOverride(null);
      setIsEditingPrice(false);
      
      toast({ title: 'Multi-drop quote calculated successfully' });
    } catch (error) {
      console.error('Error calculating multi-drop quote:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to calculate multi-drop quote';
      toast({ 
        title: 'Quote Calculation Failed', 
        description: errorMessage,
        variant: 'destructive' 
      });
    } finally {
      setIsCalculating(false);
    }
  };

  useEffect(() => {
    // Skip auto-calculation in multi-drop mode - user must click calculate button
    if (isMultiDropMode) {
      return;
    }
    
    const calculateQuoteFromFields = async () => {
      const cacheKey = `${pickupPostcode}-${deliveryPostcode}-${weight}-${vehicleType}-${isReturnTrip}-${pickupDate}-${pickupTime}`;
      
      if (cacheKey === lastCalculatedRef.current) {
        return;
      }
      
      if (pickupPostcode && deliveryPostcode && pickupPostcode.length >= 3 && deliveryPostcode.length >= 3) {
        setIsCalculating(true);
        try {
          const distResult = await calculateDistanceFromPostcodes(pickupPostcode, deliveryPostcode);
          if (distResult) {
            setDistance(distResult.distance);
            
            // Use scheduled pickup time for rush hour calculation if available
            let scheduledTime: Date | undefined;
            if (pickupDate && pickupTime) {
              scheduledTime = new Date(`${pickupDate}T${pickupTime}`);
            }
            
            const quoteResult = calculateQuote(vehicleType as VehicleType, distResult.distance, weight || 1, {
              pickupPostcode,
              deliveryPostcode,
              allDropPostcodes: [deliveryPostcode], // Single delivery for congestion check
              isReturnTrip: isReturnTrip || false,
              returnToSameLocation: isReturnTrip || false,
              scheduledTime,
              waitingTimeMinutes: waitingTime || 0,
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
  }, [pickupPostcode, deliveryPostcode, weight, vehicleType, isReturnTrip, waitingTime, isMultiDropMode, pickupDate, pickupTime]);


  const createJobMutation = useMutation({
    mutationFn: async (data: CreateJobInput) => {
      const baseQuoteTotal = quote?.totalPrice || 0;
      const adj = applyServiceTypeAdjustment(baseQuoteTotal, selectedServiceType);
      const finalPrice = priceOverride !== null ? priceOverride : adj.total;
      
      const scheduledPickupTime = data.pickupDate && data.pickupTime 
        ? new Date(`${data.pickupDate}T${data.pickupTime}`).toISOString()
        : null;
      const scheduledDeliveryTime = data.deliveryDate && data.deliveryTime
        ? new Date(`${data.deliveryDate}T${data.deliveryTime}`).toISOString()
        : null;
      
      // Build multi-drop stops array if in multi-drop mode
      const validDrops = isMultiDropMode ? drops.filter(d => d.postcode.trim()) : [];
      const multiDropStops = validDrops.map((drop, index) => ({
        stopOrder: index + 1,
        postcode: drop.postcode,
        address: drop.address,
        recipientName: drop.recipientName,
        recipientPhone: drop.recipientPhone,
        instructions: drop.instructions,
      }));

      // For multi-drop, use the last drop as the delivery address
      const deliveryAddress = isMultiDropMode && validDrops.length > 0 
        ? validDrops[validDrops.length - 1].address || data.deliveryAddress
        : data.deliveryAddress;
      const deliveryPostcodeValue = isMultiDropMode && validDrops.length > 0
        ? validDrops[validDrops.length - 1].postcode
        : data.deliveryPostcode;
      const recipientNameValue = isMultiDropMode && validDrops.length > 0
        ? validDrops[validDrops.length - 1].recipientName || data.recipientName
        : data.recipientName;
      const recipientPhoneValue = isMultiDropMode && validDrops.length > 0
        ? validDrops[validDrops.length - 1].recipientPhone || data.recipientPhone
        : data.recipientPhone;
      
      const jobData = {
        ...data,
        customerId: 'admin-created',
        pickupContactName: data.senderName || null,
        pickupContactPhone: data.senderPhone || null,
        deliveryAddress,
        deliveryPostcode: deliveryPostcodeValue,
        recipientName: recipientNameValue,
        recipientPhone: recipientPhoneValue,
        distance: distance.toString(),
        basePrice: quote?.baseCharge.toString() || '0',
        distancePrice: quote?.distanceCharge.toString() || '0',
        weightSurcharge: quote?.weightSurcharge.toString() || '0',
        multiDropCharge: quote?.multiDropCharge?.toString() || '0',
        centralLondonCharge: quote?.congestionZoneCharge?.toString() || '0',
        returnTripCharge: quote?.returnTripCharge.toString() || '0',
        waitingTimeCharge: quote?.waitingTimeCharge?.toString() || '0',
        serviceType: selectedServiceType,
        serviceTypePercent: String(priceOverride !== null ? 0 : (serviceTypeAdj?.percent ?? 0)),
        serviceTypeAmount: String(priceOverride !== null ? 0 : (serviceTypeAdj?.amount ?? 0)),
        totalPrice: finalPrice.toString(),
        driverPrice: driverPrice !== null ? driverPrice.toString() : null,
        paymentStatus: 'pending',
        status: data.driverId ? 'assigned' : 'pending',
        scheduledPickupTime,
        scheduledDeliveryTime,
        isScheduled: !!scheduledPickupTime,
        isMultiDrop: isMultiDropMode && validDrops.length >= 1,
        multiDropStops: multiDropStops.length > 0 ? multiDropStops : undefined,
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
    // In multi-drop mode, use the multi-drop calculation
    if (isMultiDropMode) {
      await calculateMultiDropQuote();
      return;
    }
    
    const values = form.getValues();
    if (values.pickupPostcode && values.deliveryPostcode) {
      setIsCalculating(true);
      try {
        const distResult = await calculateDistanceFromPostcodes(values.pickupPostcode, values.deliveryPostcode);
        if (distResult) {
          setDistance(distResult.distance);
          
          // Use scheduled pickup time for rush hour calculation if available
          let scheduledTime: Date | undefined;
          if (values.pickupDate && values.pickupTime) {
            scheduledTime = new Date(`${values.pickupDate}T${values.pickupTime}`);
          }
          
          const quoteResult = calculateQuote(values.vehicleType as VehicleType, distResult.distance, values.weight || 1, {
            pickupPostcode: values.pickupPostcode,
            deliveryPostcode: values.deliveryPostcode,
            allDropPostcodes: [values.deliveryPostcode], // Single delivery for congestion check
            isReturnTrip: values.isReturnTrip || false,
            returnToSameLocation: values.isReturnTrip || false,
            scheduledTime,
            waitingTimeMinutes: values.waitingTime || 0,
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
    createJobMutation.mutate(data);
  };

  const serviceTypeAdj = quote ? applyServiceTypeAdjustment(quote.totalPrice, selectedServiceType) : null;

  const getFinalPrice = () => {
    if (priceOverride !== null) return priceOverride;
    return serviceTypeAdj ? serviceTypeAdj.total : (quote?.totalPrice || 0);
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
            {/* Customer Type Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCircle className="h-5 w-5 text-primary" />
                  Customer Type
                </CardTitle>
                <CardDescription>Select the type of customer for this job</CardDescription>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="customerType"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex gap-4">
                        <Button
                          type="button"
                          variant={field.value === 'individual' ? 'default' : 'outline'}
                          className="flex-1 h-16"
                          onClick={() => field.onChange('individual')}
                          data-testid="button-customer-individual"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <User className="h-5 w-5" />
                            <span>Individual</span>
                          </div>
                        </Button>
                        <Button
                          type="button"
                          variant={field.value === 'business' ? 'default' : 'outline'}
                          className="flex-1 h-16"
                          onClick={() => field.onChange('business')}
                          data-testid="button-customer-business"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <Building2 className="h-5 w-5" />
                            <span>Business</span>
                          </div>
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {form.watch('customerType') === 'business' && (
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <FormLabel>Company Name</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              {...field}
                              className="pl-10"
                              placeholder="Enter company name"
                              data-testid="input-company-name"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </CardContent>
            </Card>

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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="senderName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sender Name</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  className="pl-10"
                                  placeholder="Sender name"
                                  data-testid="input-sender-name"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="senderPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Sender Phone</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  className="pl-10"
                                  placeholder="07123456789"
                                  data-testid="input-sender-phone"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Delivery Details */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-red-500" />
                        Delivery Details
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="multi-drop-toggle" className="text-sm font-medium">
                          Multi-drop
                        </Label>
                        <Switch
                          id="multi-drop-toggle"
                          checked={isMultiDropMode}
                          onCheckedChange={(checked) => {
                            setIsMultiDropMode(checked);
                            form.setValue('isMultiDrop', checked);
                            setQuote(null);
                            setRouteLegs([]);
                            if (checked) {
                              // When enabling multi-drop, preserve existing delivery info as Drop 1
                              const existingPostcode = form.getValues('deliveryPostcode');
                              const existingAddress = form.getValues('deliveryAddress');
                              const existingRecipientName = form.getValues('recipientName');
                              const existingRecipientPhone = form.getValues('recipientPhone');
                              const existingInstructions = form.getValues('deliveryInstructions');
                              
                              if (drops.length === 0) {
                                // Create first drop with existing delivery data
                                setDrops([{
                                  id: String(Date.now()),
                                  postcode: existingPostcode || '',
                                  address: existingAddress || '',
                                  recipientName: existingRecipientName || '',
                                  recipientPhone: existingRecipientPhone || '',
                                  instructions: existingInstructions || '',
                                }]);
                              } else if (drops.length > 0 && !drops[0].postcode && existingPostcode) {
                                // Update first drop if it's empty but we have delivery data
                                setDrops(prev => prev.map((d, i) => i === 0 ? {
                                  ...d,
                                  postcode: existingPostcode || d.postcode,
                                  address: existingAddress || d.address,
                                  recipientName: existingRecipientName || d.recipientName,
                                  recipientPhone: existingRecipientPhone || d.recipientPhone,
                                  instructions: existingInstructions || d.instructions,
                                } : d));
                              }
                            }
                          }}
                          data-testid="switch-multi-drop"
                        />
                      </div>
                    </div>
                    {isMultiDropMode && (
                      <CardDescription>
                        Add multiple delivery stops. The route will be automatically optimized.
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Single Drop Mode */}
                    {!isMultiDropMode && (
                      <>
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
                                  <PhoneInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} name={field.name} data-testid="input-recipient-phone" />
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
                      </>
                    )}

                    {/* Multi-Drop Mode */}
                    {isMultiDropMode && (
                      <div className="space-y-4">
                        {drops.map((drop, index) => (
                          <div 
                            key={drop.id} 
                            className="p-4 border rounded-lg space-y-3 bg-muted/30"
                            data-testid={`drop-point-${index}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="h-6 w-6 rounded-full p-0 flex items-center justify-center">
                                  {index + 1}
                                </Badge>
                                <span className="font-medium text-sm">Drop {index + 1}</span>
                              </div>
                              {drops.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeDrop(drop.id)}
                                  data-testid={`button-remove-drop-${index}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label className="text-sm">Postcode *</Label>
                                <PostcodeAutocomplete
                                  value={drop.postcode}
                                  onChange={(postcode, address) => {
                                    updateDrop(drop.id, 'postcode', postcode);
                                    if (address) {
                                      updateDrop(drop.id, 'address', address);
                                    }
                                  }}
                                  placeholder="Enter postcode"
                                  data-testid={`input-drop-postcode-${index}`}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm">Address</Label>
                                <Input
                                  value={drop.address}
                                  onChange={(e) => updateDrop(drop.id, 'address', e.target.value)}
                                  placeholder="Full address"
                                  data-testid={`input-drop-address-${index}`}
                                />
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label className="text-sm">Recipient Name</Label>
                                <Input
                                  value={drop.recipientName}
                                  onChange={(e) => updateDrop(drop.id, 'recipientName', e.target.value)}
                                  placeholder="Recipient name"
                                  data-testid={`input-drop-recipient-${index}`}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm">Recipient Phone</Label>
                                <Input
                                  value={drop.recipientPhone}
                                  onChange={(e) => updateDrop(drop.id, 'recipientPhone', e.target.value)}
                                  placeholder="07123456789"
                                  data-testid={`input-drop-phone-${index}`}
                                />
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <Label className="text-sm">Instructions</Label>
                              <Input
                                value={drop.instructions}
                                onChange={(e) => updateDrop(drop.id, 'instructions', e.target.value)}
                                placeholder="Delivery instructions"
                                data-testid={`input-drop-instructions-${index}`}
                              />
                            </div>
                          </div>
                        ))}
                        
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addDrop}
                          className="w-full"
                          data-testid="button-add-drop"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Another Drop
                        </Button>

                        {/* Route Preview */}
                        {routeLegs.length > 0 && (
                          <div className="mt-4 p-3 bg-muted rounded-lg">
                            <Label className="text-sm font-medium mb-2 block">Optimized Route</Label>
                            <div className="space-y-2">
                              {routeLegs.map((leg, index) => (
                                <div key={index} className="flex items-center gap-2 text-sm">
                                  <Badge variant="secondary" className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                                    {index + 1}
                                  </Badge>
                                  <span className="text-muted-foreground truncate max-w-[120px]">{leg.from}</span>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  <span className="truncate max-w-[120px]">{leg.to}</span>
                                  <span className="text-muted-foreground ml-auto">({leg.distance.toFixed(1)} mi)</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    )}
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
                        name="waitingTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Waiting Time (minutes)</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  {...field}
                                  type="number"
                                  step="1"
                                  min="0"
                                  className="pl-10"
                                  placeholder="0"
                                  data-testid="input-waiting-time"
                                />
                              </div>
                            </FormControl>
                            <FormDescription>
                              First 10 mins free, then £0.50/min
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              {/* Right Column - Map, Quote & Driver Assignment */}
              <div className="space-y-6">
                {/* Route Map */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2">
                      <Route className="h-5 w-5 text-blue-500" />
                      Route Map
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Route is automatically optimized for efficiency</p>
                  </CardHeader>
                  <CardContent>
                    <div 
                      className="w-full h-[380px] rounded-lg bg-muted overflow-hidden"
                      data-testid="route-map-container"
                    >
                      <RouteMapPreview
                        pickupPostcode={pickupPostcode}
                        deliveryPostcode={deliveryPostcode}
                        drops={drops}
                        isMultiDrop={isMultiDropMode}
                      />
                    </div>
                  </CardContent>
                </Card>
                
                {/* Quote Summary */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-primary" />
                        Quote Summary
                      </CardTitle>
                      {/* Only show refresh button when quote exists */}
                      {quote && (
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
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Service Level Selector - always visible */}
                    <div>
                      <p className="text-sm font-medium mb-2">Service Level</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.entries(SERVICE_TYPE_CONFIG) as [ServiceType, typeof SERVICE_TYPE_CONFIG[ServiceType]][]).map(([key, cfg]) => (
                          <button
                            key={key}
                            type="button"
                            data-testid={`button-service-type-${key}`}
                            onClick={() => {
                              setSelectedServiceType(key);
                              setPriceOverride(null);
                            }}
                            className={`rounded-md border p-2.5 text-left transition-colors ${
                              selectedServiceType === key
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border bg-background hover-elevate'
                            }`}
                          >
                            <div className="text-xs font-semibold">{cfg.label}</div>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">{SERVICE_TYPE_CONFIG[selectedServiceType].description}</p>
                    </div>

                    <Separator />

                    {/* Calculate Quote Button - shown when no quote */}
                    {!quote && !isCalculating && (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Fill in the pickup and delivery details, then click below to calculate the quote.
                        </p>
                        <Button
                          type="button"
                          variant="default"
                          onClick={handleRecalculate}
                          disabled={isCalculating}
                          className="w-full"
                          data-testid="button-calculate-quote"
                        >
                          <Calculator className="h-4 w-4 mr-2" />
                          Calculate Quote
                        </Button>
                      </div>
                    )}
                    
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
                            <span className="text-muted-foreground">
                              Distance Charge ({distance.toFixed(1)} mi × £{quote.rushHourApplied ? '1.50' : (vehicleType === 'motorbike' ? '1.30' : vehicleType === 'car' ? '1.20' : vehicleType === 'small_van' ? '1.30' : '1.40')}/mi)
                            </span>
                            <span data-testid="text-distance-charge">{formatPrice(quote.distanceCharge)}</span>
                          </div>
                          {quote.weightSurcharge > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Weight Surcharge</span>
                              <span data-testid="text-weight-surcharge">{formatPrice(quote.weightSurcharge)}</span>
                            </div>
                          )}
                          {quote.congestionZoneCharge > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Congestion Zone</span>
                              <span data-testid="text-congestion-charge">{formatPrice(quote.congestionZoneCharge)}</span>
                            </div>
                          )}
                          {quote.returnTripCharge > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Return Trip</span>
                              <span data-testid="text-return-charge">{formatPrice(quote.returnTripCharge)}</span>
                            </div>
                          )}
                          {quote.waitingTimeCharge > 0 && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">
                                Waiting Time ({quote.waitingTimeMinutes} mins)
                              </span>
                              <span data-testid="text-waiting-time-charge">{formatPrice(quote.waitingTimeCharge)}</span>
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
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-muted-foreground">Base Quote</span>
                              <span data-testid="text-calculated-total">{formatPrice(quote.totalPrice)}</span>
                            </div>
                            {serviceTypeAdj && serviceTypeAdj.amount > 0 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">{SERVICE_TYPE_CONFIG[selectedServiceType].label} surcharge (+{serviceTypeAdj.percent}%)</span>
                                <span>+{formatPrice(serviceTypeAdj.amount)}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex justify-between items-center font-semibold">
                            <span>Calculated Total</span>
                            <span className="text-lg">
                              {formatPrice(serviceTypeAdj ? serviceTypeAdj.total : quote.totalPrice)}
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
                                  value={priceOverride !== null ? priceOverride : (serviceTypeAdj ? serviceTypeAdj.total : quote.totalPrice)}
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
                                {priceOverride !== null && priceOverride !== (serviceTypeAdj ? serviceTypeAdj.total : quote.totalPrice) && (
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
                                    {driver.driverCode && (
                                      <Badge variant="secondary" className="text-xs font-mono">
                                        {driver.driverCode}
                                      </Badge>
                                    )}
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
                              ? 'No drivers found'
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
