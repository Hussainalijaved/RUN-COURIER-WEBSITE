import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  UserPlus, Search, RefreshCw, Trash2, CheckCircle, XCircle, AlertCircle,
  MoreHorizontal, Copy, Link, Eye, Pencil, Save, Loader2, Phone, MapPin,
  Mail, User, Calendar, ShieldCheck, ShieldOff, ShieldAlert, FileText,
} from 'lucide-react';

interface Supervisor {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  city?: string;
  status: string;
  invited_at: string;
  activated_at?: string;
  invited_by?: string;
  notes?: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  pending_approval: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  deactivated: 'bg-muted text-muted-foreground',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Invited',
  pending_approval: 'Pending Approval',
  active: 'Active',
  suspended: 'Suspended',
  deactivated: 'Deactivated',
};

export default function AdminSupervisors() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');

  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteNotes, setInviteNotes] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const [viewSup, setViewSup] = useState<Supervisor | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Supervisor | null>(null);

  const { data: supervisors = [], isLoading, refetch, isFetching } = useQuery<Supervisor[]>({
    queryKey: ['/api/supervisors'],
  });

  const initials = (name: string) =>
    name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  const formatDate = (d?: string) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; fullName: string; notes: string; fromDialog?: boolean }) => {
      const res = await apiRequest('POST', '/api/supervisors/invite', { email: data.email, fullName: data.fullName, notes: data.notes });
      return { ...(await res.json()), fromDialog: data.fromDialog };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisors'] });
      if (data.fromDialog) {
        setInviteSuccess(data.message || 'Invitation sent successfully.');
        setInviteLink(data.inviteUrl || '');
        setInviteEmail(''); setInviteName(''); setInviteNotes('');
      } else {
        toast({ title: 'Invitation sent', description: data.message || 'Invitation email sent successfully.' });
      }
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to send invitation. Please try again.', variant: 'destructive' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest('PATCH', `/api/supervisors/${id}/status`, { status }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisors'] });
      toast({ title: 'Status updated', description: 'Supervisor status has been updated.' });
      if (viewSup?.id === vars.id) {
        setViewSup(prev => prev ? { ...prev, status: vars.status } : prev);
      }
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update status.', variant: 'destructive' }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest('PUT', `/api/supervisors/${id}`, data);
      return res.json();
    },
    onSuccess: (updated: Supervisor) => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisors'] });
      setViewSup(updated);
      setIsEditingDetails(false);
      toast({ title: 'Profile updated', description: 'Supervisor details have been saved.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update supervisor details.', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/supervisors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisors'] });
      setDeleteTarget(null);
      setViewDialogOpen(false);
      toast({ title: 'Supervisor removed', description: 'The supervisor account has been deleted.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to delete supervisor.', variant: 'destructive' }),
  });

  const filtered = (supervisors as Supervisor[]).filter((s) => {
    const q = search.toLowerCase();
    return !q || s.email.toLowerCase().includes(q) || (s.full_name || '').toLowerCase().includes(q) || (s.city || '').toLowerCase().includes(q);
  });

  const pendingApproval = (supervisors as Supervisor[]).filter(s => s.status === 'pending_approval').length;

  const openViewDialog = (sup: Supervisor) => {
    setViewSup(sup);
    setIsEditingDetails(false);
    setViewDialogOpen(true);
  };

  const startEditing = () => {
    if (!viewSup) return;
    setEditName(viewSup.full_name || '');
    setEditPhone(viewSup.phone || '');
    setEditCity(viewSup.city || '');
    setEditNotes(viewSup.notes || '');
    setIsEditingDetails(true);
  };

  const handleSaveEdit = () => {
    if (!viewSup) return;
    editMutation.mutate({
      id: viewSup.id,
      data: { full_name: editName, phone: editPhone, city: editCity, notes: editNotes },
    });
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const handleInvite = () => {
    setInviteSuccess('');
    inviteMutation.mutate({ email: inviteEmail, fullName: inviteName, notes: inviteNotes, fromDialog: true });
  };

  const openInviteDialog = () => {
    setInviteSuccess(''); setInviteEmail(''); setInviteName(''); setInviteNotes('');
    setShowInviteDialog(true);
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Supervisors</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {(supervisors as Supervisor[]).length} supervisor{(supervisors as Supervisor[]).length !== 1 ? 's' : ''} total
              {pendingApproval > 0 && ` · ${pendingApproval} awaiting approval`}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="default" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={openInviteDialog} data-testid="button-invite-supervisor">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Supervisor
            </Button>
          </div>
        </div>

        {pendingApproval > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {pendingApproval} supervisor{pendingApproval !== 1 ? 's' : ''} registered and awaiting your approval. Review below and activate their accounts.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email or city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-0">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4 border-t animate-pulse">
                    <div className="h-10 w-10 bg-muted rounded-full" />
                    <div className="flex-1 space-y-1">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="h-3 w-48 bg-muted rounded" />
                    </div>
                    <div className="h-5 w-24 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
                <UserPlus className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No supervisors yet. Invite your first supervisor to get started.</p>
                <Button onClick={openInviteDialog} data-testid="button-invite-first">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Supervisor
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((sup) => (
                  <div
                    key={sup.id}
                    className="flex flex-wrap items-center gap-4 px-6 py-4 cursor-pointer hover-elevate"
                    onClick={() => openViewDialog(sup)}
                    data-testid={`row-supervisor-${sup.id}`}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="text-sm font-medium">{initials(sup.full_name || sup.email)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-[160px]">
                      <p className="text-sm font-medium text-foreground">{sup.full_name || '(No name yet)'}</p>
                      <p className="text-xs text-muted-foreground">{sup.email}</p>
                      {(sup.phone || sup.city) && (
                        <p className="text-xs text-muted-foreground">
                          {[sup.phone, sup.city ? `Office: ${sup.city}` : ''].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Invited {formatDate(sup.invited_at)}
                        {sup.invited_by ? ` by ${sup.invited_by}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Badge className={`text-xs ${STATUS_COLORS[sup.status] || ''}`}>
                        {STATUS_LABELS[sup.status] || sup.status}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${sup.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openViewDialog(sup)} data-testid={`button-view-${sup.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {sup.status === 'pending_approval' && (
                            <DropdownMenuItem
                              onClick={() => statusMutation.mutate({ id: sup.id, status: 'active' })}
                              data-testid={`button-approve-${sup.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                              Approve & Activate
                            </DropdownMenuItem>
                          )}
                          {sup.status === 'active' && (
                            <DropdownMenuItem
                              onClick={() => statusMutation.mutate({ id: sup.id, status: 'suspended' })}
                              data-testid={`button-suspend-${sup.id}`}
                            >
                              <XCircle className="h-4 w-4 mr-2 text-orange-600" />
                              Suspend
                            </DropdownMenuItem>
                          )}
                          {sup.status === 'suspended' && (
                            <DropdownMenuItem
                              onClick={() => statusMutation.mutate({ id: sup.id, status: 'active' })}
                              data-testid={`button-reactivate-${sup.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                              Reactivate
                            </DropdownMenuItem>
                          )}
                          {sup.status === 'pending' && (
                            <DropdownMenuItem
                              onClick={() => inviteMutation.mutate({ email: sup.email, fullName: sup.full_name, notes: sup.notes || '', fromDialog: false })}
                              data-testid={`button-reinvite-${sup.id}`}
                            >
                              <UserPlus className="h-4 w-4 mr-2" />
                              Re-send Invitation
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(sup)}
                            data-testid={`button-delete-${sup.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Supervisor
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* View / Edit Supervisor Details Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={(open) => { setViewDialogOpen(open); if (!open) { setIsEditingDetails(false); } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Supervisor Profile</DialogTitle>
              <DialogDescription>
                {viewSup?.email}
              </DialogDescription>
            </DialogHeader>
            {viewSup && (
              <div className="space-y-5 py-2">
                {/* Avatar + name + status */}
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14 shrink-0">
                    <AvatarFallback className="text-base font-semibold bg-primary/10 text-primary">
                      {initials(viewSup.full_name || viewSup.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-base truncate">{viewSup.full_name || '(No name)'}</p>
                    <p className="text-sm text-muted-foreground truncate">{viewSup.email}</p>
                  </div>
                  <Badge className={`text-xs shrink-0 ${STATUS_COLORS[viewSup.status] || ''}`}>
                    {STATUS_LABELS[viewSup.status] || viewSup.status}
                  </Badge>
                </div>

                <Separator />

                {/* Details */}
                {isEditingDetails ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" /> Full Name
                        </Label>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Full name"
                          data-testid="input-edit-name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5" /> Phone
                        </Label>
                        <Input
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="Phone number"
                          data-testid="input-edit-phone"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" /> Office City
                      </Label>
                      <Input
                        value={editCity}
                        onChange={(e) => setEditCity(e.target.value)}
                        placeholder="e.g. London"
                        data-testid="input-edit-city"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" /> Admin Notes
                      </Label>
                      <Textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Internal notes — not visible to supervisor"
                        rows={3}
                        data-testid="input-edit-notes"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveEdit}
                        disabled={editMutation.isPending}
                        data-testid="button-save-edit"
                      >
                        {editMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Save Changes
                      </Button>
                      <Button variant="outline" onClick={() => setIsEditingDetails(false)} data-testid="button-cancel-edit">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
                          <Phone className="h-3 w-3" /> Phone
                        </p>
                        <p className="font-medium">{viewSup.phone || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
                          <MapPin className="h-3 w-3" /> Office City
                        </p>
                        <p className="font-medium">{viewSup.city || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
                          <Calendar className="h-3 w-3" /> Invited
                        </p>
                        <p className="font-medium">{formatDate(viewSup.invited_at)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
                          <Calendar className="h-3 w-3" /> Activated
                        </p>
                        <p className="font-medium">{formatDate(viewSup.activated_at)}</p>
                      </div>
                      {viewSup.invited_by && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
                            <Mail className="h-3 w-3" /> Invited By
                          </p>
                          <p className="font-medium">{viewSup.invited_by}</p>
                        </div>
                      )}
                    </div>

                    {viewSup.notes && (
                      <div className="bg-muted/50 rounded-md p-3">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                          <FileText className="h-3 w-3" /> Admin Notes
                        </p>
                        <p className="text-sm">{viewSup.notes}</p>
                      </div>
                    )}

                    <Button variant="outline" size="sm" onClick={startEditing} data-testid="button-edit-supervisor">
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit Details
                    </Button>
                  </div>
                )}

                <Separator />

                {/* Account Control */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-3">Account Control</p>
                  <div className="flex flex-wrap gap-2">
                    {viewSup.status === 'pending_approval' && (
                      <Button
                        size="sm"
                        onClick={() => statusMutation.mutate({ id: viewSup.id, status: 'active' })}
                        disabled={statusMutation.isPending}
                        data-testid="button-dialog-approve"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                        Approve & Activate
                      </Button>
                    )}
                    {viewSup.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => statusMutation.mutate({ id: viewSup.id, status: 'suspended' })}
                        disabled={statusMutation.isPending}
                        data-testid="button-dialog-suspend"
                      >
                        <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                        Suspend Account
                      </Button>
                    )}
                    {viewSup.status === 'suspended' && (
                      <Button
                        size="sm"
                        onClick={() => statusMutation.mutate({ id: viewSup.id, status: 'active' })}
                        disabled={statusMutation.isPending}
                        data-testid="button-dialog-reactivate"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                        Reactivate
                      </Button>
                    )}
                    {viewSup.status === 'active' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => statusMutation.mutate({ id: viewSup.id, status: 'deactivated' })}
                        disabled={statusMutation.isPending}
                        data-testid="button-dialog-deactivate"
                      >
                        <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
                        Deactivate
                      </Button>
                    )}
                    {viewSup.status === 'deactivated' && (
                      <Button
                        size="sm"
                        onClick={() => statusMutation.mutate({ id: viewSup.id, status: 'active' })}
                        disabled={statusMutation.isPending}
                        data-testid="button-dialog-restore"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                        Restore Access
                      </Button>
                    )}
                    {viewSup.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => inviteMutation.mutate({ email: viewSup.email, fullName: viewSup.full_name, notes: viewSup.notes || '', fromDialog: false })}
                        disabled={inviteMutation.isPending}
                        data-testid="button-dialog-reinvite"
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                        Re-send Invitation
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/30 hover:bg-destructive/5"
                      onClick={() => setDeleteTarget(viewSup)}
                      data-testid="button-dialog-delete"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Invite Dialog */}
        <Dialog open={showInviteDialog} onOpenChange={(open) => { setShowInviteDialog(open); if (!open) { setInviteSuccess(''); setInviteLink(''); setLinkCopied(false); } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite a Supervisor</DialogTitle>
              <DialogDescription>
                Send an invitation email to a new supervisor. They will receive a link to create their account.
              </DialogDescription>
            </DialogHeader>
            {inviteSuccess ? (
              <div className="py-2 space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700">{inviteSuccess}</AlertDescription>
                </Alert>
                {inviteLink && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1.5 text-muted-foreground">
                      <Link className="h-3.5 w-3.5" />
                      Registration link — share this if the email doesn't arrive:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted rounded-md px-3 py-2 break-all font-mono text-foreground">
                        {inviteLink}
                      </code>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => copyLink(inviteLink)}
                        data-testid="button-copy-invite-link"
                        title="Copy link"
                      >
                        {linkCopied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">This link expires in 7 days.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email Address <span className="text-destructive">*</span></Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="supervisor@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    data-testid="input-invite-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-name">Full Name</Label>
                  <Input
                    id="invite-name"
                    placeholder="Optional — pre-fills for them"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    data-testid="input-invite-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-notes">Internal Notes</Label>
                  <Textarea
                    id="invite-notes"
                    placeholder="Optional — for admin reference only"
                    value={inviteNotes}
                    onChange={(e) => setInviteNotes(e.target.value)}
                    rows={2}
                    data-testid="input-invite-notes"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
                {inviteSuccess ? 'Close' : 'Cancel'}
              </Button>
              {!inviteSuccess && (
                <Button
                  onClick={handleInvite}
                  disabled={!inviteEmail || inviteMutation.isPending}
                  data-testid="button-send-invite"
                >
                  {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Supervisor?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete the supervisor account for <strong>{deleteTarget?.email}</strong>.
                Their login access will be revoked. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? 'Removing...' : 'Remove Supervisor'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
