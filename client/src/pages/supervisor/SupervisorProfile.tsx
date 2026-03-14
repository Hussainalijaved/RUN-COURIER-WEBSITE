import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { apiRequest } from '@/lib/queryClient';
import { Briefcase, Mail, User, Lock, Save, Loader2, MapPin, Phone, Pencil, X } from 'lucide-react';

export default function SupervisorProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: supervisorInfo } = useQuery<{ name: string; city?: string; phone?: string }>({
    queryKey: ['/api/supervisor/verify'],
    retry: false,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { fullName: string; phone: string }) => {
      return apiRequest('PUT', '/api/supervisor/profile', data);
    },
    onSuccess: () => {
      toast({ title: 'Profile updated', description: 'Your profile has been saved.' });
      queryClient.invalidateQueries({ queryKey: ['/api/supervisor/verify'] });
      setIsEditing(false);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to update profile.', variant: 'destructive' });
    },
  });

  const startEditing = () => {
    setEditName(supervisorInfo?.name || user?.fullName || '');
    setEditPhone(supervisorInfo?.phone || '');
    setIsEditing(true);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      toast({ title: 'Error', description: 'Full name cannot be empty.', variant: 'destructive' });
      return;
    }
    updateProfileMutation.mutate({ fullName: editName.trim(), phone: editPhone.trim() });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'New passwords do not match.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Error', description: 'Password must be at least 8 characters.', variant: 'destructive' });
      return;
    }
    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password updated', description: 'Your password has been changed successfully.' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to update password.', variant: 'destructive' });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const displayName = supervisorInfo?.name || user?.fullName || '';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'S';

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your supervisor account details.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-muted-foreground" />
                  Account Information
                </CardTitle>
                <CardDescription className="mt-1">Your supervisor account details.</CardDescription>
              </div>
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={startEditing} data-testid="button-edit-profile">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Profile
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 ring-2 ring-primary/20">
                <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-semibold">{displayName}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            <Separator />

            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="grid gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
                    <User className="h-3.5 w-3.5" /> Full Name
                  </Label>
                  <Input
                    id="edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Your full name"
                    required
                    data-testid="input-edit-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-phone" className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
                    <Phone className="h-3.5 w-3.5" /> Phone Number
                  </Label>
                  <Input
                    id="edit-phone"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="e.g. 07700 900000"
                    data-testid="input-edit-phone"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
                    <Mail className="h-3.5 w-3.5" /> Email Address
                  </Label>
                  <Input
                    value={user?.email || ''}
                    readOnly
                    className="bg-muted/40 cursor-not-allowed"
                    data-testid="input-email"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button type="submit" disabled={updateProfileMutation.isPending} data-testid="button-save-profile">
                    {updateProfileMutation.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="mr-2 h-4 w-4" /> Save Changes</>
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
                    <X className="mr-2 h-4 w-4" /> Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="grid gap-4">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
                    <User className="h-3.5 w-3.5" /> Full Name
                  </Label>
                  <Input
                    value={displayName}
                    readOnly
                    className="bg-muted/40 cursor-not-allowed"
                    data-testid="input-full-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
                    <Phone className="h-3.5 w-3.5" /> Phone Number
                  </Label>
                  <Input
                    value={supervisorInfo?.phone || '—'}
                    readOnly
                    className="bg-muted/40 cursor-not-allowed"
                    data-testid="input-phone"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
                    <Mail className="h-3.5 w-3.5" /> Email Address
                  </Label>
                  <Input
                    value={user?.email || ''}
                    readOnly
                    className="bg-muted/40 cursor-not-allowed"
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
                    <Briefcase className="h-3.5 w-3.5" /> Role
                  </Label>
                  <Input
                    value="Operations Supervisor"
                    readOnly
                    className="bg-muted/40 cursor-not-allowed"
                    data-testid="input-role"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
                    <MapPin className="h-3.5 w-3.5" /> Office City
                  </Label>
                  <Input
                    value={supervisorInfo?.city || '—'}
                    readOnly
                    className="bg-muted/40 cursor-not-allowed"
                    data-testid="input-city"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Change Password
            </CardTitle>
            <CardDescription>Update your account password. Use a strong, unique password.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  data-testid="input-confirm-password"
                />
              </div>
              <Button type="submit" disabled={isChangingPassword} data-testid="button-change-password">
                {isChangingPassword ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> Update Password</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
