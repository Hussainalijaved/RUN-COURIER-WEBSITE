import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Bike, Car, Truck, Package, Save, Clock, MapPin, Weight, Layers, RotateCcw } from 'lucide-react';
import { defaultPricingConfig } from '@/lib/pricing';

export default function AdminPricing() {
  const { toast } = useToast();
  const [config, setConfig] = useState(defaultPricingConfig);

  const handleSave = () => {
    toast({
      title: 'Pricing Updated',
      description: 'Your pricing settings have been saved successfully.',
    });
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
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pricing Settings</h1>
            <p className="text-muted-foreground">Configure delivery pricing and charges</p>
          </div>
          <Button onClick={handleSave} data-testid="button-save-pricing">
            <Save className="mr-2 h-4 w-4" />
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
                        onChange={(e) => updateVehicle(type, 'baseCharge', parseFloat(e.target.value))}
                        data-testid={`input-${type}-base`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Per Mile (£)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={vehicle.perMileRate}
                        onChange={(e) => updateVehicle(type, 'perMileRate', parseFloat(e.target.value))}
                        data-testid={`input-${type}-permile`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Rush Hour (£)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={vehicle.rushHourRate}
                        onChange={(e) => updateVehicle(type, 'rushHourRate', parseFloat(e.target.value))}
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
                        newSurcharges[idx].charge = parseFloat(e.target.value);
                        setConfig({ ...config, weightSurcharges: newSurcharges });
                      }}
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
                  onChange={(e) => setConfig({ ...config, centralLondonSurcharge: parseFloat(e.target.value) })}
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
                  onChange={(e) => setConfig({ ...config, multiDropCharge: parseFloat(e.target.value) })}
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
                  onChange={(e) => setConfig({ ...config, returnTripMultiplier: parseFloat(e.target.value) })}
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
                  onChange={(e) => setConfig({ ...config, waitingTimePerMinute: parseFloat(e.target.value) })}
                  data-testid="input-waiting-time"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
