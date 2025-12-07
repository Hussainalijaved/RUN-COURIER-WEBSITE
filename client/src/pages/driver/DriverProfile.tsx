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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  Copy,
  MapPin,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  useDriver,
  useUpdateDriverProfile,
} from '@/hooks/useSupabaseDriver';
import type { VehicleType } from '@shared/schema';

const vehicleTypes: { value: VehicleType; label: string }[] = [
  { value: 'motorbike', label: 'Motorbike' },
  { value: 'car', label: 'Car' },
  { value: 'small_van', label: 'Small Van' },
  { value: 'medium_van', label: 'Medium Van' },
];

export default function DriverProfile() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: driver, isLoading } = useDriver();
  const updateProfileMutation = useUpdateDriverProfile();

  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [vehicleRegistration, setVehicleRegistration] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');

  const copyDriverId = () => {
    if (driver?.id) {
      navigator.clipboard.writeText(driver.id);
      toast({ title: 'Driver ID copied to clipboard' });
    }
  };

  useEffect(() => {
    if (driver) {
      setVehicleType(driver.vehicleType || 'car');
      setVehicleRegistration(driver.vehicleRegistration || '');
      setVehicleMake(driver.vehicleMake || '');
      setVehicleModel(driver.vehicleModel || '');
      setVehicleColor(driver.vehicleColor || '');
    }
  }, [driver]);

  const handleSave = () => {
    if (!driver) return;
    updateProfileMutation.mutate(
      {
        driverId: driver.id,
        data: {
          vehicleType,
          vehicleRegistration,
          vehicleMake,
          vehicleModel,
          vehicleColor,
        },
      },
      {
        onSuccess: () => toast({ title: 'Profile updated successfully' }),
        onError: () => toast({ title: 'Failed to update profile', variant: 'destructive' }),
      }
    );
  };

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/drivers/${driver?.id}`);
    },
    onSuccess: async () => {
      toast({
        title: 'Account Deleted',
        description: 'Your driver account has been permanently deleted.',
      });
      await signOut();
    },
    onError: () => {
      toast({
        title: 'Delete Failed',
        description: 'Could not delete your account. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleDeleteAccount = () => {
    deleteAccountMutation.mutate();
    setShowDeleteDialog(false);
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
            <Card className="border-primary/20">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                      {driver?.fullName?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || user?.fullName?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'D'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-xl">{driver?.fullName || user?.fullName}</CardTitle>
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
                      {driver?.isAvailable && (
                        <Badge variant="outline" className="border-green-500 text-green-600">
                          Online
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border" data-testid="driver-id-container">
                      <User className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Driver ID:</span>
                      <code className="font-mono text-sm font-semibold text-primary" data-testid="text-driver-id">
                        {driver?.id || 'Not assigned'}
                      </code>
                      {driver?.id && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 ml-auto"
                          onClick={copyDriverId}
                          data-testid="button-copy-driver-id"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    <CardDescription>
                      Driver since {new Date(driver?.createdAt || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </CardDescription>
                    
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span>{driver?.rating || '5.00'} rating</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>{driver?.totalJobs || 0} deliveries</span>
                      </div>
                      {driver?.currentLatitude && driver?.currentLongitude && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4 text-blue-500" />
                          <span>Location tracked</span>
                        </div>
                      )}
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
                <CardDescription>Your account details (synced from mobile app registration)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Full Name
                    </Label>
                    <Input value={driver?.fullName || user?.fullName || ''} disabled data-testid="input-fullname" />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <Input value={driver?.email || user?.email || ''} disabled data-testid="input-email" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone Number
                    </Label>
                    <Input value={driver?.phone || user?.phone || 'Not set'} disabled data-testid="input-phone" />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Postcode
                    </Label>
                    <Input value={driver?.postcode || 'Not set'} disabled data-testid="input-postcode" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Full Address
                  </Label>
                  <Input value={driver?.address || 'Not set'} disabled data-testid="input-address" />
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

            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Permanent actions that cannot be undone
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="font-medium">Delete Account</h4>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete your driver account and all associated data. This action cannot be undone.
                    </p>
                  </div>
                  <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="destructive"
                        data-testid="button-delete-account"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Account
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete your
                          driver account and remove all your data from our servers, including:
                          <ul className="list-disc list-inside mt-2 space-y-1">
                            <li>Your driver profile and documents</li>
                            <li>Your job history and earnings records</li>
                            <li>Your vehicle information</li>
                            <li>All associated data</li>
                          </ul>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteAccount}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={deleteAccountMutation.isPending}
                          data-testid="button-confirm-delete"
                        >
                          {deleteAccountMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Yes, Delete My Account
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
