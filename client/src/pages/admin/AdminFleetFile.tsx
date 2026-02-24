import { useState } from 'react';
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
  ChevronRight,
  Eye,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface FleetStatus {
  lastSync: {
    syncedAt: string;
    totalDrivers: number;
    totalApplications: number;
    totalDocuments: number;
  } | null;
  syncLog: Array<{
    timestamp: string;
    drivers: number;
    applications: number;
    documents: number;
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
}

export default function AdminFleetFile() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<DriverDetail | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: status, isLoading: statusLoading } = useQuery<FleetStatus>({
    queryKey: ['/api/admin/fleet-file/status'],
  });

  const { data: fleetData, isLoading: dataLoading } = useQuery<FleetDriverData>({
    queryKey: ['/api/admin/fleet-file/drivers'],
    enabled: !!status?.lastSync,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/admin/fleet-file/sync');
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fleet-file/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/fleet-file/drivers'] });
      toast({
        title: 'Fleet File synced',
        description: `${data.drivers} drivers, ${data.applications} applications, ${data.documents} documents saved`,
      });
    },
    onError: () => {
      toast({ title: 'Sync failed', variant: 'destructive' });
    },
  });

  const fetchDriverDetail = async (driverCode: string) => {
    try {
      const res = await fetch(`/api/admin/fleet-file/driver/${driverCode}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedDriver(data);
        setDetailDialogOpen(true);
      }
    } catch {
      toast({ title: 'Failed to load driver details', variant: 'destructive' });
    }
  };

  const handleDownload = () => {
    window.open('/api/admin/fleet-file/download', '_blank');
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
    return (fleetData?.documents || []).filter((d: any) => d.driver_id === driverId).length;
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
            <p className="text-muted-foreground">Local backup of all driver data, applications and documents</p>
          </div>
          <div className="flex gap-2">
            {status?.lastSync && (
              <Button
                variant="outline"
                onClick={handleDownload}
                data-testid="button-download"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Backup
              </Button>
            )}
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync"
            >
              {syncMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
            </Button>
          </div>
        </div>

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
                  <p className="text-xs text-muted-foreground">Click Sync Now to create backup</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-drivers-backed">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Drivers Backed Up</CardTitle>
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

          <Card data-testid="card-apps-backed">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Applications Saved</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statusLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{status?.lastSync?.totalApplications || 0}</div>
                  <p className="text-xs text-muted-foreground">all submissions backed up</p>
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
                  <p className="text-xs text-muted-foreground">{status?.lastSync?.totalDocuments || 0} document records</p>
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
                <p className="font-medium text-sm">Backup Protection</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Fleet File saves a complete copy of all driver profiles, applications, bank details, and document records 
                  locally on your server. This backup is independent from Supabase and will be stored on your Hostinger hosting. 
                  Click "Sync Now" regularly to keep the backup up to date.
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
                      <TableHead>Documents</TableHead>
                      <TableHead>Application</TableHead>
                      <TableHead>View</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDrivers.map((driver: any) => {
                      const docCount = getDriverDocCount(driver.id);
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
                              <File className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{docCount}</span>
                            </div>
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
                    <TableHead>Documents</TableHead>
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
                      <TableCell><span className="font-medium">{log.documents}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedDriver && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  {selectedDriver.driver?.full_name || 'Driver'} — Fleet File
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <Accordion type="multiple" defaultValue={['profile', 'documents']} className="w-full">
                  <AccordionItem value="profile">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Driver Profile
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
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
                            ['British', selectedDriver.application.is_british ? 'Yes' : 'No'],
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
                        {(selectedDriver.application.driving_licence_front_url ||
                          selectedDriver.application.driving_licence_back_url ||
                          selectedDriver.application.dbs_certificate_url ||
                          selectedDriver.application.goods_in_transit_insurance_url ||
                          selectedDriver.application.hire_and_reward_url ||
                          selectedDriver.application.profile_picture_url) && (
                          <div className="mt-4">
                            <p className="text-sm font-medium mb-2">Application Document URLs</p>
                            <div className="space-y-1 text-xs font-mono break-all">
                              {[
                                ['Profile Picture', selectedDriver.application.profile_picture_url],
                                ['Driving Licence Front', selectedDriver.application.driving_licence_front_url],
                                ['Driving Licence Back', selectedDriver.application.driving_licence_back_url],
                                ['DBS Certificate', selectedDriver.application.dbs_certificate_url],
                                ['Goods in Transit', selectedDriver.application.goods_in_transit_insurance_url],
                                ['Hire & Reward', selectedDriver.application.hire_and_reward_url],
                              ]
                                .filter(([, url]) => url)
                                .map(([label, url]) => (
                                  <div key={label as string} className="p-2 bg-muted rounded">
                                    <span className="text-muted-foreground">{label}:</span>
                                    <br />
                                    <a href={url as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                      {url as string}
                                    </a>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  <AccordionItem value="documents">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2">
                        <File className="h-4 w-4" />
                        Documents ({selectedDriver.documentCount})
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {selectedDriver.documents.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Type</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Bucket</TableHead>
                              <TableHead>Storage Path</TableHead>
                              <TableHead>Uploaded</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedDriver.documents.map((doc: any) => (
                              <TableRow key={doc.id}>
                                <TableCell>
                                  <span className="font-medium text-sm">{(doc.doc_type || '').replace(/_/g, ' ')}</span>
                                </TableCell>
                                <TableCell>
                                  {doc.status === 'approved' ? (
                                    <Badge variant="outline" className="text-green-600 border-green-600">Approved</Badge>
                                  ) : doc.status === 'rejected' ? (
                                    <Badge variant="outline" className="text-red-600 border-red-600">Rejected</Badge>
                                  ) : (
                                    <Badge variant="outline">{doc.status || 'pending'}</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <span className="text-xs font-mono">{doc.bucket || '—'}</span>
                                </TableCell>
                                <TableCell>
                                  <span className="text-xs font-mono break-all max-w-[200px] block truncate">{doc.storage_path || doc.file_url || '—'}</span>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm">{formatDate(doc.uploaded_at || doc.created_at)}</span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-sm text-muted-foreground py-4 text-center">No documents found</p>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
