import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  Wifi,
  WifiOff,
  Camera,
  Building2,
  Shield,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);

  const { data: driver, isLoading } = useDriver();
  const updateProfileMutation = useUpdateDriverProfile();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [postcode, setPostcode] = useState('');
  const [address, setAddress] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [vehicleRegistration, setVehicleRegistration] = useState('');
  const [vehicleMake, setVehicleMake] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [nationalInsuranceNumber, setNationalInsuranceNumber] = useState('');
  const [rightToWorkShareCode, setRightToWorkShareCode] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPicture, setIsUploadingPicture] = useState(false);

  const handleProfilePictureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !driver?.id) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({ title: 'Please upload a valid image file (JPEG, PNG, GIF, or WebP)', variant: 'destructive' });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File size must be less than 10MB', variant: 'destructive' });
      return;
    }

    setIsUploadingPicture(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/drivers/${driver.id}/profile-picture`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload profile picture');
      }

      toast({ title: 'Profile picture updated successfully' });
      // Force immediate cache refresh with timestamp to bust browser cache
      await queryClient.invalidateQueries({ queryKey: ['supabase', 'driver', user?.id] });
      await queryClient.refetchQueries({ queryKey: ['supabase', 'driver', user?.id] });
      // Force page reload to ensure image cache is cleared
      window.location.reload();
    } catch (error) {
      toast({ 
        title: error instanceof Error ? error.message : 'Failed to upload profile picture', 
        variant: 'destructive' 
      });
    } finally {
      setIsUploadingPicture(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const copyDriverId = () => {
    if (driver?.id) {
      navigator.clipboard.writeText(driver.id);
      toast({ title: 'Driver ID copied to clipboard' });
    }
  };

  useEffect(() => {
    if (driver) {
      setFullName(driver.fullName || '');
      setPhone(driver.phone || '');
      setPostcode(driver.postcode || '');
      setAddress(driver.address || '');
      setVehicleType(driver.vehicleType || 'car');
      setVehicleRegistration(driver.vehicleRegistration || '');
      setVehicleMake(driver.vehicleMake || '');
      setVehicleModel(driver.vehicleModel || '');
      setVehicleColor(driver.vehicleColor || '');
      setIsAvailable(driver.isAvailable ?? false);
      setBankName((driver as any).bankName || '');
      setAccountHolderName((driver as any).accountHolderName || '');
      setSortCode((driver as any).sortCode || '');
      setAccountNumber((driver as any).accountNumber || '');
      setNationalInsuranceNumber((driver as any).nationalInsuranceNumber || '');
      setRightToWorkShareCode((driver as any).rightToWorkShareCode || '');
    }
  }, [driver]);

  const handleSave = () => {
    if (!driver) {
      toast({ title: 'No driver profile found', variant: 'destructive' });
      return;
    }
    if (!driver.id) {
      toast({ title: 'Driver ID not available. Please try refreshing the page.', variant: 'destructive' });
      return;
    }
    updateProfileMutation.mutate(
      {
        driverId: driver.id,
        data: {
          fullName,
          phone,
          postcode,
          address,
          vehicleType,
          vehicleRegistration,
          vehicleMake,
          vehicleModel,
          vehicleColor,
          bankName,
          accountHolderName,
          sortCode,
          accountNumber,
          nationalInsuranceNumber,
          rightToWorkShareCode,
        },
      },
      {
        onSuccess: () => toast({ title: 'Profile updated successfully' }),
        onError: (error) => toast({ title: error instanceof Error ? error.message : 'Failed to update profile', variant: 'destructive' }),
      }
    );
  };

  const toggleAvailabilityMutation = useMutation({
    mutationFn: async (newState: boolean) => {
      return apiRequest('PATCH', `/api/drivers/${driver?.id}/availability`, { isAvailable: newState });
    },
    onSuccess: async (data, newState) => {
      setIsAvailable(newState);
      await queryClient.invalidateQueries({ queryKey: ['supabase', 'driver', user?.id] });
      await queryClient.refetchQueries({ queryKey: ['supabase', 'driver', user?.id] });
      toast({ title: newState ? 'You are now online' : 'You are now offline' });
    },
    onError: () => {
      toast({ title: 'Failed to update availability', variant: 'destructive' });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest('DELETE', `/api/users/${userId}`);
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
    if (!user?.id) {
      toast({ title: 'User ID not available', variant: 'destructive' });
      return;
    }
    deleteAccountMutation.mutate(user.id);
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
                  <div className="relative group">
                    <Avatar className="h-20 w-20">
                      {driver?.profilePictureUrl && (
                        <AvatarImage 
                          src={driver.profilePictureUrl} 
                          alt={driver?.fullName || 'Driver'} 
                        />
                      )}
                      <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                        {driver?.fullName?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || user?.fullName?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || 'D'}
                      </AvatarFallback>
                    </Avatar>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingPicture}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      data-testid="button-upload-profile-picture"
                    >
                      {isUploadingPicture ? (
                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                      ) : (
                        <Camera className="h-6 w-6 text-white" />
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleProfilePictureUpload}
                      className="hidden"
                      data-testid="input-profile-picture"
                    />
                  </div>
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
                      <Button
                        size="sm"
                        variant={isAvailable ? 'default' : 'outline'}
                        onClick={() => {
                          if (!driver?.id) {
                            toast({ title: 'Driver profile not loaded. Please refresh the page.', variant: 'destructive' });
                            return;
                          }
                          toggleAvailabilityMutation.mutate(!isAvailable);
                        }}
                        disabled={toggleAvailabilityMutation.isPending || !driver?.id}
                        data-testid="button-toggle-availability"
                      >
                        {isAvailable ? (
                          <>
                            <Wifi className="mr-1 h-3 w-3" />
                            Online
                          </>
                        ) : (
                          <>
                            <WifiOff className="mr-1 h-3 w-3" />
                            Offline
                          </>
                        )}
                      </Button>
                    </div>
                    
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border" data-testid="driver-id-container">
                      <User className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Driver ID:</span>
                      <code className="font-mono text-sm font-semibold text-primary" data-testid="text-driver-id">
                        {driver?.driverCode || 'Not assigned'}
                      </code>
                      {driver?.driverCode && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 ml-auto"
                          onClick={() => {
                            if (driver?.driverCode) {
                              navigator.clipboard.writeText(driver.driverCode);
                              toast({ title: 'Driver ID copied to clipboard' });
                            }
                          }}
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
                <CardDescription>Update your contact details and address</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Full Name
                    </Label>
                    <Input 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter your full name"
                      data-testid="input-fullname" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <Input value={driver?.email || user?.email || ''} disabled data-testid="input-email" />
                    <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone Number
                    </Label>
                    <PhoneInput 
                      value={phone}
                      onChange={setPhone}
                      data-testid="input-phone" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Postcode
                    </Label>
                    <Input 
                      value={postcode}
                      onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                      placeholder="e.g., SW1A 1AA"
                      data-testid="input-postcode" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Full Address
                  </Label>
                  <Input 
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Your full home address"
                    data-testid="input-address" 
                  />
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Bank Details
                </CardTitle>
                <CardDescription>Your payment details for receiving earnings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Bank Name</Label>
                    <Input 
                      placeholder="e.g., Barclays"
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      data-testid="input-bank-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Holder Name</Label>
                    <Input 
                      placeholder="Name on your bank account"
                      value={accountHolderName}
                      onChange={(e) => setAccountHolderName(e.target.value)}
                      data-testid="input-account-holder"
                    />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Sort Code</Label>
                    <Input 
                      placeholder="e.g., 12-34-56"
                      value={sortCode}
                      onChange={(e) => setSortCode(e.target.value)}
                      data-testid="input-sort-code"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Account Number</Label>
                    <Input 
                      placeholder="e.g., 12345678"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      data-testid="input-account-number"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Right to Work Information
                </CardTitle>
                <CardDescription>Your employment eligibility details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>National Insurance Number</Label>
                    <Input 
                      placeholder="e.g., AB123456C"
                      value={nationalInsuranceNumber}
                      onChange={(e) => setNationalInsuranceNumber(e.target.value.toUpperCase())}
                      data-testid="input-ni-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Right to Work Share Code</Label>
                    <Input 
                      placeholder="e.g., ABC123XYZ"
                      value={rightToWorkShareCode}
                      onChange={(e) => setRightToWorkShareCode(e.target.value.toUpperCase())}
                      data-testid="input-rtw-share-code"
                    />
                    <p className="text-xs text-muted-foreground">
                      Get your share code from <a href="https://www.gov.uk/prove-right-to-work/get-a-share-code-online" target="_blank" rel="noopener noreferrer" className="text-primary underline">gov.uk</a>
                    </p>
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

            <div className="border border-destructive/30 rounded-md p-3 bg-destructive/5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">Delete your driver account permanently</span>
                </div>
                <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive"
                      size="sm"
                      data-testid="button-delete-account"
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Delete
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
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
