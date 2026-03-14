import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
} from '@/components/ui/alert-dialog';
import { UserPlus, Search, RefreshCw, Trash2, CheckCircle, XCircle, AlertCircle, MoreHorizontal, Copy, Link } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Supervisor {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
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
  const [deleteTarget, setDeleteTarget] = useState<Supervisor | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteNotes, setInviteNotes] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const { data: supervisors = [], isLoading, refetch, isFetching } = useQuery<Supervisor[]>({
    queryKey: ['/api/supervisors'],
  });

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

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
        setInviteEmail('');
        setInviteName('');
        setInviteNotes('');
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisors'] });
      toast({ title: 'Status updated', description: 'Supervisor status has been updated.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update status.', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/supervisors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supervisors'] });
      setDeleteTarget(null);
      toast({ title: 'Supervisor removed', description: 'The supervisor account has been deleted.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to delete supervisor.', variant: 'destructive' }),
  });

  const filtered = (supervisors as Supervisor[]).filter((s) => {
    const q = search.toLowerCase();
    return !q || (
      s.email.toLowerCase().includes(q) ||
      (s.full_name || '').toLowerCase().includes(q)
    );
  });

  const initials = (name: string) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  const handleInvite = () => {
    setInviteSuccess('');
    inviteMutation.mutate({ email: inviteEmail, fullName: inviteName, notes: inviteNotes, fromDialog: true });
  };

  const openInviteDialog = () => {
    setInviteSuccess('');
    setInviteEmail('');
    setInviteName('');
    setInviteNotes('');
    setShowInviteDialog(true);
  };

  const pendingApproval = (supervisors as Supervisor[]).filter(s => s.status === 'pending_approval').length;

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
                placeholder="Search by name or email..."
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
                  <div key={sup.id} className="flex flex-wrap items-center gap-4 px-6 py-4" data-testid={`row-supervisor-${sup.id}`}>
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="text-sm font-medium">{initials(sup.full_name || sup.email)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-[160px]">
                      <p className="text-sm font-medium text-foreground">{sup.full_name || '(No name yet)'}</p>
                      <p className="text-xs text-muted-foreground">{sup.email}</p>
                      {sup.phone && <p className="text-xs text-muted-foreground">{sup.phone}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Invited {new Date(sup.invited_at).toLocaleDateString('en-GB')}
                        {sup.invited_by ? ` by ${sup.invited_by}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
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
                            <>
                              <DropdownMenuItem
                                onClick={() => inviteMutation.mutate({ email: sup.email, fullName: sup.full_name, notes: sup.notes || '', fromDialog: false })}
                                data-testid={`button-reinvite-${sup.id}`}
                              >
                                <UserPlus className="h-4 w-4 mr-2" />
                                Re-send Invitation
                              </DropdownMenuItem>
                            </>
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
