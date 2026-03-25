import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Bike, Car, Truck, Package, Save, Clock, MapPin, Weight, Layers, RotateCcw, Loader2, Gauge } from 'lucide-react';
import { defaultPricingConfig, clearPricingCache, type PricingConfig } from '@/lib/pricing';
import { apiRequest, queryClient } from '@/lib/queryClient';
import type { PricingSettings, Vehicle, VehicleType } from '@shared/schema';

const SERVICE_TYPE_LABELS: Record<string, string> = {
  flexible: 'Flexible',
  urgent: 'Urgent',
};

export default function AdminPricing() {
  const { toast } = useToast();
  const [config, setConfig] = useState<PricingConfig>(defaultPricingConfig);
  const [serviceTypePricing, setServiceTypePricing] = useState<Record<string, number>>({
    flexible: 0,
    urgent: 15,
  });

  // Fetch pricing settings from API
  const { data: pricingSettings, isLoading: pricingLoading } = useQuery<PricingSettings>({
    queryKey: ['/api/pricing'],
  });

  // Fetch vehicles from API
  const { data: vehicles, isLoading: vehiclesLoading } = useQuery<Vehicle[]>({
    queryKey: ['/api/vehicles'],
  });

  // Update local config when API data loads
  useEffect(() => {
    if (pricingSettings && vehicles) {
      // Convert API data to PricingConfig format
      const vehiclesMap: PricingConfig['vehicles'] = { ...defaultPricingConfig.vehicles };
      
      vehicles.forEach((v) => {
        const type = v.type as VehicleType;
        if (vehiclesMap[type]) {
          vehiclesMap[type] = {
            name: v.name,
            baseCharge: parseFloat(v.baseCharge) || vehiclesMap[type].baseCharge,
            perMileRate: parseFloat(v.perMileRate) || vehiclesMap[type].perMileRate,
            rushHourRate: parseFloat(v.rushHourRate || '0') || vehiclesMap[type].rushHourRate,
            maxWeight: v.maxWeight || vehiclesMap[type].maxWeight,
          };
        }
      });

      // Convert weight surcharges from Record to array format
      const weightSurcharges: PricingConfig['weightSurcharges'] = [];
      if (pricingSettings.weightSurcharges) {
        const surcharges = pricingSettings.weightSurcharges as Record<string, number>;
        Object.entries(surcharges).forEach(([range, charge]) => {
          if (range.includes('+')) {
            const min = parseInt(range.replace('+', ''));
            weightSurcharges.push({ min, max: null, charge });
          } else if (range.includes('-')) {
            const [minStr, maxStr] = range.split('-');
            weightSurcharges.push({ min: parseInt(minStr), max: parseInt(maxStr), charge });
          }
        });
        // Sort by min weight
        weightSurcharges.sort((a, b) => a.min - b.min);
      }

      // Convert rush hour settings to periods array
      const rushHourPeriods = [
        { start: pricingSettings.rushHourStart || '07:00', end: pricingSettings.rushHourEnd || '09:00' },
        { start: pricingSettings.rushHourStartEvening || '17:00', end: pricingSettings.rushHourEndEvening || '19:00' },
      ];

      setConfig({
        vehicles: vehiclesMap,
        weightSurcharges: weightSurcharges.length > 0 ? weightSurcharges : defaultPricingConfig.weightSurcharges,
        centralLondonSurcharge: parseFloat(pricingSettings.centralLondonSurcharge || '18.15'),
        multiDropCharge: parseFloat(pricingSettings.multiDropCharge || '5'),
        returnTripMultiplier: parseFloat(pricingSettings.returnTripMultiplier || '0.60'),
        waitingTimeFreeMinutes: pricingSettings.waitingTimeFreeMinutes || 10,
        waitingTimePerMinute: parseFloat(pricingSettings.waitingTimePerMinute || '0.50'),
        rushHourPeriods,
      });

      if (pricingSettings.serviceTypePricing) {
        const stp = pricingSettings.serviceTypePricing as Record<string, number>;
        setServiceTypePricing({
          flexible: stp.flexible ?? 0,
          urgent: stp.urgent ?? 15,
        });
      }
    }
  }, [pricingSettings, vehicles]);

  // Mutation for saving pricing settings
  const pricingMutation = useMutation({
    mutationFn: async (data: Partial<PricingSettings>) => {
      return apiRequest('PATCH', '/api/pricing', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pricing'] });
    },
  });

  // Mutation for saving vehicle pricing
  const vehicleMutation = useMutation({
    mutationFn: async ({ type, data }: { type: VehicleType; data: Partial<Vehicle> }) => {
      return apiRequest('PATCH', `/api/vehicles/${type}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });
    },
  });

  const handleSave = async () => {
    try {
      // Convert weight surcharges back to Record format
      const weightSurcharges: Record<string, number> = {};
      config.weightSurcharges.forEach((s) => {
        const key = s.max === null ? `${s.min}+` : `${s.min}-${s.max}`;
        weightSurcharges[key] = s.charge;
      });

      // Get rush hour periods safely with defaults
      const morningPeriod = config.rushHourPeriods[0] || { start: '07:00', end: '09:00' };
      const eveningPeriod = config.rushHourPeriods[1] || { start: '17:00', end: '19:00' };

      // Save pricing settings
      await pricingMutation.mutateAsync({
        centralLondonSurcharge: config.centralLondonSurcharge.toString(),
        multiDropCharge: config.multiDropCharge.toString(),
        returnTripMultiplier: config.returnTripMultiplier.toString(),
        waitingTimeFreeMinutes: config.waitingTimeFreeMinutes,
        waitingTimePerMinute: config.waitingTimePerMinute.toString(),
        rushHourStart: morningPeriod.start,
        rushHourEnd: morningPeriod.end,
        rushHourStartEvening: eveningPeriod.start,
        rushHourEndEvening: eveningPeriod.end,
        weightSurcharges,
        serviceTypePricing,
      });

      // Save vehicle pricing for each vehicle
      const vehicleTypes: VehicleType[] = ['motorbike', 'car', 'small_van', 'medium_van', 'lwb_van', 'luton_van'];
      for (const type of vehicleTypes) {
        const vehicle = config.vehicles[type];
        await vehicleMutation.mutateAsync({
          type,
          data: {
            baseCharge: vehicle.baseCharge.toString(),
            perMileRate: vehicle.perMileRate.toString(),
            rushHourRate: vehicle.rushHourRate.toString(),
          },
        });
      }

      clearPricingCache();
      queryClient.invalidateQueries({ queryKey: ['/api/pricing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vehicles'] });

      toast({
        title: 'Pricing Updated',
        description: 'Your pricing settings have been saved successfully.',
      });
    } catch (error) {
      console.error('Failed to save pricing:', error);
      toast({
        title: 'Error',
        description: 'Failed to save pricing settings. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const updateVehicle = (type: string, field: string, value: number) => {
    setConfig({
      ...config,
      vehicles: {
        ...config.vehicles,
        [type]: {
          ...config.vehicles[type as keyof typeof config.vehicles],
          [field]: value,
        },
      },
    });
  };

  const vehicleIcons = {
    motorbike: Bike,
    car: Car,
    small_van: Truck,
    medium_van: Package,
    lwb_van: Truck,
    luton_van: Truck,
  };

  const isLoading = pricingLoading || vehiclesLoading;
  const isSaving = pricingMutation.isPending || vehicleMutation.isPending;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">Pricing Settings</h1>
            <p className="text-muted-foreground">Configure delivery pricing and charges</p>
          </div>
          <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-pricing">
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {Object.entries(config.vehicles).map(([type, vehicle]) => {
            const Icon = vehicleIcons[type as keyof typeof vehicleIcons];
            return (
              <Card key={type}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    {vehicle.name}
                  </CardTitle>
                  <CardDescription>Max weight: {vehicle.maxWeight} kg</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Base Charge (£)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={vehicle.baseCharge}
                        onChange={(e) => updateVehicle(type, 'baseCharge', parseFloat(e.target.value) || 0)}
                        data-testid={`input-${type}-base`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Per Mile (£)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={vehicle.perMileRate}
                        onChange={(e) => updateVehicle(type, 'perMileRate', parseFloat(e.target.value) || 0)}
                        data-testid={`input-${type}-permile`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Rush Hour (£)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={vehicle.rushHourRate}
                        onChange={(e) => updateVehicle(type, 'rushHourRate', parseFloat(e.target.value) || 0)}
                        data-testid={`input-${type}-rushhour`}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Weight className="h-5 w-5 text-primary" />
                Weight Surcharges
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.weightSurcharges.map((surcharge, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <div className="flex-1">
                    <Label className="text-sm text-muted-foreground">
                      {surcharge.max ? `${surcharge.min}-${surcharge.max} kg` : `${surcharge.min}+ kg`}
                    </Label>
                  </div>
                  <div className="w-24">
                    <Input
                      type="number"
                      step="0.01"
                      value={surcharge.charge}
                      onChange={(e) => {
                        const newSurcharges = [...config.weightSurcharges];
                        newSurcharges[idx].charge = parseFloat(e.target.value) || 0;
                        setConfig({ ...config, weightSurcharges: newSurcharges });
                      }}
                      data-testid={`input-weight-${idx}`}
                    />
                  </div>
                  <span className="text-muted-foreground">£</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Rush Hour Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.rushHourPeriods.map((period, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={period.start}
                      onChange={(e) => {
                        const newPeriods = [...config.rushHourPeriods];
                        newPeriods[idx].start = e.target.value;
                        setConfig({ ...config, rushHourPeriods: newPeriods });
                      }}
                      data-testid={`input-rushhour-start-${idx}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={period.end}
                      onChange={(e) => {
                        const newPeriods = [...config.rushHourPeriods];
                        newPeriods[idx].end = e.target.value;
                        setConfig({ ...config, rushHourPeriods: newPeriods });
                      }}
                      data-testid={`input-rushhour-end-${idx}`}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Additional Charges</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Central London Surcharge (£)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={config.centralLondonSurcharge}
                  onChange={(e) => setConfig({ ...config, centralLondonSurcharge: parseFloat(e.target.value) || 0 })}
                  data-testid="input-central-london"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" />
                  Multi-Drop per Stop (£)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={config.multiDropCharge}
                  onChange={(e) => setConfig({ ...config, multiDropCharge: parseFloat(e.target.value) || 0 })}
                  data-testid="input-multidrop"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-primary" />
                  Return Trip Multiplier
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={config.returnTripMultiplier}
                  onChange={(e) => setConfig({ ...config, returnTripMultiplier: parseFloat(e.target.value) || 0 })}
                  data-testid="input-return-multiplier"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  Waiting Time (£/min)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={config.waitingTimePerMinute}
                  onChange={(e) => setConfig({ ...config, waitingTimePerMinute: parseFloat(e.target.value) || 0 })}
                  data-testid="input-waiting-time"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-primary" />
              Service Type Pricing
            </CardTitle>
            <CardDescription>
              Set the percentage surcharge applied to the base price for each service level.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {(['flexible', 'urgent'] as const).map((key) => (
                <div key={key} className="space-y-2">
                  <Label className="text-sm font-medium">{SERVICE_TYPE_LABELS[key]}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="200"
                      value={serviceTypePricing[key] ?? 0}
                      onChange={(e) =>
                        setServiceTypePricing((prev) => ({
                          ...prev,
                          [key]: parseFloat(e.target.value) || 0,
                        }))
                      }
                      data-testid={`input-service-type-${key}`}
                    />
                    <span className="text-muted-foreground text-sm">%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
