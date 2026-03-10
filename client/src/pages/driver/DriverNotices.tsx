import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Bell, CheckCircle, Clock, ChevronLeft, Megaphone, AlertTriangle, Trash2 } from 'lucide-react';

const CATEGORY_COLORS: Record<string, string> = {
  emergency: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  legal: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  payment: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  compliance: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  rates: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  system: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  general: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
};

export default function DriverNotices() {
  const { toast } = useToast();
  const { session } = useAuth();
  const [selectedNotice, setSelectedNotice] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'acknowledged' | 'requires_ack'>('all');

  const token = session?.access_token;

  const { data: notices = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/driver/notices'],
    queryFn: async () => {
      if (!token) return [];
      const res = await fetch('/api/driver/notices', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!token,
  });

  const filteredNotices = useMemo(() => {
    switch (filter) {
      case 'unread': return notices.filter((n: any) => !n.viewed_at);
      case 'acknowledged': return notices.filter((n: any) => n.acknowledged_at);
      case 'requires_ack': return notices.filter((n: any) => n.requires_acknowledgement && !n.acknowledged_at);
      default: return notices;
    }
  }, [notices, filter]);

  const sortedNotices = useMemo(() => {
    return [...filteredNotices].sort((a: any, b: any) => {
      if (!a.viewed_at && b.viewed_at) return -1;
      if (a.viewed_at && !b.viewed_at) return 1;
      return new Date(b.sent_at || b.notice_sent_at || 0).getTime() - new Date(a.sent_at || a.notice_sent_at || 0).getTime();
    });
  }, [filteredNotices]);

  const unreadCount = notices.filter((n: any) => !n.viewed_at).length;
  const ackPendingCount = notices.filter((n: any) => n.requires_acknowledgement && !n.acknowledged_at).length;

  const markViewedMutation = useMutation({
    mutationFn: async (noticeId: string) => {
      await fetch(`/api/driver/notices/${noticeId}/view`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/driver/notices'] }),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (noticeId: string) => {
      const res = await fetch(`/api/driver/notices/${noticeId}/acknowledge`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to acknowledge');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver/notices'] });
      toast({ title: 'Notice acknowledged' });
    },
    onError: () => toast({ title: 'Failed to acknowledge notice', variant: 'destructive' }),
  });

  const deleteNoticeMutation = useMutation({
    mutationFn: async (noticeId: string) => {
      const res = await fetch(`/api/driver/notices/${noticeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver/notices'] });
      toast({ title: 'Notice deleted' });
      setDetailOpen(false);
      setSelectedNotice(null);
    },
    onError: () => toast({ title: 'Failed to delete notice', variant: 'destructive' }),
  });

  function openNotice(notice: any) {
    setSelectedNotice(notice);
    setDetailOpen(true);
    if (!notice.viewed_at) {
      markViewedMutation.mutate(notice.notice_id);
    }
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Notices</h1>
          <p className="text-muted-foreground">Important notices from Run Courier</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
            data-testid="button-filter-all"
          >
            All ({notices.length})
          </Button>
          <Button
            size="sm"
            variant={filter === 'unread' ? 'default' : 'outline'}
            onClick={() => setFilter('unread')}
            data-testid="button-filter-unread"
          >
            <Bell className="w-3.5 h-3.5 mr-1" />
            Unread ({unreadCount})
          </Button>
          <Button
            size="sm"
            variant={filter === 'requires_ack' ? 'default' : 'outline'}
            onClick={() => setFilter('requires_ack')}
            data-testid="button-filter-requires-ack"
          >
            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
            Needs Action ({ackPendingCount})
          </Button>
          <Button
            size="sm"
            variant={filter === 'acknowledged' ? 'default' : 'outline'}
            onClick={() => setFilter('acknowledged')}
            data-testid="button-filter-acknowledged"
          >
            <CheckCircle className="w-3.5 h-3.5 mr-1" />
            Acknowledged
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : sortedNotices.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No notices to display.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedNotices.map((n: any) => (
              <Card
                key={n.id}
                className={`cursor-pointer hover-elevate ${!n.viewed_at ? 'ring-1 ring-blue-500' : ''}`}
                onClick={() => openNotice(n)}
                data-testid={`card-notice-${n.id}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`font-medium ${!n.viewed_at ? 'font-semibold' : ''}`}>{n.title}</h3>
                        {!n.viewed_at && <Badge className="bg-blue-500 text-white">New</Badge>}
                        {n.requires_acknowledgement && !n.acknowledged_at && (
                          <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:text-yellow-400">
                            Requires Acknowledgement
                          </Badge>
                        )}
                        {n.acknowledged_at && (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            Acknowledged
                          </Badge>
                        )}
                      </div>
                      {n.subject && <p className="text-sm text-muted-foreground line-clamp-1">{n.subject}</p>}
                      <p className="text-sm line-clamp-2 text-muted-foreground">{n.message}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="secondary" className={CATEGORY_COLORS[n.category] || CATEGORY_COLORS.general}>{n.category}</Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {n.notice_sent_at ? new Date(n.notice_sent_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedNotice?.title}</DialogTitle>
            <DialogDescription>Notice from Run Courier Admin</DialogDescription>
          </DialogHeader>
          {selectedNotice && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className={CATEGORY_COLORS[selectedNotice.category] || CATEGORY_COLORS.general}>{selectedNotice.category}</Badge>
                {selectedNotice.requires_acknowledgement && !selectedNotice.acknowledged_at && (
                  <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:text-yellow-400">Requires Acknowledgement</Badge>
                )}
                {selectedNotice.acknowledged_at && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Acknowledged</Badge>
                )}
              </div>
              {selectedNotice.subject && <p className="text-muted-foreground">{selectedNotice.subject}</p>}
              <div className="rounded-md border p-4 whitespace-pre-wrap text-sm">{selectedNotice.message}</div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>From: Run Courier Admin</p>
                <p>Sent: {selectedNotice.notice_sent_at ? new Date(selectedNotice.notice_sent_at).toLocaleString('en-GB') : '-'}</p>
              </div>

              <div className="flex gap-2 flex-wrap">
                {selectedNotice.requires_acknowledgement && !selectedNotice.acknowledged_at && (
                  <Button
                    onClick={() => { acknowledgeMutation.mutate(selectedNotice.notice_id); setDetailOpen(false); }}
                    disabled={acknowledgeMutation.isPending}
                    className="flex-1"
                    data-testid="button-acknowledge"
                  >
                    <CheckCircle className="w-4 h-4 mr-1.5" />
                    {acknowledgeMutation.isPending ? 'Acknowledging...' : 'I Acknowledge'}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => { if (confirm('Delete this notice?')) deleteNoticeMutation.mutate(selectedNotice.notice_id); }}
                  disabled={deleteNoticeMutation.isPending}
                  data-testid="button-delete-notice"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  {deleteNoticeMutation.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
