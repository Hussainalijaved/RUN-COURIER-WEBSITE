import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Textarea } from '@/components/ui/textarea';
import {
  HardDrive,
  RefreshCw,
  Download,
  Search,
  Users,
  FileText,
  FolderOpen,
  CheckCircle,
  Clock,
  Loader2,
  Shield,
  File,
  Calendar,
  Eye,
  Image,
  FileDown,
  XCircle,
  ExternalLink,
  StickyNote,
  Save,
  MessageSquare,
  Upload,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface FleetStatus {
  lastSync: {
    syncedAt: string;
    totalDrivers: number;
    totalApplications: number;
    totalDocuments: number;
    downloadedFiles?: number;
    failedFiles?: number;
  } | null;
  syncLog: Array<{
    timestamp: string;
    drivers: number;
    applications: number;
    documents: number;
    downloadedFiles?: number;
    failedFiles?: number;
  }>;
  fileSize: number;
  driverFileCount: number;
}

interface FleetDriverData {
  syncedAt: string;
  drivers: any[];
  applications: any[];
  documents: any[];
}

interface DriverDetail {
  syncedAt: string;
  driver: any;
  application: any;
  documents: any[];
  documentCount: number;
  downloadedCount?: number;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  driving_licence_front: 'Driving Licence (Front)',
  driving_licence_back: 'Driving Licence (Back)',
  driving_licence: 'Driving Licence',
  driving_license: 'Driving Licence',
  driving_license_back: 'Driving Licence (Back)',
  dbs_certificate: 'DBS Certificate',
  goods_in_transit: 'Goods in Transit Insurance',
  hire_and_reward: 'Hire & Reward Insurance',
  profile_picture: 'Profile Picture',
  vehicle_photos: 'Vehicle Photo',
};

function getDocLabel(docType: string): string {
  if (!docType) return 'Unknown Document';
  for (const [key, label] of Object.entries(DOC_TYPE_LABELS)) {
    if (docType.includes(key)) return label;
  }
  return docType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function isImageFile(fileName: string): boolean {
  if (!fileName) return false;
  return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName);
}

interface SyncProgress {
  status: 'idle' | 'running' | 'complete' | 'error';
  phase: string;
  current: number;
  total: number;
  downloadedFiles: number;
  failedFiles: number;
  drivers: number;
  applications: number;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export default function AdminFleetFile() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<DriverDetail | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<{ url: string; name: string; type: string } | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [driverNotes, setDriverNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileEdits, setProfileEdits] = useState<Record<string, string>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadDocType, setUploadDocType] = useState('');
  const { toast } = useToast();

  const { data: status, isLoading: statusLoading } = useQuery<FleetStatus>({
    queryKey: ['/api/admin/fleet-file/status'],
  });

  const { data: fleetData, isLoading: dataLoading } = useQuery<FleetDriverData>({
    queryKey: ['/api/admin/fleet-file/drivers'],
    enabled: !!status?.lastSync,
  });

  const { data: allNotes } = useQuery<Record<string, { notes: string; updatedAt: string }>>({
    queryKey: ['/api/admin/fleet-file/all-notes'],
  });

  const { data: progressData } = useQuery<SyncProgress>({
    queryKey: ['/api/admin/fleet-file/sync-progress'],
    refetchInterval: isSyncing ? 1500 : false,
    enabled: isSyncing,
  });

  useEffect(() => {
    if (!progressData) return;
    setSyncProgress(progressData);

    if (progressData.status === 'complete' && isSyncing) {
      setIsSyncing(false);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fleet-file/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fleet-file/drivers'] });
      toast({
        title: 'Fleet File sync complete',
        description: `${progressData.downloadedFiles} files downloaded${progressData.failedFiles > 0 ? `, ${progressData.failedFiles} failed` : ''}`,
      });
    } else if (progressData.status === 'error' && isSyncing) {
      setIsSyncing(false);
      toast({ title: 'Sync failed', description: progressData.error || 'Unknown error', variant: 'destructive' });
    }
  }, [progressData, isSyncing, toast]);

  useEffect(() => {
    fetch('/api/admin/fleet-file/sync-progress', {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    }).then(async res => {
      if (!res.ok) {
        const progressRes = await apiRequest('GET', '/api/admin/fleet-file/sync-progress');
        return progressRes.json();
      }
      return res.json();
    }).then((data: SyncProgress) => {
      if (data.status === 'running') {
        setSyncProgress(data);
        setIsSyncing(true);
      }
    }).catch(() => {});
  }, []);

  const startSync = async () => {
    setIsSyncing(true);
    setSyncProgress({
      status: 'running', phase: 'Starting sync...', current: 0, total: 0,
      downloadedFiles: 0, failedFiles: 0, drivers: 0, applications: 0,
      startedAt: new Date().toISOString(), completedAt: null, error: null,
    });

    try {
      await apiRequest('POST', '/api/admin/fleet-file/sync');
    } catch {
      setIsSyncing(false);
      toast({ title: 'Failed to start sync', variant: 'destructive' });
    }
  };

  const fetchDriverDetail = async (driverCode: string) => {
    try {
      const res = await apiRequest('GET', `/api/admin/fleet-file/driver/${driverCode}`);
      const data = await res.json();
      setSelectedDriver(data);
      setDetailDialogOpen(true);
      setEditingProfile(false);
      setUploadDocType('');
      try {
        const notesRes = await apiRequest('GET', `/api/admin/fleet-file/notes/${driverCode}`);
        const notesData = await notesRes.json();
        setDriverNotes(notesData.notes || '');
      } catch {
        setDriverNotes('');
      }
    } catch {
      toast({ title: 'Failed to load driver details', variant: 'destructive' });
    }
  };

  const saveDriverNotes = async () => {
    if (!selectedDriver) return;
    const code = selectedDriver.driver?.driver_code || selectedDriver.driver?.id;
    if (!code) return;
    setSavingNotes(true);
    try {
      await apiRequest('PUT', `/api/admin/fleet-file/notes/${code}`, { notes: driverNotes });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fleet-file/all-notes'] });
      toast({ title: 'Notes saved' });
    } catch {
      toast({ title: 'Failed to save notes', variant: 'destructive' });
    } finally {
      setSavingNotes(false);
    }
  };

  const getDriverCode = () => {
    if (!selectedDriver?.driver) return '';
    return (selectedDriver.driver.driver_code || selectedDriver.driver.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  const handleUploadDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const code = getDriverCode();
    if (!code) return;
    const docType = uploadDocType || 'unknown';
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('docType', docType);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';
      const res = await fetch(`/api/admin/fleet-file/upload-document/${code}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      toast({ title: 'Document uploaded to Fleet File' });
      fetchDriverDetail(code);
    } catch {
      toast({ title: 'Failed to upload document', variant: 'destructive' });
    } finally {
      setUploadingDoc(false);
      setUploadDocType('');
      e.target.value = '';
    }
  };

  const handleDeleteDocument = async (fileName: string) => {
    const code = getDriverCode();
    if (!code) return;
    try {
      await apiRequest('DELETE', `/api/admin/fleet-file/document/${code}/${fileName}`);
      toast({ title: 'Document deleted from Fleet File' });
      fetchDriverDetail(code);
    } catch {
      toast({ title: 'Failed to delete document', variant: 'destructive' });
    }
  };

  const startEditingProfile = () => {
    if (!selectedDriver?.driver) return;
    const d = selectedDriver.driver;
    setProfileEdits({
      full_name: d.full_name || '',
      email: d.email || '',
      phone: d.phone || '',
      address: d.address || d.address_line_1 || '',
      postcode: d.postcode || '',
      nationality: d.nationality || '',
      national_insurance_number: d.national_insurance_number || '',
      vehicle_type: d.vehicle_type || '',
      vehicle_registration: d.vehicle_registration || d.vehicle_reg || '',
      vehicle_make: d.vehicle_make || '',
      vehicle_model: d.vehicle_model || '',
      vehicle_color: d.vehicle_color || '',
      bank_name: d.bank_name || '',
      account_holder_name: d.account_holder_name || '',
      sort_code: d.sort_code || '',
      account_number: d.account_number || '',
    });
    setEditingProfile(true);
  };

  const saveProfileEdits = async () => {
    const code = getDriverCode();
    if (!code) return;
    setSavingProfile(true);
    try {
      await apiRequest('PUT', `/api/admin/fleet-file/profile/${code}`, profileEdits);
      toast({ title: 'Profile updated in Fleet File' });
      setEditingProfile(false);
      fetchDriverDetail(code);
    } catch {
      toast({ title: 'Failed to save profile', variant: 'destructive' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDownload = async () => {
    try {
      const res = await apiRequest('GET', '/api/admin/fleet-file/download');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fleet-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: 'Failed to download backup', variant: 'destructive' });
    }
  };

  const openDocument = async (doc: any) => {
    if (doc.localFile && doc.localPath) {
      try {
        const res = await apiRequest('GET', `/api/admin/fleet-file/document/${doc.localPath}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setViewingDoc({
          url: blobUrl,
          name: doc.localFile,
          type: doc.doc_type || 'document',
        });
      } catch {
        toast({ title: 'Failed to load document', variant: 'destructive' });
      }
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const timeSince = (dateStr: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const filteredDrivers = (fleetData?.drivers || []).filter((driver: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (driver.full_name || '').toLowerCase().includes(q) ||
      (driver.driver_code || '').toLowerCase().includes(q) ||
      (driver.email || '').toLowerCase().includes(q) ||
      (driver.phone || '').toLowerCase().includes(q)
    );
  });

  const getDriverDocCount = (driverId: string) => {
    const docs = (fleetData?.documents || []).filter((d: any) => d.driver_id === driverId);
    const downloaded = docs.filter((d: any) => d.localFile);
    return { total: docs.length, downloaded: downloaded.length };
  };

  const getDriverApp = (email: string) => {
    return (fleetData?.applications || []).find((a: any) => a.email === email);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Fleet File</h1>
            <p className="text-muted-foreground">Local backup of all driver data, applications, and document files</p>
          </div>
          <div className="flex gap-2">
            {status?.lastSync && (
              <Button
                variant="outline"
                onClick={handleDownload}
                data-testid="button-download"
              >
                <Download className="w-4 h-4 mr-2" />
                Download JSON
              </Button>
            )}
            <Button
              onClick={startSync}
              disabled={isSyncing}
              data-testid="button-sync"
            >
              {isSyncing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          </div>
        </div>

        {isSyncing && syncProgress && (
          <Card data-testid="card-sync-progress" className="border-blue-200 dark:border-blue-900">
            <CardContent className="pt-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{syncProgress.phase}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {syncProgress.drivers > 0 && `${syncProgress.drivers} drivers`}
                      {syncProgress.applications > 0 && ` | ${syncProgress.applications} applications`}
                      {syncProgress.downloadedFiles > 0 && ` | ${syncProgress.downloadedFiles} downloaded`}
                      {syncProgress.failedFiles > 0 && ` | ${syncProgress.failedFiles} failed`}
                    </p>
                  </div>
                </div>
                {syncProgress.total > 0 && (
                  <div className="space-y-1">
                    <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${Math.round((syncProgress.current / syncProgress.total) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                      {syncProgress.current} / {syncProgress.total} files ({Math.round((syncProgress.current / syncProgress.total) * 100)}%)
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <Card data-testid="card-last-sync">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : status?.lastSync ? (
                <>
                  <div className="text-2xl font-bold text-green-600">{timeSince(status.lastSync.syncedAt)}</div>
                  <p className="text-xs text-muted-foreground">{formatDate(status.lastSync.syncedAt)}</p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-muted-foreground">Never</div>
                  <p className="text-xs text-muted-foreground">Click Sync Now to backup</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-drivers-backed">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Drivers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{status?.lastSync?.totalDrivers || 0}</div>
                  <p className="text-xs text-muted-foreground">{status?.driverFileCount || 0} individual files</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-docs-backed">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Documents Saved</CardTitle>
              <FileDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{status?.lastSync?.downloadedFiles ?? status?.lastSync?.totalDocuments ?? 0}</div>
                  <p className="text-xs text-muted-foreground">
                    {status?.lastSync?.totalDocuments || 0} total records
                    {(status?.lastSync?.failedFiles || 0) > 0 && (
                      <span className="text-red-500"> ({status?.lastSync?.failedFiles} failed)</span>
                    )}
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-file-size">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Backup Size</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{status?.fileSize ? formatFileSize(status.fileSize) : '0 B'}</div>
                  <p className="text-xs text-muted-foreground">JSON + document files</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-green-200 dark:border-green-900" data-testid="card-backup-info">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Full Document Backup</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Fleet File downloads and saves all actual document files (driving licences, DBS certificates, insurance docs, profile photos) 
                  from Supabase Storage to your local server. Every file is viewable directly from this page. 
                  Sync regularly to keep your backup current.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {status?.lastSync && (
          <Card data-testid="card-drivers-list">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Backed Up Drivers</CardTitle>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, code, email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-full sm:w-64"
                    data-testid="input-search"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {dataLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : filteredDrivers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Files Saved</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Application</TableHead>
                      <TableHead>View</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDrivers.map((driver: any) => {
                      const { total, downloaded } = getDriverDocCount(driver.id);
                      const hasApp = !!getDriverApp(driver.email);
                      return (
                        <TableRow key={driver.id} data-testid={`row-driver-${driver.driver_code || driver.id}`}>
                          <TableCell>
                            <span className="font-mono font-medium">{driver.driver_code || '—'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{driver.full_name || '—'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{driver.email || '—'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{driver.phone || '—'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm capitalize">{driver.vehicle_type || '—'}</span>
                          </TableCell>
                          <TableCell>
                            {driver.status === 'approved' || driver.is_active ? (
                              <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-600">{driver.status || 'Unknown'}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {downloaded > 0 ? (
                                <Badge variant="secondary" className="text-xs">
                                  <Image className="h-3 w-3 mr-1" />
                                  {downloaded} file{downloaded !== 1 ? 's' : ''}
                                </Badge>
                              ) : total > 0 ? (
                                <Badge variant="outline" className="text-yellow-600 border-yellow-600 text-xs">
                                  {total} record{total !== 1 ? 's' : ''}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">0</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const code = (driver.driver_code || driver.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
                              const hasNotes = allNotes?.[code]?.notes;
                              return hasNotes ? (
                                <MessageSquare className="h-4 w-4 text-blue-500" />
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            {hasApp ? (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                <CheckCircle className="w-3 h-3 mr-1" />Saved
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => fetchDriverDetail(driver.driver_code || driver.id)}
                              data-testid={`button-view-${driver.driver_code || driver.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No drivers found</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {(status?.syncLog?.length || 0) > 0 && (
          <Card data-testid="card-sync-history">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Sync History</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Drivers</TableHead>
                    <TableHead>Applications</TableHead>
                    <TableHead>Files Downloaded</TableHead>
                    <TableHead>Failed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status?.syncLog.map((log, i) => (
                    <TableRow key={i} data-testid={`row-sync-${i}`}>
                      <TableCell>
                        <span className="text-sm">{formatDate(log.timestamp)}</span>
                      </TableCell>
                      <TableCell><span className="font-medium">{log.drivers}</span></TableCell>
                      <TableCell><span className="font-medium">{log.applications}</span></TableCell>
                      <TableCell>
                        <span className="font-medium text-green-600">{log.downloadedFiles ?? log.documents}</span>
                      </TableCell>
                      <TableCell>
                        {(log.failedFiles || 0) > 0 ? (
                          <span className="font-medium text-red-500">{log.failedFiles}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {selectedDriver && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  {selectedDriver.driver?.full_name || 'Driver'} — Fleet File
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="flex gap-3 flex-wrap">
                  <Badge variant="secondary">
                    {selectedDriver.driver?.driver_code || 'No code'}
                  </Badge>
                  <Badge variant="secondary">
                    {selectedDriver.documentCount} document{selectedDriver.documentCount !== 1 ? 's' : ''}
                  </Badge>
                  {(selectedDriver.downloadedCount ?? 0) > 0 && (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {selectedDriver.downloadedCount} files saved locally
                    </Badge>
                  )}
                </div>

                <Accordion type="multiple" defaultValue={['notes', 'documents', 'profile']} className="w-full">
                  <AccordionItem value="notes">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2">
                        <StickyNote className="h-4 w-4" />
                        Admin Notes
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3">
                        <Textarea
                          placeholder="Add notes about this driver (visible only in Fleet File)..."
                          value={driverNotes}
                          onChange={(e) => setDriverNotes(e.target.value)}
                          className="min-h-[100px] resize-y"
                          data-testid="textarea-driver-notes"
                        />
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs text-muted-foreground">
                            Notes are saved locally to the Fleet File only
                          </p>
                          <Button
                            onClick={saveDriverNotes}
                            disabled={savingNotes}
                            data-testid="button-save-notes"
                          >
                            {savingNotes ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4 mr-2" />
                            )}
                            Save Notes
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="documents">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2">
                        <Image className="h-4 w-4" />
                        Documents & Files ({selectedDriver.documentCount})
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="mb-4 p-3 border rounded-md space-y-3">
                        <p className="text-sm font-medium">Upload Document</p>
                        <div className="flex items-end gap-3 flex-wrap">
                          <div className="flex-1 min-w-[150px]">
                            <Label className="text-xs text-muted-foreground mb-1 block">Document Type</Label>
                            <Select value={uploadDocType} onValueChange={setUploadDocType}>
                              <SelectTrigger data-testid="select-upload-doc-type">
                                <SelectValue placeholder="Select type..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="driving_licence">Driving Licence (Front)</SelectItem>
                                <SelectItem value="driving_licence_back">Driving Licence (Back)</SelectItem>
                                <SelectItem value="dbs_certificate">DBS Certificate</SelectItem>
                                <SelectItem value="goods_in_transit">Goods in Transit Insurance</SelectItem>
                                <SelectItem value="hire_and_reward">Hire & Reward Insurance</SelectItem>
                                <SelectItem value="profile_picture">Profile Picture</SelectItem>
                                <SelectItem value="vehicle_photos">Vehicle Photo</SelectItem>
                                <SelectItem value="other">Other Document</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              onChange={handleUploadDocument}
                              disabled={!uploadDocType || uploadingDoc}
                              className="hidden"
                              id="fleet-doc-upload"
                              data-testid="input-upload-file"
                            />
                            <Button
                              variant="outline"
                              disabled={!uploadDocType || uploadingDoc}
                              onClick={() => document.getElementById('fleet-doc-upload')?.click()}
                              data-testid="button-upload-document"
                            >
                              {uploadingDoc ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Upload className="w-4 h-4 mr-2" />
                              )}
                              Choose & Upload
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Files are saved locally to Fleet File only, not to Supabase
                        </p>
                      </div>

                      {selectedDriver.documents.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedDriver.documents.map((doc: any, idx: number) => (
                            <Card
                              key={idx}
                              className={`${doc.localFile ? 'hover-elevate cursor-pointer' : ''}`}
                              data-testid={`card-doc-${idx}`}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-start gap-3">
                                  <div
                                    className="flex-1 flex items-start gap-3 cursor-pointer"
                                    onClick={() => doc.localFile && openDocument(doc)}
                                  >
                                    <div className="shrink-0 mt-0.5">
                                      {doc.localFile ? (
                                        isImageFile(doc.localFile) ? (
                                          <Image className="h-5 w-5 text-blue-500" />
                                        ) : (
                                          <FileText className="h-5 w-5 text-red-500" />
                                        )
                                      ) : (
                                        <XCircle className="h-5 w-5 text-muted-foreground" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">
                                        {getDocLabel(doc.doc_type)}
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        Source: {doc.source === 'driver_documents' ? 'Documents table' : doc.source === 'driver_profile' ? 'Driver profile' : doc.source === 'admin_upload' ? 'Admin upload' : 'Application'}
                                      </p>
                                      {doc.localFile ? (
                                        <div className="flex items-center gap-2 mt-1">
                                          <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                                            <CheckCircle className="w-3 h-3 mr-1" />
                                            Saved
                                          </Badge>
                                          {doc.fileSize && (
                                            <span className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</span>
                                          )}
                                        </div>
                                      ) : (
                                        <Badge variant="outline" className="text-red-500 border-red-500 text-xs mt-1">
                                          <XCircle className="w-3 h-3 mr-1" />
                                          Download failed
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {doc.localFile && (
                                      <Eye className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    {doc.localFile && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteDocument(doc.localFile);
                                        }}
                                        data-testid={`button-delete-doc-${idx}`}
                                      >
                                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground py-4 text-center">No documents found for this driver</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="profile">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Driver Profile
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                          {editingProfile ? 'Changes saved locally to Fleet File only, not to Supabase' : 'Click Edit to modify profile locally'}
                        </p>
                        {editingProfile ? (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setEditingProfile(false)}
                              data-testid="button-cancel-edit"
                            >
                              <X className="w-4 h-4 mr-2" />
                              Cancel
                            </Button>
                            <Button
                              onClick={saveProfileEdits}
                              disabled={savingProfile}
                              data-testid="button-save-profile"
                            >
                              {savingProfile ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4 mr-2" />
                              )}
                              Save Changes
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={startEditingProfile}
                            data-testid="button-edit-profile"
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit Profile
                          </Button>
                        )}
                      </div>

                      {editingProfile ? (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground block text-xs mb-1">Driver Code</span>
                            <span className="font-medium">{selectedDriver.driver?.driver_code || '—'}</span>
                          </div>
                          {([
                            ['full_name', 'Full Name'],
                            ['email', 'Email'],
                            ['phone', 'Phone'],
                            ['address', 'Address'],
                            ['postcode', 'Postcode'],
                            ['nationality', 'Nationality'],
                            ['national_insurance_number', 'NI Number'],
                            ['vehicle_type', 'Vehicle Type'],
                            ['vehicle_registration', 'Vehicle Reg'],
                            ['vehicle_make', 'Vehicle Make'],
                            ['vehicle_model', 'Vehicle Model'],
                            ['vehicle_color', 'Vehicle Colour'],
                            ['bank_name', 'Bank Name'],
                            ['account_holder_name', 'Account Holder'],
                            ['sort_code', 'Sort Code'],
                            ['account_number', 'Account Number'],
                          ] as const).map(([field, label]) => (
                            <div key={field}>
                              <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
                              <Input
                                value={profileEdits[field] || ''}
                                onChange={(e) => setProfileEdits(prev => ({ ...prev, [field]: e.target.value }))}
                                className="h-8 text-sm"
                                data-testid={`input-edit-${field}`}
                              />
                            </div>
                          ))}
                          <div>
                            <span className="text-muted-foreground block text-xs mb-1">Created</span>
                            <span className="font-medium">{formatDate(selectedDriver.driver?.created_at) || '—'}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {[
                            ['Driver Code', selectedDriver.driver?.driver_code],
                            ['Full Name', selectedDriver.driver?.full_name],
                            ['Email', selectedDriver.driver?.email],
                            ['Phone', selectedDriver.driver?.phone],
                            ['Address', selectedDriver.driver?.address || selectedDriver.driver?.address_line_1],
                            ['Postcode', selectedDriver.driver?.postcode],
                            ['Nationality', selectedDriver.driver?.nationality],
                            ['NI Number', selectedDriver.driver?.national_insurance_number],
                            ['Vehicle Type', selectedDriver.driver?.vehicle_type],
                            ['Vehicle Reg', selectedDriver.driver?.vehicle_registration || selectedDriver.driver?.vehicle_reg],
                            ['Vehicle Make', selectedDriver.driver?.vehicle_make],
                            ['Vehicle Model', selectedDriver.driver?.vehicle_model],
                            ['Vehicle Colour', selectedDriver.driver?.vehicle_color],
                            ['Status', selectedDriver.driver?.status],
                            ['Bank Name', selectedDriver.driver?.bank_name],
                            ['Account Holder', selectedDriver.driver?.account_holder_name],
                            ['Sort Code', selectedDriver.driver?.sort_code],
                            ['Account Number', selectedDriver.driver?.account_number],
                            ['Created', formatDate(selectedDriver.driver?.created_at)],
                          ].map(([label, value]) => (
                            <div key={label as string}>
                              <span className="text-muted-foreground">{label}:</span>{' '}
                              <span className="font-medium">{(value as string) || '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  {selectedDriver.application && (
                    <AccordionItem value="application">
                      <AccordionTrigger className="hover:no-underline">
                        <span className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Original Application
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {[
                            ['Application Status', selectedDriver.application.status],
                            ['Submitted', formatDate(selectedDriver.application.submitted_at)],
                            ['Reviewed', formatDate(selectedDriver.application.reviewed_at)],
                            ['Full Name', selectedDriver.application.full_name],
                            ['Email', selectedDriver.application.email],
                            ['Phone', selectedDriver.application.phone],
                            ['Address', selectedDriver.application.full_address],
                            ['Postcode', selectedDriver.application.postcode],
                            ['Nationality', selectedDriver.application.nationality],
                            ['NI Number', selectedDriver.application.national_insurance_number],
                            ['Vehicle Type', selectedDriver.application.vehicle_type],
                            ['Bank Name', selectedDriver.application.bank_name],
                            ['Account Holder', selectedDriver.application.account_holder_name],
                            ['Sort Code', selectedDriver.application.sort_code],
                            ['Account Number', selectedDriver.application.account_number],
                          ].map(([label, value]) => (
                            <div key={label as string}>
                              <span className="text-muted-foreground">{label}:</span>{' '}
                              <span className="font-medium">{(value as string) || '—'}</span>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingDoc} onOpenChange={() => {
        if (viewingDoc?.url) URL.revokeObjectURL(viewingDoc.url);
        setViewingDoc(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          {viewingDoc && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {isImageFile(viewingDoc.name) ? (
                    <Image className="h-5 w-5 text-blue-500" />
                  ) : (
                    <FileText className="h-5 w-5 text-red-500" />
                  )}
                  {getDocLabel(viewingDoc.type)}
                </DialogTitle>
              </DialogHeader>
              <div className="mt-2 flex flex-col items-center">
                {isImageFile(viewingDoc.name) ? (
                  <img
                    src={viewingDoc.url}
                    alt={viewingDoc.name}
                    className="max-w-full max-h-[70vh] object-contain rounded-md"
                    data-testid="img-document-viewer"
                  />
                ) : viewingDoc.name.endsWith('.pdf') ? (
                  <iframe
                    src={viewingDoc.url}
                    className="w-full h-[70vh] rounded-md border"
                    title={viewingDoc.name}
                    data-testid="iframe-document-viewer"
                  />
                ) : (
                  <div className="text-center py-8">
                    <File className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">Cannot preview this file type</p>
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" asChild>
                    <a href={viewingDoc.url} target="_blank" rel="noopener noreferrer" data-testid="button-open-new-tab">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open in New Tab
                    </a>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={viewingDoc.url} download={viewingDoc.name} data-testid="button-download-file">
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}