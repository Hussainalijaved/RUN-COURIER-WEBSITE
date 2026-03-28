import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest, getAuthHeaders } from '@/lib/queryClient';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  Megaphone, Plus, Send, Eye, Edit, Trash2, Copy, Archive,
  Search, FileText, CheckCircle, Clock, AlertTriangle, Mail,
  Users, Bell, ChevronLeft, RotateCw, ImagePlus, X,
} from 'lucide-react';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'legal', label: 'Legal' },
  { value: 'payment', label: 'Payment' },
  { value: 'rates', label: 'Rates' },
  { value: 'system', label: 'System' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'emergency', label: 'Emergency' },
];

function categoryBadge(category: string) {
  const colors: Record<string, string> = {
    emergency: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    legal: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    payment: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    compliance: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    rates: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    system: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
    general: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
  };
  return <Badge variant="secondary" className={colors[category] || colors.general}>{category}</Badge>;
}

export default function AdminNotices() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('templates');
  const [searchQuery, setSearchQuery] = useState('');

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [templateForm, setTemplateForm] = useState({ title: '', subject: '', message: '', category: 'general', requires_acknowledgement: false });

  const [createNoticeOpen, setCreateNoticeOpen] = useState(false);
  const [noticeForm, setNoticeForm] = useState({ title: '', subject: '', message: '', category: 'general', requires_acknowledgement: false, target_type: 'all' as 'all' | 'selected', send_email: false, template_id: '' });
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [driverSearchQuery, setDriverSearchQuery] = useState('');
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [detailNotice, setDetailNotice] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [noticeImageFiles, setNoticeImageFiles] = useState<File[]>([]);
  const [noticeImagePreviews, setNoticeImagePreviews] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { data: templates = [], isLoading: templatesLoading } = useQuery<any[]>({ queryKey: ['/api/notice-templates'] });
  const { data: sentNotices = [], isLoading: noticesLoading } = useQuery<any[]>({ queryKey: ['/api/admin/notices'] });
  const { data: drivers = [] } = useQuery<any[]>({ queryKey: ['/api/drivers'] });
  const { data: noticeRecipientDriverIds = [] } = useQuery<string[]>({ queryKey: ['/api/admin/notices/recipient-driver-ids'] });

  const activeApprovedDrivers = useMemo(() =>
    drivers.filter((d: any) => d.isVerified && d.isActive !== false),
    [drivers]
  );

  const filteredTemplates = useMemo(() => {
    if (!searchQuery) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter((t: any) => t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  }, [templates, searchQuery]);

  const recipientDriverIdSet = useMemo(() => new Set(noticeRecipientDriverIds), [noticeRecipientDriverIds]);

  const newDriverIdsForNotices = useMemo(() => {
    return activeApprovedDrivers.filter((d: any) => !recipientDriverIdSet.has(d.id)).map((d: any) => d.id);
  }, [activeApprovedDrivers, recipientDriverIdSet]);

  const sortedActiveDrivers = useMemo(() => {
    return [...activeApprovedDrivers].sort((a, b) => {
      const aNew = !recipientDriverIdSet.has(a.id);
      const bNew = !recipientDriverIdSet.has(b.id);
      if (aNew && !bNew) return -1;
      if (!aNew && bNew) return 1;
      return (a.driverCode || '').localeCompare(b.driverCode || '');
    });
  }, [activeApprovedDrivers, recipientDriverIdSet]);

  const filteredDrivers = useMemo(() => {
    if (!driverSearchQuery) return sortedActiveDrivers;
    const q = driverSearchQuery.toLowerCase();
    return sortedActiveDrivers.filter((d: any) =>
      `${d.firstName} ${d.lastName}`.toLowerCase().includes(q) ||
      (d.driverCode || '').toLowerCase().includes(q) ||
      (d.email || '').toLowerCase().includes(q)
    );
  }, [sortedActiveDrivers, driverSearchQuery]);

  const stats = useMemo(() => {
    const total = sentNotices.filter((n: any) => n.status === 'sent').length;
    const totalRecipients = sentNotices.reduce((sum: number, n: any) => sum + (n.recipient_count || 0), 0);
    const totalViewed = sentNotices.reduce((sum: number, n: any) => sum + (n.viewed_count || 0), 0);
    const totalAcked = sentNotices.reduce((sum: number, n: any) => sum + (n.acknowledged_count || 0), 0);
    const unread = totalRecipients - totalViewed;
    const pendingAck = sentNotices.filter((n: any) => n.requires_acknowledgement && n.status === 'sent')
      .reduce((sum: number, n: any) => sum + ((n.recipient_count || 0) - (n.acknowledged_count || 0)), 0);
    return { total, unread: Math.max(0, unread), pendingAck: Math.max(0, pendingAck), totalAcked };
  }, [sentNotices]);

  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest('POST', '/api/notice-templates', data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/notice-templates'] }); toast({ title: 'Template created' }); setTemplateDialogOpen(false); resetTemplateForm(); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => { const r = await apiRequest('PATCH', `/api/notice-templates/${id}`, data); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/notice-templates'] }); toast({ title: 'Template updated' }); setTemplateDialogOpen(false); resetTemplateForm(); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest('DELETE', `/api/notice-templates/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/notice-templates'] }); toast({ title: 'Template deleted' }); },
  });

  const sendNoticeMutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest('POST', '/api/admin/notices/send', data); return r.json(); },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notices'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/notices/recipient-driver-ids'] });
      const pushSent = data.pushSent || 0;
      const noDevice = data.noDeviceCount || 0;
      let description = `Notice saved for ${data.recipientCount} driver(s).`;
      if (pushSent > 0 && noDevice === 0) {
        description += ` Push notification delivered to all ${pushSent}.`;
      } else if (pushSent > 0 && noDevice > 0) {
        description += ` Push delivered to ${pushSent}. ${noDevice} will see it in their Alerts tab.`;
      } else if (noDevice > 0) {
        description += ` Saved to Alerts tab — drivers will see it when they open the app.`;
      }
      toast({ title: 'Notice sent', description });
      setConfirmSendOpen(false);
      setCreateNoticeOpen(false);
      resetNoticeForm();
      setActiveTab('sent');
    },
    onError: (e: any) => toast({ title: 'Error sending notice', description: e.message, variant: 'destructive' }),
  });

  const archiveNoticeMutation = useMutation({
    mutationFn: async (id: string) => { const r = await apiRequest('PATCH', `/api/admin/notices/${id}/archive`); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/admin/notices'] }); toast({ title: 'Notice archived' }); },
  });

  const resendNoticeMutation = useMutation({
    mutationFn: async (id: string) => { const r = await apiRequest('POST', `/api/admin/notices/${id}/resend`); return r.json(); },
    onSuccess: (data: any) => { toast({ title: 'Emails resent', description: `Sent to ${data.sentCount} recipients` }); },
    onError: (e: any) => toast({ title: 'Failed to resend', description: e.message, variant: 'destructive' }),
  });

  const deleteNoticeMutation = useMutation({
    mutationFn: async (id: string) => { const r = await apiRequest('DELETE', `/api/admin/notices/${id}`); return r.json(); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/admin/notices'] }); toast({ title: 'Notice deleted' }); setDetailOpen(false); },
    onError: () => toast({ title: 'Failed to delete notice', variant: 'destructive' }),
  });

  function resetTemplateForm() {
    setEditingTemplate(null);
    setTemplateForm({ title: '', subject: '', message: '', category: 'general', requires_acknowledgement: false });
  }

  function resetNoticeForm() {
    setNoticeForm({ title: '', subject: '', message: '', category: 'general', requires_acknowledgement: false, target_type: 'all', send_email: false, template_id: '' });
    setSelectedDriverIds([]);
    setDriverSearchQuery('');
    setNoticeImageFiles([]);
    setNoticeImagePreviews([]);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function openEditTemplate(t: any) {
    setEditingTemplate(t);
    setTemplateForm({ title: t.title, subject: t.subject || '', message: t.message, category: t.category, requires_acknowledgement: t.requires_acknowledgement });
    setTemplateDialogOpen(true);
  }

  function duplicateTemplate(t: any) {
    setEditingTemplate(null);
    setTemplateForm({ title: `${t.title} (Copy)`, subject: t.subject || '', message: t.message, category: t.category, requires_acknowledgement: t.requires_acknowledgement });
    setTemplateDialogOpen(true);
  }

  function useTemplateForNotice(t: any) {
    setNoticeForm({
      title: t.title, subject: t.subject || '', message: t.message, category: t.category,
      requires_acknowledgement: t.requires_acknowledgement, target_type: 'all', send_email: false, template_id: t.id,
    });
    setActiveTab('create');
  }

  function handleSaveTemplate() {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ id: editingTemplate.id, ...templateForm });
    } else {
      createTemplateMutation.mutate(templateForm);
    }
  }

  async function handleSendNotice() {
    const imageUrls: string[] = [];
    if (noticeImageFiles.length > 0 && noticeForm.send_email) {
      setIsUploadingImage(true);
      try {
        const authHeaders = await getAuthHeaders();
        for (const file of noticeImageFiles) {
          const formData = new FormData();
          formData.append('file', file);
          const r = await fetch('/api/admin/notices/upload-image', {
            method: 'POST',
            headers: authHeaders,
            body: formData,
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || 'Upload failed');
          if (data.url) imageUrls.push(data.url);
        }
      } catch (e: any) {
        toast({ title: 'Image upload failed', description: e.message, variant: 'destructive' });
        setIsUploadingImage(false);
        return;
      }
      setIsUploadingImage(false);
    }
    const payload: any = { ...noticeForm };
    if (imageUrls.length > 0) payload.image_urls = imageUrls;
    if (noticeForm.target_type === 'selected') {
      payload.driver_ids = selectedDriverIds;
    }
    sendNoticeMutation.mutate(payload);
  }

  async function openNoticeDetail(noticeId: string) {
    try {
      const res = await apiRequest('GET', `/api/admin/notices/${noticeId}`);
      const data = await res.json();
      setDetailNotice(data);
      setDetailOpen(true);
    } catch (e) {
      toast({ title: 'Failed to load notice details', variant: 'destructive' });
    }
  }

  const recipientCount = noticeForm.target_type === 'all' ? activeApprovedDrivers.length : selectedDriverIds.length;

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Driver Notices</h1>
          <p className="text-muted-foreground">Send and manage notices to drivers</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card data-testid="stat-total-sent">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <p className="text-sm text-muted-foreground">Total Sent</p>
                </div>
                <Send className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-unread">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-2xl font-bold text-blue-500">{stats.unread}</div>
                  <p className="text-sm text-muted-foreground">Unread</p>
                </div>
                <Bell className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-pending-ack">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-2xl font-bold text-yellow-500">{stats.pendingAck}</div>
                  <p className="text-sm text-muted-foreground">Ack. Pending</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-acknowledged">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-2xl font-bold text-green-500">{stats.totalAcked}</div>
                  <p className="text-sm text-muted-foreground">Acknowledged</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList data-testid="tabs-notices">
            <TabsTrigger value="templates" data-testid="tab-templates">
              <FileText className="w-4 h-4 mr-1.5" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="sent" data-testid="tab-sent-notices">
              <Send className="w-4 h-4 mr-1.5" />
              Sent Notices
              {sentNotices.length > 0 && <Badge variant="secondary" className="ml-1.5">{sentNotices.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="create" data-testid="tab-create-notice">
              <Plus className="w-4 h-4 mr-1.5" />
              Create Notice
            </TabsTrigger>
          </TabsList>

          {/* ============ TEMPLATES TAB ============ */}
          <TabsContent value="templates" className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-templates"
                />
              </div>
              <Button onClick={() => { resetTemplateForm(); setTemplateDialogOpen(true); }} data-testid="button-new-template">
                <Plus className="w-4 h-4 mr-1.5" />
                New Template
              </Button>
            </div>

            {templatesLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
            ) : filteredTemplates.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No templates yet. Create your first notice template.</CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredTemplates.map((t: any) => (
                  <Card key={t.id} className="hover-elevate" data-testid={`card-template-${t.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base line-clamp-1">{t.title}</CardTitle>
                        {categoryBadge(t.category)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {t.subject && <p className="text-sm text-muted-foreground line-clamp-1">{t.subject}</p>}
                      <p className="text-sm line-clamp-2">{t.message}</p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {t.requires_acknowledgement && <Badge variant="outline" className="text-xs">Requires Ack.</Badge>}
                      </div>
                      <div className="flex items-center gap-1 pt-1 flex-wrap">
                        <Button size="sm" variant="ghost" onClick={() => useTemplateForNotice(t)} data-testid={`button-use-template-${t.id}`}>
                          <Send className="w-3.5 h-3.5 mr-1" /> Use
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => openEditTemplate(t)} data-testid={`button-edit-template-${t.id}`}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => duplicateTemplate(t)} data-testid={`button-duplicate-template-${t.id}`}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm('Delete this template?')) deleteTemplateMutation.mutate(t.id); }} data-testid={`button-delete-template-${t.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ============ SENT NOTICES TAB ============ */}
          <TabsContent value="sent" className="space-y-4">
            {noticesLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : sentNotices.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No notices sent yet.</CardContent></Card>
            ) : (
              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Recipients</TableHead>
                        <TableHead>Viewed</TableHead>
                        <TableHead>Acknowledged</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sentNotices.map((n: any) => (
                        <TableRow key={n.id} className="cursor-pointer" onClick={() => openNoticeDetail(n.id)} data-testid={`row-notice-${n.id}`}>
                          <TableCell className="font-medium max-w-[200px] truncate">{n.title}</TableCell>
                          <TableCell>{categoryBadge(n.category)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {n.sent_at ? new Date(n.sent_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{n.recipient_count || 0}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                              {n.viewed_count || 0}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                              {n.acknowledged_count || 0}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {n.status === 'archived' ? (
                              <Badge variant="outline">Archived</Badge>
                            ) : (
                              <Badge variant="secondary">Sent</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button size="icon" variant="ghost" onClick={() => openNoticeDetail(n.id)} data-testid={`button-view-notice-${n.id}`}>
                                <Eye className="w-4 h-4" />
                              </Button>
                              {n.status !== 'archived' && (
                                <Button size="icon" variant="ghost" onClick={() => archiveNoticeMutation.mutate(n.id)} data-testid={`button-archive-notice-${n.id}`}>
                                  <Archive className="w-4 h-4" />
                                </Button>
                              )}
                              <Button size="icon" variant="ghost" onClick={() => { if (confirm('Delete this notice and all its recipient records permanently?')) deleteNoticeMutation.mutate(n.id); }} data-testid={`button-delete-notice-${n.id}`}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ============ CREATE NOTICE TAB ============ */}
          <TabsContent value="create" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create New Notice</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {templates.length > 0 && (
                  <div className="space-y-2">
                    <Label>Use Template (optional)</Label>
                    <Select value={noticeForm.template_id} onValueChange={(val) => {
                      if (val === 'none') { resetNoticeForm(); return; }
                      const t = templates.find((t: any) => t.id === val);
                      if (t) useTemplateForNotice(t);
                    }}>
                      <SelectTrigger data-testid="select-template">
                        <SelectValue placeholder="Select a template..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No template (custom notice)</SelectItem>
                        {templates.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input value={noticeForm.title} onChange={(e) => setNoticeForm(f => ({ ...f, title: e.target.value }))} placeholder="Notice title" data-testid="input-notice-title" />
                  </div>
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input value={noticeForm.subject} onChange={(e) => setNoticeForm(f => ({ ...f, subject: e.target.value }))} placeholder="Optional subject line" data-testid="input-notice-subject" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Message *</Label>
                  <Textarea
                    value={noticeForm.message}
                    onChange={(e) => setNoticeForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="Write your notice message..."
                    rows={6}
                    data-testid="input-notice-message"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={noticeForm.category} onValueChange={(val) => setNoticeForm(f => ({ ...f, category: val }))}>
                      <SelectTrigger data-testid="select-notice-category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Recipients</Label>
                    <Select value={noticeForm.target_type} onValueChange={(val: 'all' | 'selected') => { setNoticeForm(f => ({ ...f, target_type: val })); setSelectedDriverIds([]); }}>
                      <SelectTrigger data-testid="select-target-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Active Approved Drivers ({activeApprovedDrivers.length})</SelectItem>
                        <SelectItem value="selected">Selected Drivers Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {noticeForm.target_type === 'selected' && (
                  <div className="space-y-3 border rounded-md p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Label>Select Drivers ({selectedDriverIds.length} selected)</Label>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setSelectedDriverIds(activeApprovedDrivers.map((d: any) => d.id))} data-testid="button-select-all-drivers">Select All</Button>
                        {newDriverIdsForNotices.length > 0 && (
                          <Button size="sm" variant="outline" onClick={() => setSelectedDriverIds(newDriverIdsForNotices)} data-testid="button-select-new-drivers">
                            <Users className="w-3 h-3 mr-1" />
                            Select New Only ({newDriverIdsForNotices.length})
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setSelectedDriverIds([])} data-testid="button-deselect-all-drivers">Deselect All</Button>
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search drivers..." value={driverSearchQuery} onChange={(e) => setDriverSearchQuery(e.target.value)} className="pl-10" data-testid="input-search-notice-drivers" />
                    </div>
                    {newDriverIdsForNotices.length > 0 && (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                          {newDriverIdsForNotices.length} new (no notices received)
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-green-600 inline-block" />
                          {activeApprovedDrivers.length - newDriverIdsForNotices.length} already received notices
                        </span>
                      </div>
                    )}
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {filteredDrivers.map((d: any) => {
                        const isNew = !recipientDriverIdSet.has(d.id);
                        return (
                          <label key={d.id} className="flex items-center gap-2 p-2 rounded hover-elevate cursor-pointer" data-testid={`checkbox-driver-${d.id}`}>
                            <Checkbox
                              checked={selectedDriverIds.includes(d.id)}
                              onCheckedChange={(checked) => {
                                setSelectedDriverIds(prev => checked ? [...prev, d.id] : prev.filter(id => id !== d.id));
                              }}
                            />
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className="text-sm">{d.driverCode && <span className="font-mono mr-1.5">{d.driverCode}</span>}{d.firstName} {d.lastName}</span>
                              {isNew ? (
                                <Badge variant="default" className="bg-blue-600 text-[10px] px-1.5 py-0">New</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                                  Received
                                </Badge>
                              )}
                            </div>
                            {d.email && <span className="text-xs text-muted-foreground">{d.email}</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={noticeForm.requires_acknowledgement}
                      onCheckedChange={(val) => setNoticeForm(f => ({ ...f, requires_acknowledgement: val }))}
                      data-testid="switch-requires-ack"
                    />
                    <Label>Requires Acknowledgement</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={noticeForm.send_email}
                      onCheckedChange={(val) => {
                        setNoticeForm(f => ({ ...f, send_email: val }));
                        if (!val) { setNoticeImageFiles([]); setNoticeImagePreviews([]); if (imageInputRef.current) imageInputRef.current.value = ''; }
                      }}
                      data-testid="switch-send-email"
                    />
                    <Label className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Send Email</Label>
                  </div>
                </div>

                {noticeForm.send_email && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <ImagePlus className="w-3.5 h-3.5" /> Email Image Attachments
                      {noticeImageFiles.length > 0 && <span className="text-muted-foreground font-normal">({noticeImageFiles.length} selected)</span>}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      multiple
                      className="hidden"
                      data-testid="input-notice-image"
                      onChange={(e) => {
                        const newFiles = Array.from(e.target.files || []);
                        if (!newFiles.length) return;
                        setNoticeImageFiles(prev => [...prev, ...newFiles]);
                        newFiles.forEach(file => {
                          const reader = new FileReader();
                          reader.onload = (ev) => setNoticeImagePreviews(prev => [...prev, ev.target?.result as string || '']);
                          reader.readAsDataURL(file);
                        });
                        if (imageInputRef.current) imageInputRef.current.value = '';
                      }}
                    />
                    {noticeImagePreviews.length > 0 && (
                      <div className="flex flex-wrap gap-3">
                        {noticeImagePreviews.map((preview, idx) => (
                          <div key={idx} className="relative inline-block" data-testid={`notice-image-preview-${idx}`}>
                            <img src={preview} alt={`Attachment ${idx + 1}`} className="h-32 w-32 rounded-md border object-cover" />
                            <Button
                              size="icon"
                              variant="destructive"
                              className="absolute top-1 right-1 h-6 w-6"
                              onClick={() => {
                                setNoticeImageFiles(prev => prev.filter((_, i) => i !== idx));
                                setNoticeImagePreviews(prev => prev.filter((_, i) => i !== idx));
                              }}
                              data-testid={`button-remove-notice-image-${idx}`}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          className="h-32 w-32 rounded-md border-2 border-dashed border-muted-foreground/40 flex flex-col items-center justify-center gap-1 text-muted-foreground hover-elevate"
                          data-testid="button-add-more-images"
                        >
                          <ImagePlus className="w-5 h-5" />
                          <span className="text-xs">Add more</span>
                        </button>
                      </div>
                    )}
                    {noticeImagePreviews.length === 0 && (
                      <Button variant="outline" size="sm" onClick={() => imageInputRef.current?.click()} data-testid="button-select-notice-image">
                        <ImagePlus className="w-4 h-4 mr-1.5" /> Select Images
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">JPEG, PNG, GIF or WebP. Images will be embedded in the email body.</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2 flex-wrap">
                  <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={!noticeForm.title || !noticeForm.message} data-testid="button-preview-notice">
                    <Eye className="w-4 h-4 mr-1.5" /> Preview
                  </Button>
                  <Button onClick={() => setConfirmSendOpen(true)} disabled={!noticeForm.title || !noticeForm.message || (noticeForm.target_type === 'selected' && selectedDriverIds.length === 0)} data-testid="button-send-notice">
                    <Send className="w-4 h-4 mr-1.5" /> Send Notice
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Template Create/Edit Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
            <DialogDescription>Create a reusable notice template for drivers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={templateForm.title} onChange={(e) => setTemplateForm(f => ({ ...f, title: e.target.value }))} data-testid="input-template-title" />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={templateForm.subject} onChange={(e) => setTemplateForm(f => ({ ...f, subject: e.target.value }))} data-testid="input-template-subject" />
            </div>
            <div className="space-y-2">
              <Label>Message *</Label>
              <Textarea value={templateForm.message} onChange={(e) => setTemplateForm(f => ({ ...f, message: e.target.value }))} rows={5} data-testid="input-template-message" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={templateForm.category} onValueChange={(val) => setTemplateForm(f => ({ ...f, category: val }))}>
                <SelectTrigger data-testid="select-template-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={templateForm.requires_acknowledgement} onCheckedChange={(val) => setTemplateForm(f => ({ ...f, requires_acknowledgement: val }))} data-testid="switch-template-ack" />
              <Label>Requires Acknowledgement</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveTemplate} disabled={!templateForm.title || !templateForm.message || createTemplateMutation.isPending || updateTemplateMutation.isPending} data-testid="button-save-template">
              {editingTemplate ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Notice Preview</DialogTitle>
            <DialogDescription>This is how the notice will appear to drivers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {categoryBadge(noticeForm.category)}
              {noticeForm.requires_acknowledgement && <Badge variant="outline">Requires Acknowledgement</Badge>}
            </div>
            <h3 className="text-lg font-semibold">{noticeForm.title}</h3>
            {noticeForm.subject && <p className="text-muted-foreground">{noticeForm.subject}</p>}
            <div className="rounded-md border p-4 whitespace-pre-wrap text-sm">{noticeForm.message}</div>
            {noticeImagePreviews.length > 0 && noticeForm.send_email && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Email image attachments ({noticeImagePreviews.length}):</p>
                <div className="flex flex-wrap gap-2">
                  {noticeImagePreviews.map((preview, idx) => (
                    <img key={idx} src={preview} alt={`Attachment ${idx + 1}`} className="h-24 w-24 rounded-md border object-cover" />
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Will be sent to {recipientCount} driver{recipientCount !== 1 ? 's' : ''}
              {noticeForm.send_email && ' (including email notification)'}
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Send Dialog */}
      <Dialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Send Notice</DialogTitle>
            <DialogDescription>This action will send the notice to the selected drivers.</DialogDescription>
          </DialogHeader>
          <p>
            Are you sure you want to send this notice to <strong>{recipientCount}</strong> driver{recipientCount !== 1 ? 's' : ''}?
          </p>
          {noticeForm.send_email && <p className="text-sm text-muted-foreground">Email notifications will also be sent.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSendOpen(false)}>Cancel</Button>
            <Button onClick={handleSendNotice} disabled={sendNoticeMutation.isPending || isUploadingImage} data-testid="button-confirm-send">
              {isUploadingImage ? 'Uploading image...' : sendNoticeMutation.isPending ? 'Sending...' : 'Send Notice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notice Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Notice Details</DialogTitle>
            <DialogDescription>Full notice information and recipient tracking.</DialogDescription>
          </DialogHeader>
          {detailNotice && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                {categoryBadge(detailNotice.category)}
                {detailNotice.requires_acknowledgement && <Badge variant="outline">Requires Acknowledgement</Badge>}
                {detailNotice.status === 'archived' && <Badge variant="outline">Archived</Badge>}
              </div>
              <h3 className="text-lg font-semibold">{detailNotice.title}</h3>
              {detailNotice.subject && <p className="text-muted-foreground">{detailNotice.subject}</p>}
              <div className="rounded-md border p-4 whitespace-pre-wrap text-sm">{detailNotice.message}</div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span>Sent by: {detailNotice.sent_by || 'Admin'}</span>
                <span>Sent: {detailNotice.sent_at ? new Date(detailNotice.sent_at).toLocaleString('en-GB') : '-'}</span>
                <span>Target: {detailNotice.target_type === 'all' ? 'All Drivers' : 'Selected Drivers'}</span>
              </div>

              <div className="flex gap-2 flex-wrap">
                {detailNotice.status !== 'archived' && (
                  <Button size="sm" variant="outline" onClick={() => { archiveNoticeMutation.mutate(detailNotice.id); setDetailOpen(false); }} data-testid="button-detail-archive">
                    <Archive className="w-3.5 h-3.5 mr-1" /> Archive
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => resendNoticeMutation.mutate(detailNotice.id)} disabled={resendNoticeMutation.isPending} data-testid="button-detail-resend">
                  <RotateCw className="w-3.5 h-3.5 mr-1" /> Resend Emails
                </Button>
                <Button size="sm" variant="outline" onClick={() => { if (confirm('Delete this notice and all its recipient records permanently?')) deleteNoticeMutation.mutate(detailNotice.id); }} disabled={deleteNoticeMutation.isPending} data-testid="button-detail-delete">
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                </Button>
              </div>

              <div>
                <h4 className="font-semibold mb-2">Recipients ({detailNotice.recipients?.length || 0})</h4>
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Driver</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Viewed</TableHead>
                        <TableHead>Acknowledged</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(detailNotice.recipients || []).map((r: any) => (
                        <TableRow key={r.id} data-testid={`row-recipient-${r.id}`}>
                          <TableCell className="text-sm">{r.driver_name}</TableCell>
                          <TableCell className="font-mono text-sm">{r.driver_code}</TableCell>
                          <TableCell>
                            {r.acknowledged_at ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Acknowledged</Badge>
                            ) : r.viewed_at ? (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Viewed</Badge>
                            ) : (
                              <Badge variant="secondary">Sent</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.viewed_at ? new Date(r.viewed_at).toLocaleString('en-GB') : '-'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.acknowledged_at ? new Date(r.acknowledged_at).toLocaleString('en-GB') : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
