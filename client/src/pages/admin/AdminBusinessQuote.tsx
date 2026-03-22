import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  MapPin,
  Plus,
  Trash2,
  Calculator,
  Mail,
  Truck,
  Package,
  Loader2,
  CheckCircle,
  Building,
} from 'lucide-react';
import { geocodePostcode, calculateDistance } from '@/lib/maps';
import { calculateQuote, formatPrice, isCentralLondon, type QuoteBreakdown, SERVICE_TYPE_CONFIG, applyServiceTypeAdjustment, type ServiceType } from '@/lib/pricing';
import { PostcodeAutocomplete } from '@/components/PostcodeAutocomplete';
import { RouteMapPreview } from '@/components/RouteMapPreview';
import { Route } from 'lucide-react';
import type { VehicleType } from '@shared/schema';

interface DropPoint {
  id: string;
  postcode: string;
  address: string;
}

interface QuoteResult {
  breakdown: QuoteBreakdown;
  legs: {
    from: string;
    to: string;
    distance: number;
    duration: number;
  }[];
  totalDistance: number;
  totalDuration: number;
  routeMapUrl?: string;
}

export default function AdminBusinessQuote() {
  const { toast } = useToast();
  const [pickupPostcode, setPickupPostcode] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [drops, setDrops] = useState<DropPoint[]>([
    { id: '1', postcode: '', address: '' }
  ]);
  const [vehicleType, setVehicleType] = useState<VehicleType | ''>('');
  const [weight, setWeight] = useState('10');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  const [selectedServiceType, setSelectedServiceType] = useState<ServiceType>('flexible');

  const serviceTypeAdj = quoteResult ? applyServiceTypeAdjustment(quoteResult.breakdown.totalPrice, selectedServiceType) : null;
  const finalQuoteTotal = serviceTypeAdj ? serviceTypeAdj.total : (quoteResult?.breakdown.totalPrice || 0);

  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [notes, setNotes] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [quoteSent, setQuoteSent] = useState(false);

  const addDrop = () => {
    setDrops([...drops, { id: String(Date.now()), postcode: '', address: '' }]);
  };

  const removeDrop = (id: string) => {
    if (drops.length > 1) {
      setDrops(drops.filter(d => d.id !== id));
    }
  };

  const updateDrop = (id: string, postcode: string, address?: string) => {
    setDrops(drops.map(d => d.id === id ? { ...d, postcode, address: address || '' } : d));
  };

  const calculateQuoteHandler = async () => {
    if (!pickupPostcode.trim()) {
      toast({ title: 'Please enter a pickup postcode', variant: 'destructive' });
      return;
    }

    const validDrops = drops.filter(d => d.postcode.trim());
    if (validDrops.length === 0) {
      toast({ title: 'Please enter at least one delivery postcode', variant: 'destructive' });
      return;
    }

    if (!vehicleType) {
      toast({ title: 'Please select a vehicle type', variant: 'destructive' });
      return;
    }

    setIsCalculating(true);
    setQuoteResult(null);

    try {
      // Get pickup address first
      const pickupGeo = await geocodePostcode(pickupPostcode);
      if (!pickupGeo) {
        toast({ title: 'Invalid pickup postcode', variant: 'destructive' });
        setIsCalculating(false);
        return;
      }
      setPickupAddress(pickupGeo.formattedAddress);

      // For single drop, use simple distance calculation
      if (validDrops.length === 1) {
        const dropGeo = await geocodePostcode(validDrops[0].postcode);
        if (!dropGeo) {
          toast({ title: `Invalid postcode: ${validDrops[0].postcode}`, variant: 'destructive' });
          setIsCalculating(false);
          return;
        }

        const distResult = await calculateDistance(
          { lat: pickupGeo.lat, lng: pickupGeo.lng },
          { lat: dropGeo.lat, lng: dropGeo.lng }
        );
        if (!distResult) {
          toast({ title: 'Could not calculate distance', variant: 'destructive' });
          setIsCalculating(false);
          return;
        }

        setDrops(prev => prev.map(d => 
          d.id === validDrops[0].id ? { ...d, address: dropGeo.formattedAddress } : d
        ));

        // Create scheduled time from date and time for rush hour calculation
        const scheduledTime = pickupDate && pickupTime 
          ? new Date(`${pickupDate}T${pickupTime}`) 
          : new Date();
        
        const breakdown = calculateQuote(
          vehicleType,
          distResult.distance,
          parseFloat(weight) || 0,
          {
            pickupPostcode,
            deliveryPostcode: validDrops[0].postcode,
            allDropPostcodes: [validDrops[0].postcode], // Single drop for congestion check
            isMultiDrop: false,
            multiDropCount: 0,
            multiDropDistances: [],
            scheduledTime, // Apply rush hour pricing if applicable
          }
        );

        // Generate route map
        let routeMapUrl: string | undefined;
        try {
          const mapResponse = await fetch(`/api/maps/route-image?waypoints=${encodeURIComponent(pickupPostcode + '|' + validDrops[0].postcode)}&size=600x300`);
          if (mapResponse.ok) {
            const mapData = await mapResponse.json();
            routeMapUrl = mapData.url;
          }
        } catch (mapError) {
          console.error('Failed to generate route map:', mapError);
        }

        setQuoteResult({
          breakdown,
          legs: [{
            from: pickupGeo.formattedAddress,
            to: dropGeo.formattedAddress,
            distance: distResult.distance,
            duration: distResult.duration,
          }],
          totalDistance: distResult.distance,
          totalDuration: distResult.duration,
          routeMapUrl,
        });

        toast({ title: 'Quote calculated successfully' });
        setIsCalculating(false);
        return;
      }

      // For multi-drop, use Google Directions API with route optimization
      // This ensures the same quote regardless of input order - system finds optimal route
      const dropPostcodes = validDrops.map(d => d.postcode).join('|');
      
      const routeResponse = await fetch(
        `/api/maps/optimized-route?origin=${encodeURIComponent(pickupPostcode)}&drops=${encodeURIComponent(dropPostcodes)}`
      );

      if (!routeResponse.ok) {
        const errorData = await routeResponse.json();
        toast({ title: errorData.error || 'Could not calculate optimized route', variant: 'destructive' });
        setIsCalculating(false);
        return;
      }

      const routeData = await routeResponse.json();
      const { legs, optimizedOrder, totalDistance, totalDuration, routeMapUrl } = routeData;

      // Validate response has legs
      if (!legs || legs.length === 0) {
        toast({ title: 'Could not calculate route - no valid legs returned', variant: 'destructive' });
        setIsCalculating(false);
        return;
      }

      // Validate optimizedOrder matches number of drops
      if (!optimizedOrder || optimizedOrder.length !== validDrops.length) {
        toast({ title: 'Route optimization failed - please check postcodes', variant: 'destructive' });
        setIsCalculating(false);
        return;
      }

      // Reorder drops based on optimized route
      const reorderedDrops = optimizedOrder.map((idx: number) => validDrops[idx]);

      // Update drops with addresses from the API response
      const updatedDrops = reorderedDrops.map((drop: DropPoint, i: number) => ({
        ...drop,
        address: legs[i]?.to || drop.address,
      }));

      // Replace drops with reordered drops (nearest first, furthest last)
      setDrops(updatedDrops);

      // Calculate pricing based on optimized route
      // First leg is pickup to first optimized drop, remaining are multi-drop distances
      const multiDropDistances = legs.slice(1).map((leg: { distance: number }) => leg.distance);
      
      // Get all drop postcodes for congestion zone check (£18 applied ONCE if any postcode is in zone)
      const allDropPostcodes = reorderedDrops.map((drop: DropPoint) => drop.postcode);
      
      // Create scheduled time from date and time for rush hour calculation
      const scheduledTime = pickupDate && pickupTime 
        ? new Date(`${pickupDate}T${pickupTime}`) 
        : new Date();
      
      const breakdown = calculateQuote(
        vehicleType,
        legs[0]?.distance || 0,
        parseFloat(weight) || 0,
        {
          pickupPostcode,
          deliveryPostcode: reorderedDrops[0]?.postcode || '',
          isMultiDrop: true,
          multiDropCount: reorderedDrops.length - 1,
          multiDropDistances,
          allDropPostcodes, // Pass all postcodes for single congestion charge
          scheduledTime, // Apply rush hour pricing if applicable
        }
      );

      setQuoteResult({
        breakdown,
        legs: legs.map((leg: { from: string; to: string; distance: number; duration: number }) => ({
          from: leg.from,
          to: leg.to,
          distance: parseFloat(leg.distance.toFixed(1)),
          duration: leg.duration,
        })),
        totalDistance,
        totalDuration,
        routeMapUrl,
      });

      toast({ title: 'Quote calculated with optimized route' });
    } catch (error) {
      console.error('Quote calculation error:', error);
      toast({ title: 'Error calculating quote', variant: 'destructive' });
    } finally {
      setIsCalculating(false);
    }
  };

  const sendQuoteEmail = async () => {
    if (!customerEmail.trim()) {
      toast({ title: 'Please enter customer email', variant: 'destructive' });
      return;
    }
    if (!quoteResult) {
      toast({ title: 'Please calculate a quote first', variant: 'destructive' });
      return;
    }

    setIsSending(true);

    try {
      // Get auth token for authenticated request
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/send-business-quote', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          customerEmail,
          customerName,
          companyName,
          pickupPostcode,
          pickupAddress,
          pickupDate,
          pickupTime,
          drops: drops.filter(d => d.postcode.trim()).map(d => ({
            postcode: d.postcode,
            address: d.address,
          })),
          vehicleType,
          weight: parseFloat(weight),
          quote: quoteResult,
          notes,
          serviceType: selectedServiceType,
          serviceTypePercent: serviceTypeAdj?.percent ?? 0,
          serviceTypeAmount: serviceTypeAdj?.amount ?? 0,
          finalTotal: finalQuoteTotal,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send quote');
      }

      setQuoteSent(true);
      toast({ title: 'Quote sent successfully', description: `Email sent to ${customerEmail}` });
    } catch (error) {
      console.error('Send quote error:', error);
      toast({ title: 'Failed to send quote email', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const resetForm = () => {
    setPickupPostcode('');
    setPickupAddress('');
    setDrops([{ id: '1', postcode: '', address: '' }]);
    setWeight('10');
    setPickupDate('');
    setPickupTime('');
    setQuoteResult(null);
    setCustomerEmail('');
    setCustomerName('');
    setCompanyName('');
    setNotes('');
    setQuoteSent(false);
  };

  const vehicleOptions = [
    { value: 'motorbike', label: 'Motorbike (up to 5kg)' },
    { value: 'car', label: 'Car (up to 50kg)' },
    { value: 'small_van', label: 'Small Van (up to 400kg)' },
    { value: 'medium_van', label: 'Medium Van (up to 750kg)' },
    { value: 'lwb_van', label: 'LWB Van (up to 1000kg)' },
    { value: 'luton_van', label: 'Luton Van (up to 1200kg)' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Business Multi-Drop Quote</h1>
            <p className="text-muted-foreground">Calculate and send quotes for business customers</p>
          </div>
          {quoteResult && (
            <Button variant="outline" onClick={resetForm} data-testid="button-reset-form">
              New Quote
            </Button>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Route Details
                </CardTitle>
                <CardDescription>Enter postcodes for pickup and all delivery points</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pickup-postcode">Pickup Postcode</Label>
                  <div className="flex gap-2 items-start">
                    <div className="flex-1">
                      <PostcodeAutocomplete
                        value={pickupPostcode}
                        onChange={(postcode, fullAddress) => {
                          setPickupPostcode(postcode.toUpperCase());
                          if (fullAddress) {
                            setPickupAddress(fullAddress);
                          }
                        }}
                        placeholder="Enter pickup postcode or address"
                        data-testid="input-pickup-postcode"
                      />
                    </div>
                    {isCentralLondon(pickupPostcode) && (
                      <Badge variant="secondary" className="shrink-0 mt-2">Central London</Badge>
                    )}
                  </div>
                  {pickupAddress && (
                    <p className="text-sm text-muted-foreground">{pickupAddress}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <Label>Delivery Points</Label>
                  {drops.map((drop, index) => (
                    <div key={drop.id} className="space-y-1">
                      <div className="flex gap-2 items-center">
                        <Badge variant="outline" className="shrink-0 mt-2">
                          {index + 1}
                        </Badge>
                        <div className="flex-1">
                          <PostcodeAutocomplete
                            value={drop.postcode}
                            onChange={(postcode, fullAddress) => {
                              updateDrop(drop.id, postcode.toUpperCase(), fullAddress);
                            }}
                            placeholder={`Delivery ${index + 1} postcode or address`}
                            data-testid={`input-drop-postcode-${index}`}
                          />
                        </div>
                        {drops.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeDrop(drop.id)}
                            className="mt-1"
                            data-testid={`button-remove-drop-${index}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                      {drop.address && (
                        <p className="text-sm text-muted-foreground pl-10">{drop.address}</p>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addDrop}
                    className="w-full"
                    data-testid="button-add-drop"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Another Drop
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  Vehicle & Load
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Vehicle Type</Label>
                  <Select value={vehicleType} onValueChange={(v) => setVehicleType(v as VehicleType)}>
                    <SelectTrigger data-testid="select-vehicle-type">
                      <SelectValue placeholder="Select vehicle type" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicleOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weight">Estimated Weight (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    min="0"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    data-testid="input-weight"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="pickup-date">Pickup Date</Label>
                    <Input
                      id="pickup-date"
                      type="date"
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      data-testid="input-pickup-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pickup-time">Pickup Time</Label>
                    <Input
                      id="pickup-time"
                      type="time"
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      data-testid="input-pickup-time"
                    />
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={calculateQuoteHandler}
                  disabled={isCalculating}
                  data-testid="button-calculate-quote"
                >
                  {isCalculating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Calculating...
                    </>
                  ) : (
                    <>
                      <Calculator className="h-4 w-4 mr-2" />
                      Calculate Quote
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Route Map - shows in real-time as postcodes are entered */}
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
                    drops={drops}
                    isMultiDrop={true}
                  />
                </div>
              </CardContent>
            </Card>

            {quoteResult && (
              <>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Quote Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {quoteResult.legs.map((leg, index) => {
                        const fromPostcode = index === 0 ? pickupPostcode : drops[index - 1]?.postcode || '';
                        const toPostcode = drops[index]?.postcode || '';
                        return (
                          <div key={index} className="p-3 bg-muted rounded space-y-1">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{index + 1}</Badge>
                                <span className="font-medium">
                                  {fromPostcode} → {toPostcode}
                                </span>
                              </div>
                              <span className="font-medium">{leg.distance} miles</span>
                            </div>
                            <div className="text-xs text-muted-foreground pl-8">
                              {leg.from} → {leg.to}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="border-t pt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Base Charge</span>
                        <span>{formatPrice(quoteResult.breakdown.baseCharge)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Distance ({quoteResult.breakdown.distance.toFixed(1)} miles)</span>
                        <span>{formatPrice(quoteResult.breakdown.distanceCharge)}</span>
                      </div>
                      {quoteResult.breakdown.multiDropDistanceCharge > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>Multi-Drop Distance</span>
                          <span>{formatPrice(quoteResult.breakdown.multiDropDistanceCharge)}</span>
                        </div>
                      )}
                      {quoteResult.breakdown.weightSurcharge > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>Weight Surcharge</span>
                          <span>{formatPrice(quoteResult.breakdown.weightSurcharge)}</span>
                        </div>
                      )}
                      {quoteResult.breakdown.congestionZoneCharge > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>Congestion Zone Charge</span>
                          <span>{formatPrice(quoteResult.breakdown.congestionZoneCharge)}</span>
                        </div>
                      )}
                      {quoteResult.breakdown.rushHourApplied && (
                        <div className="flex justify-between text-sm text-orange-600">
                          <span>Rush Hour Rate Applied</span>
                          <span>Yes</span>
                        </div>
                      )}
                    </div>

                    {/* Service Level Selector */}
                    <div className="border-t pt-4 space-y-2">
                      <p className="text-sm font-medium">Service Level</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.entries(SERVICE_TYPE_CONFIG) as [ServiceType, typeof SERVICE_TYPE_CONFIG[ServiceType]][]).map(([key, cfg]) => (
                          <button
                            key={key}
                            type="button"
                            data-testid={`button-service-type-${key}`}
                            onClick={() => setSelectedServiceType(key)}
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
                      <p className="text-xs text-muted-foreground">{SERVICE_TYPE_CONFIG[selectedServiceType].description}</p>
                    </div>

                    <div className="border-t pt-4 space-y-1">
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Base Quote</span>
                        <span>{formatPrice(quoteResult.breakdown.totalPrice)}</span>
                      </div>
                      {serviceTypeAdj && serviceTypeAdj.amount > 0 && (
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>{SERVICE_TYPE_CONFIG[selectedServiceType].label} surcharge (+{serviceTypeAdj.percent}%)</span>
                          <span>+{formatPrice(serviceTypeAdj.amount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-lg pt-1">
                        <span>Total</span>
                        <span className="text-primary">{formatPrice(finalQuoteTotal)}</span>
                      </div>
                    </div>

                    <div className="bg-muted p-3 rounded text-sm">
                      <div className="flex justify-between">
                        <span>Total Distance:</span>
                        <span className="font-medium">{quoteResult.totalDistance.toFixed(1)} miles</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Estimated Duration:</span>
                        <span className="font-medium">{quoteResult.totalDuration} mins</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Number of Drops:</span>
                        <span className="font-medium">{quoteResult.legs.length}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Send Quote
                    </CardTitle>
                    <CardDescription>Email this quote to your customer</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {quoteSent ? (
                      <div className="text-center py-6">
                        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                        <h3 className="font-medium text-lg">Quote Sent!</h3>
                        <p className="text-muted-foreground">
                          The quote has been emailed to {customerEmail}
                        </p>
                        <Button
                          variant="outline"
                          className="mt-4"
                          onClick={resetForm}
                          data-testid="button-create-new-quote"
                        >
                          Create New Quote
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="customer-name">Customer Name</Label>
                            <Input
                              id="customer-name"
                              placeholder="John Smith"
                              value={customerName}
                              onChange={(e) => setCustomerName(e.target.value)}
                              data-testid="input-customer-name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="company-name">Company Name</Label>
                            <div className="relative">
                              <Building className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                              <Input
                                id="company-name"
                                placeholder="Company Ltd"
                                value={companyName}
                                onChange={(e) => setCompanyName(e.target.value)}
                                className="pl-9"
                                data-testid="input-company-name"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="customer-email">Customer Email *</Label>
                          <Input
                            id="customer-email"
                            type="email"
                            placeholder="customer@company.com"
                            value={customerEmail}
                            onChange={(e) => setCustomerEmail(e.target.value)}
                            data-testid="input-customer-email"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="notes">Additional Notes</Label>
                          <Textarea
                            id="notes"
                            placeholder="Any special requirements or notes for the customer..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            data-testid="input-notes"
                          />
                        </div>

                        <Button
                          className="w-full"
                          onClick={sendQuoteEmail}
                          disabled={isSending || !customerEmail.trim()}
                          data-testid="button-send-quote"
                        >
                          {isSending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Mail className="h-4 w-4 mr-2" />
                              Send Quote Email
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {!quoteResult && (
              <Card className="h-full flex items-center justify-center min-h-[300px]">
                <CardContent className="text-center py-12">
                  <Calculator className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium text-lg mb-2">Enter Route Details</h3>
                  <p className="text-muted-foreground max-w-sm">
                    Add pickup and delivery postcodes, then click Calculate Quote to see pricing
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
