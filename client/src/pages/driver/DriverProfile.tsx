import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  User,
  Mail,
  Phone,
  Car,
  Star,
  CheckCircle,
  Clock,
  Save,
  Loader2,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import type { Driver, VehicleType } from '@shared/schema';

const vehicleTypes: { value: VehicleType; label: string }[] = [
  { value: 'motorbike', label: 'Motorbike' },
  { value: 'car', label: 'Car' },
  { value: 'small_van', label: 'Small Van' },
  { value: 'medium_van', label: 'Medium Van' },
];

export default function DriverProfile() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: driver, isLoading } = useQuery<Driver>({
    queryKey: [`/api/drivers/user/${user?.id}`],
    enabled: !!user?.id,
  });

  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [vehicleRegistration, setVehicleRegistration] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');

  useEffect(() => {
    if (driver) {
      setVehicleType(driver.vehicleType || 'car');
      setVehicleRegistration(driver.vehicleRegistration || '');
      setVehicleMake(driver.vehicleMake || '');
      setVehicleModel(driver.vehicleModel || '');
      setVehicleColor(driver.vehicleColor || '');
    }
  }, [driver]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<Driver>) => {
      if (!driver) return;
      return apiRequest('PATCH', `/api/drivers/${driver.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/drivers/user/${user?.id}`] });
      toast({ title: 'Profile updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update profile', variant: 'destructive' });
    },
  });

  const handleSave = () => {
    updateProfileMutation.mutate({
      vehicleType,
      vehicleRegistration,
      vehicleMake,
      vehicleModel,
      vehicleColor,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Profile</h1>
          <p className="text-muted-foreground">Manage your driver profile and vehicle information</p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                      {user?.fullName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'D'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-xl">{user?.fullName}</CardTitle>
                      {driver?.isVerified ? (
                        <Badge className="bg-green-500">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Clock className="mr-1 h-3 w-3" />
                          Pending Verification
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1">Driver since {new Date(driver?.createdAt || Date.now()).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</CardDescription>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span>{driver?.rating || '5.00'} rating</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>{driver?.totalJobs || 0} deliveries</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Personal Information
                </CardTitle>
                <CardDescription>Your account details (managed through your login)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <Input value={user?.email || ''} disabled data-testid="input-email" />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone
                    </Label>
                    <Input value={user?.phone || 'Not set'} disabled data-testid="input-phone" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Car className="h-5 w-5" />
                  Vehicle Information
                </CardTitle>
                <CardDescription>Update your vehicle details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Vehicle Type</Label>
                    <Select value={vehicleType} onValueChange={(v) => setVehicleType(v as VehicleType)}>
                      <SelectTrigger data-testid="select-vehicle-type">
                        <SelectValue placeholder="Select vehicle type" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicleTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Registration Number</Label>
                    <Input 
                      placeholder="e.g., AB12 CDE"
                      value={vehicleRegistration}
                      onChange={(e) => setVehicleRegistration(e.target.value.toUpperCase())}
                      data-testid="input-registration"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Make</Label>
                    <Input 
                      placeholder="e.g., Ford"
                      value={vehicleMake}
                      onChange={(e) => setVehicleMake(e.target.value)}
                      data-testid="input-make"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Input 
                      placeholder="e.g., Transit"
                      value={vehicleModel}
                      onChange={(e) => setVehicleModel(e.target.value)}
                      data-testid="input-model"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <Input 
                      placeholder="e.g., White"
                      value={vehicleColor}
                      onChange={(e) => setVehicleColor(e.target.value)}
                      data-testid="input-color"
                    />
                  </div>
                </div>
                <div className="pt-4">
                  <Button 
                    onClick={handleSave}
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-save-profile"
                  >
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
