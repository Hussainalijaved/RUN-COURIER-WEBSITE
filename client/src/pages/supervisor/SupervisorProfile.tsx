import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { supabase } from '@/lib/supabase';
import { apiRequest } from '@/lib/queryClient';
import {
  Briefcase, Mail, User, Lock, Save, Loader2, MapPin, Phone,
  Pencil, X, Calendar, FileText, CheckCircle2, AlertCircle, Clock,
  ShieldCheck,
} from 'lucide-react';

interface SupervisorInfo {
  name: string;
  city?: string;
  phone?: string;
  status?: string;
  notes?: string;
  invited_at?: string;
  activated_at?: string;
  created_at?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle2,
  },
  suspended: {
    label: 'Suspended',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    icon: AlertCircle,
  },
  pending_approval: {
    label: 'Pending Approval',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: Clock,
  },
  deactivated: {
    label: 'Deactivated',
    className: 'bg-muted text-muted-foreground',
    icon: AlertCircle,
  },
};

export default function SupervisorProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: supervisorInfo, isLoading } = useQuery<SupervisorInfo>({
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

  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

  const displayName = supervisorInfo?.name || user?.fullName || '';
  const initials = displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'S';
  const status = supervisorInfo?.status || 'active';
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG['active'];
  const StatusIcon = statusCfg.icon;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto p-6 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your supervisor account details.</p>
        </div>

        {/* Account Summary Card */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 ring-2 ring-primary/20 shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-0.5">
                  <p className="text-lg font-semibold truncate">{displayName || '(No name)'}</p>
                  <Badge className={`text-xs gap-1 ${statusCfg.className}`}>
                    <StatusIcon className="h-3 w-3" />
                    {statusCfg.label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  Operations Supervisor
                </p>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Phone className="h-3 w-3" /> Phone
                </p>
                <p className="font-medium">{supervisorInfo?.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <MapPin className="h-3 w-3" /> Office City
                </p>
                <p className="font-medium">{supervisorInfo?.city || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Calendar className="h-3 w-3" /> Invited
                </p>
                <p className="font-medium">{formatDate(supervisorInfo?.invited_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Calendar className="h-3 w-3" /> Activated
                </p>
                <p className="font-medium">{formatDate(supervisorInfo?.activated_at)}</p>
              </div>
            </div>

            {supervisorInfo?.notes && (
              <div className="mt-4 bg-muted/50 rounded-md p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <FileText className="h-3 w-3" /> Note from Admin
                </p>
                <p className="text-sm">{supervisorInfo.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Profile Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-muted-foreground" />
                  Account Information
                </CardTitle>
                <CardDescription className="mt-1">Update your name and phone number.</CardDescription>
              </div>
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={startEditing} data-testid="button-edit-profile">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Profile
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
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
                    value={supervisorInfo?.phone || ''}
                    readOnly
                    className="bg-muted/40 cursor-not-allowed"
                    placeholder="Not set"
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
                    value={supervisorInfo?.city || ''}
                    readOnly
                    className="bg-muted/40 cursor-not-allowed"
                    placeholder="Not set"
                    data-testid="input-city"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Change Password Card */}
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
