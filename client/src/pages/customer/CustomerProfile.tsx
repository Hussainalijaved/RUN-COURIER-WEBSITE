import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Building,
  Save,
  CheckCircle,
  Home,
  Loader2,
} from 'lucide-react';
import type { User as UserType } from '@shared/schema';
import { PostcodeAutocomplete } from '@/components/PostcodeAutocomplete';

export default function CustomerProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [postcode, setPostcode] = useState('');
  const [address, setAddress] = useState('');

  const { data: profile, isLoading } = useQuery<UserType>({
    queryKey: ['/api/users', user?.id],
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName || '');
      setPhone(profile.phone || '');
      setPostcode(profile.postcode || '');
      setAddress(profile.address || '');
    } else if (user) {
      setFullName(user.fullName || '');
      setPhone(user.phone || '');
    }
  }, [profile, user]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<UserType>) => {
      return apiRequest('PATCH', `/api/users/${user?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id] });
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been updated successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Update Failed',
        description: 'Could not update your profile. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    updateProfileMutation.mutate({
      fullName,
      phone,
      postcode,
      address,
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">My Profile</h1>
          <p className="text-muted-foreground">Manage your account information</p>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        ) : (
          <>
            <Card className="border-primary/20">
              <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <Avatar className="h-20 w-20">
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                      {getInitials(fullName || user?.fullName || 'User')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-xl">{fullName || user?.fullName || 'User'}</CardTitle>
                      <Badge className="bg-green-500">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Active
                      </Badge>
                      {(profile?.userType || user?.userType) === 'business' && (
                        <Badge variant="secondary">
                          <Building className="mr-1 h-3 w-3" />
                          Business
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border" data-testid="account-type-container">
                      <User className="h-4 w-4 text-primary" />
                      <span className="text-sm text-muted-foreground">Account Type:</span>
                      <span className="text-sm font-semibold" data-testid="text-account-type">
                        {(profile?.userType || user?.userType) === 'business' ? 'Business Account' : 'Individual Account'}
                      </span>
                    </div>

                    <CardDescription>
                      {profile?.email || user?.email}
                    </CardDescription>
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
                <CardDescription>
                  Your account details - these will be used to auto-fill booking forms
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="pl-10"
                        placeholder="Your full name"
                        data-testid="input-fullname"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        value={profile?.email || user?.email || ''}
                        className="pl-10"
                        disabled
                        data-testid="input-email"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10"
                        placeholder="e.g., 07700 900000"
                        data-testid="input-phone"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postcode">Postcode / Address</Label>
                    <PostcodeAutocomplete
                      value={postcode}
                      onChange={(value, fullAddress) => {
                        setPostcode(value);
                        if (fullAddress && !address) {
                          setAddress(fullAddress);
                        }
                      }}
                      placeholder="Start typing postcode or address"
                      data-testid="input-postcode"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Full Address</Label>
                  <PostcodeAutocomplete
                    value={address}
                    onChange={(value, fullAddress) => {
                      setAddress(fullAddress || value);
                      if (fullAddress) {
                        const postcodeMatch = fullAddress.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2}/i);
                        if (postcodeMatch && !postcode) {
                          setPostcode(postcodeMatch[0].toUpperCase());
                        }
                      }
                    }}
                    placeholder="Start typing your full address"
                    data-testid="input-address"
                  />
                  <p className="text-xs text-muted-foreground">
                    This address will be used as the default pickup location for your bookings
                  </p>
                </div>

                {(profile?.userType || user?.userType) === 'business' && (profile?.companyName || user?.companyName) && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <h3 className="font-medium flex items-center gap-2">
                        <Building className="h-4 w-4" />
                        Business Details
                      </h3>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Company Name</Label>
                          <Input 
                            value={profile?.companyName || user?.companyName || ''} 
                            disabled 
                            data-testid="input-company-name" 
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

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
                    {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
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
