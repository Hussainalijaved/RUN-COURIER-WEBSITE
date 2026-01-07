import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { calculateQuote, formatPrice, isCentralLondon, type QuoteBreakdown } from '@/lib/pricing';
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
}

export default function AdminBusinessQuote() {
  const { toast } = useToast();
  const [pickupPostcode, setPickupPostcode] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [drops, setDrops] = useState<DropPoint[]>([
    { id: '1', postcode: '', address: '' }
  ]);
  const [vehicleType, setVehicleType] = useState<VehicleType>('small_van');
  const [weight, setWeight] = useState('10');
  const [isCalculating, setIsCalculating] = useState(false);
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);
  
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

  const updateDrop = (id: string, postcode: string) => {
    setDrops(drops.map(d => d.id === id ? { ...d, postcode, address: '' } : d));
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

    setIsCalculating(true);
    setQuoteResult(null);

    try {
      const pickupGeo = await geocodePostcode(pickupPostcode);
      if (!pickupGeo) {
        toast({ title: 'Invalid pickup postcode', variant: 'destructive' });
        setIsCalculating(false);
        return;
      }
      setPickupAddress(pickupGeo.formattedAddress);

      const legs: QuoteResult['legs'] = [];
      const dropAddresses: string[] = [];
      const multiDropDistances: number[] = [];
      let currentLocation = { lat: pickupGeo.lat, lng: pickupGeo.lng };
      let currentAddress = pickupGeo.formattedAddress;
      let totalDistance = 0;
      let totalDuration = 0;

      for (let i = 0; i < validDrops.length; i++) {
        const dropGeo = await geocodePostcode(validDrops[i].postcode);
        if (!dropGeo) {
          toast({ title: `Invalid postcode: ${validDrops[i].postcode}`, variant: 'destructive' });
          setIsCalculating(false);
          return;
        }

        const distResult = await calculateDistance(currentLocation, { lat: dropGeo.lat, lng: dropGeo.lng });
        if (!distResult) {
          toast({ title: 'Could not calculate distance', variant: 'destructive' });
          setIsCalculating(false);
          return;
        }

        legs.push({
          from: currentAddress,
          to: dropGeo.formattedAddress,
          distance: distResult.distance,
          duration: distResult.duration,
        });

        dropAddresses.push(dropGeo.formattedAddress);
        
        if (i === 0) {
          totalDistance += distResult.distance;
          totalDuration += distResult.duration;
        } else {
          multiDropDistances.push(distResult.distance);
          totalDistance += distResult.distance;
          totalDuration += distResult.duration;
        }

        currentLocation = { lat: dropGeo.lat, lng: dropGeo.lng };
        currentAddress = dropGeo.formattedAddress;

        setDrops(prev => prev.map(d => 
          d.id === validDrops[i].id ? { ...d, address: dropGeo.formattedAddress } : d
        ));
      }

      const breakdown = calculateQuote(
        vehicleType,
        legs[0]?.distance || 0,
        parseFloat(weight) || 0,
        {
          pickupPostcode,
          deliveryPostcode: validDrops[0]?.postcode || '',
          isMultiDrop: validDrops.length > 1,
          multiDropCount: validDrops.length - 1,
          multiDropDistances,
        }
      );

      setQuoteResult({
        breakdown,
        legs,
        totalDistance,
        totalDuration,
      });

      toast({ title: 'Quote calculated successfully' });
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
      const response = await fetch('/api/send-business-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail,
          customerName,
          companyName,
          pickupPostcode,
          pickupAddress,
          drops: drops.filter(d => d.postcode.trim()).map(d => ({
            postcode: d.postcode,
            address: d.address,
          })),
          vehicleType,
          weight: parseFloat(weight),
          quote: quoteResult,
          notes,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send quote');
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
                  <div className="flex gap-2">
                    <Input
                      id="pickup-postcode"
                      placeholder="e.g., SW1A 1AA"
                      value={pickupPostcode}
                      onChange={(e) => setPickupPostcode(e.target.value.toUpperCase())}
                      className="uppercase"
                      data-testid="input-pickup-postcode"
                    />
                    {isCentralLondon(pickupPostcode) && (
                      <Badge variant="secondary">Central London</Badge>
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
                        <Badge variant="outline" className="shrink-0">
                          {index + 1}
                        </Badge>
                        <Input
                          placeholder={`Delivery ${index + 1} postcode`}
                          value={drop.postcode}
                          onChange={(e) => updateDrop(drop.id, e.target.value.toUpperCase())}
                          className="uppercase"
                          data-testid={`input-drop-postcode-${index}`}
                        />
                        {drops.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeDrop(drop.id)}
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
                      <SelectValue />
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
                      {quoteResult.legs.map((leg, index) => (
                        <div key={index} className="flex justify-between items-center text-sm p-2 bg-muted rounded">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{index + 1}</Badge>
                            <span className="truncate max-w-[200px]">
                              {leg.from.split(',')[0]} → {leg.to.split(',')[0]}
                            </span>
                          </div>
                          <span className="font-medium">{leg.distance} miles</span>
                        </div>
                      ))}
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
                      {quoteResult.breakdown.centralLondonCharge > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>Central London Surcharge</span>
                          <span>{formatPrice(quoteResult.breakdown.centralLondonCharge)}</span>
                        </div>
                      )}
                      {quoteResult.breakdown.rushHourApplied && (
                        <div className="flex justify-between text-sm text-orange-600">
                          <span>Rush Hour Rate Applied</span>
                          <span>Yes</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-lg border-t pt-2">
                        <span>Total</span>
                        <span className="text-primary">{formatPrice(quoteResult.breakdown.totalPrice)}</span>
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
