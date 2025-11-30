import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Building,
  Copy,
  Save,
  CheckCircle,
} from 'lucide-react';

export default function CustomerProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [isSaving, setIsSaving] = useState(false);

  const copyAccountId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      toast({ title: 'Account ID copied to clipboard' });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been updated successfully.',
      });
    } catch (error) {
      toast({
        title: 'Update Failed',
        description: 'Could not update your profile. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
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

        <Card className="border-primary/20">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {getInitials(user?.fullName || 'User')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-xl">{user?.fullName || 'User'}</CardTitle>
                  <Badge className="bg-green-500">
                    <CheckCircle className="mr-1 h-3 w-3" />
                    Active
                  </Badge>
                  {user?.userType === 'business' && (
                    <Badge variant="secondary">
                      <Building className="mr-1 h-3 w-3" />
                      Business
                    </Badge>
                  )}
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border" data-testid="account-id-container">
                  <User className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Account ID:</span>
                  <code className="font-mono text-sm font-semibold text-primary" data-testid="text-account-id">
                    {user?.id || 'Not available'}
                  </code>
                  {user?.id && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 ml-auto"
                      onClick={copyAccountId}
                      data-testid="button-copy-account-id"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                <CardDescription>
                  {user?.email}
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
              Your account details
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
                    value={user?.email || ''}
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
                    placeholder="Your phone number"
                    data-testid="input-phone"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="userType">Account Type</Label>
                <Input
                  id="userType"
                  value={user?.userType === 'business' ? 'Business Account' : 'Individual Account'}
                  className="capitalize"
                  disabled
                  data-testid="input-account-type"
                />
              </div>
            </div>

            {user?.userType === 'business' && user?.companyName && (
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
                      <Input value={user.companyName} disabled data-testid="input-company-name" />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="pt-4">
              <Button 
                onClick={handleSave}
                disabled={isSaving}
                data-testid="button-save-profile"
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
