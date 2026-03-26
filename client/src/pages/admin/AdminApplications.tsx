import { useState, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  User,
  Truck,
  CreditCard,
  ExternalLink,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Upload,
  Mail,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { DriverApplication } from '@shared/schema';
import { format } from 'date-fns';

export default function AdminApplications() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApplication, setSelectedApplication] = useState<DriverApplication | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [documentStatuses, setDocumentStatuses] = useState<Record<string, 'approved' | 'rejected' | 'pending'>>({});
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [fileAvailability, setFileAvailability] = useState<Record<string, boolean>>({});
  const [fileCheckDone, setFileCheckDone] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailTarget, setEmailTarget] = useState<DriverApplication | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [migrationSqlOpen, setMigrationSqlOpen] = useState(false);
  const [migrationSql, setMigrationSql] = useState('');
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: applications, isLoading } = useQuery<DriverApplication[]>({
    queryKey: ['/api/driver-applications'],
  });

  const reviewApplicationMutation = useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      reviewNotes, 
      rejectionReason,
      documentStatuses,
    }: { 
      id: string; 
      status: 'approved' | 'rejected'; 
      reviewNotes?: string;
      rejectionReason?: string;
      documentStatuses?: Record<string, 'approved' | 'rejected'>;
    }) => {
      const response = await apiRequest("PATCH", `/api/driver-applications/${id}/review`, {
        status,
        reviewedBy: user?.id || 'admin',
        reviewNotes,
        rejectionReason,
        documentStatuses,
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-applications'] });
      // Also invalidate Supabase queries used by dashboard
      queryClient.invalidateQueries({ queryKey: ['supabase', 'driver-applications'] });
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
      toast({ 
        title: variables.status === 'approved' ? 'Application Approved' : 'Application Rejected',
        description: variables.status === 'approved' 
          ? 'The driver will receive their login credentials via email.'
          : 'The applicant will be notified of the rejection.',
      });
      setIsReviewDialogOpen(false);
      setSelectedApplication(null);
      setReviewNotes('');
      setRejectionReason('');
      setDocumentStatuses({});
    },
    onError: (err: any) => {
      if (err.code === 'VEHICLE_TYPE_CONSTRAINT') {
        showMigrationSql();
      } else {
        toast({ title: 'Failed to update application', variant: 'destructive' });
      }
    },
  });

  const sendBackMutation = useMutation({
    mutationFn: async ({ id, adminFeedback }: { id: string; adminFeedback: string }) => {
      const response = await apiRequest("PATCH", `/api/driver-applications/${id}/send-back`, {
        adminFeedback,
        reviewedBy: user?.id || 'admin',
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-applications'] });
      toast({ 
        title: 'Application Sent Back',
        description: 'The driver will be notified to make corrections and resubmit.',
      });
      setIsReviewDialogOpen(false);
      setSelectedApplication(null);
      setReviewNotes('');
      setRejectionReason('');
      setDocumentStatuses({});
    },
    onError: () => {
      toast({ title: 'Failed to send back application', variant: 'destructive' });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      const response = await apiRequest("POST", `/api/driver-applications/${id}/email`, { message });
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: 'Email Sent',
        description: 'The driver has been emailed about the missing documents.',
      });
      setEmailDialogOpen(false);
      setEmailMessage('');
      setEmailTarget(null);
    },
    onError: () => {
      toast({ title: 'Failed to send email', variant: 'destructive' });
    },
  });

  const deleteApplicationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/driver-applications/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-applications'] });
      toast({ 
        title: 'Application Deleted',
        description: 'The applicant can now reapply with the same email.',
      });
      setIsReviewDialogOpen(false);
      setSelectedApplication(null);
    },
    onError: () => {
      toast({ title: 'Failed to delete application', variant: 'destructive' });
    },
  });

  const resendApprovalMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      setResendingId(applicationId);
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/driver-applications/${applicationId}/resend-approval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resend approval email');
      }
      return response.json();
    },
    onSuccess: () => {
      setResendingId(null);
      toast({
        title: 'Email Sent',
        description: 'The approval email with new login credentials has been resent.',
      });
    },
    onError: (error: Error) => {
      setResendingId(null);
      toast({
        title: 'Failed to Resend',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const showMigrationSql = async () => {
    try {
      const res = await apiRequest('GET', '/api/admin/vehicle-migration-sql');
      setMigrationSql(await res.text());
    } catch {
      setMigrationSql('-- Could not load SQL. Please visit /api/admin/vehicle-migration-sql directly.');
    }
    setMigrationSqlOpen(true);
  };

  const updateVehicleMutation = useMutation({
    mutationFn: async ({ id, vehicleType, vehicleRegistration }: { id: string; vehicleType: string; vehicleRegistration?: string }) => {
      const response = await apiRequest("PATCH", `/api/driver-applications/${id}`, { vehicleType, vehicleRegistration });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-applications'] });
      toast({ title: 'Vehicle updated', description: 'Vehicle type has been updated successfully.' });
      if (selectedApplication) {
        setSelectedApplication({ ...selectedApplication, vehicleType: data.vehicleType, vehicleRegistration: data.vehicleRegistration });
      }
    },
    onError: (err: any) => {
      if (err.code === 'VEHICLE_TYPE_CONSTRAINT') {
        showMigrationSql();
      } else {
        toast({ title: 'Failed to update vehicle type', variant: 'destructive' });
      }
    },
  });

  const handleDocumentUpload = async (documentField: string, file: File) => {
    if (!selectedApplication) return;
    setUploadingDoc(documentField);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentField', documentField);

      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
      
      const response = await fetch(`/api/driver-applications/${selectedApplication.id}/upload-document`, {
        method: 'POST',
        body: formData,
        headers,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      const result = await response.json();
      
      setSelectedApplication(prev => prev ? { ...prev, [documentField]: result.fileUrl } : null);
      
      queryClient.invalidateQueries({ queryKey: ['/api/driver-applications'] });
      
      toast({
        title: 'Document uploaded',
        description: `${documentFields.find(d => d.key === documentField)?.label || 'Document'} has been replaced successfully.`,
      });
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: err.message || 'Failed to upload document',
        variant: 'destructive',
      });
    } finally {
      setUploadingDoc(null);
    }
  };

  const pendingApplications = applications?.filter(a => a.status === 'pending') || [];
  const approvedApplications = applications?.filter(a => a.status === 'approved') || [];
  const rejectedApplications = applications?.filter(a => a.status === 'rejected') || [];
  const correctionsApplications = applications?.filter(a => a.status === 'corrections_needed') || [];

  const filteredApplications = (status: string) => {
    const list = status === 'pending' 
      ? pendingApplications 
      : status === 'approved' 
        ? approvedApplications 
        : status === 'corrections_needed'
          ? correctionsApplications
          : rejectedApplications;
    
    if (!searchQuery) return list;
    
    const searchLower = searchQuery.toLowerCase();
    return list.filter(app => 
      app.fullName.toLowerCase().includes(searchLower) ||
      app.email.toLowerCase().includes(searchLower) ||
      app.phone.includes(searchLower)
    );
  };

  const initializeDocumentStatuses = () => {
    const statuses: Record<string, 'approved' | 'rejected' | 'pending'> = {};
    documentFields.forEach(doc => {
      statuses[doc.key] = 'pending';
    });
    setDocumentStatuses(statuses);
  };

  const allDocsReviewed = () => {
    const providedDocs = documentFields.filter(
      d => selectedApplication && (selectedApplication as any)[d.key]
    );
    return providedDocs.length > 0 && providedDocs.every(
      d => documentStatuses[d.key] === 'approved' || documentStatuses[d.key] === 'rejected'
    );
  };

  const handleApprove = () => {
    if (!selectedApplication) return;
    const finalDocStatuses: Record<string, 'approved' | 'rejected'> = {};
    Object.entries(documentStatuses).forEach(([key, value]) => {
      if (value === 'approved' || value === 'rejected') {
        finalDocStatuses[key] = value;
      }
    });
    reviewApplicationMutation.mutate({
      id: selectedApplication.id,
      status: 'approved',
      reviewNotes,
      documentStatuses: finalDocStatuses,
    });
  };

  const handleReject = () => {
    if (!selectedApplication) return;
    if (!rejectionReason.trim()) {
      toast({
        title: 'Rejection reason required',
        description: 'Please provide a reason for rejecting this application.',
        variant: 'destructive',
      });
      return;
    }
    reviewApplicationMutation.mutate({
      id: selectedApplication.id,
      status: 'rejected',
      reviewNotes,
      rejectionReason,
    });
  };

  const handleSendBack = () => {
    if (!selectedApplication) return;
    if (!reviewNotes.trim()) {
      toast({
        title: 'Feedback required',
        description: 'Please describe what needs to be corrected before sending back.',
        variant: 'destructive',
      });
      return;
    }
    sendBackMutation.mutate({
      id: selectedApplication.id,
      adminFeedback: reviewNotes,
    });
  };

  const handleDeleteApplication = (id: string) => {
    deleteApplicationMutation.mutate(id);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="border-green-500 text-green-600"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="border-red-500 text-red-600"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      case 'corrections_needed':
        return <Badge variant="outline" className="border-orange-500 text-orange-600"><AlertCircle className="h-3 w-3 mr-1" /> Corrections Needed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const documentFields = [
    { key: 'profilePictureUrl', fieldKey: 'profilePicture', label: 'Profile Picture' },
    { key: 'drivingLicenceFrontUrl', fieldKey: 'drivingLicenceFront', label: 'Driving Licence (Front)' },
    { key: 'drivingLicenceBackUrl', fieldKey: 'drivingLicenceBack', label: 'Driving Licence (Back)' },
    { key: 'dbsCertificateUrl', fieldKey: 'dbsCertificate', label: 'DBS Certificate' },
    { key: 'goodsInTransitInsuranceUrl', fieldKey: 'goodsInTransitInsurance', label: 'Goods in Transit Insurance' },
    { key: 'hireAndRewardUrl', fieldKey: 'hireAndReward', label: 'Hire & Reward Insurance' },
  ];

  useEffect(() => {
    if (!selectedApplication || !isReviewDialogOpen) return;
    // Documents are served via proxy endpoint — no local file check needed
    setFileAvailability({});
    setFileCheckDone(true);
  }, [selectedApplication, isReviewDialogOpen]);

  const renderDocumentLink = (appId: string, fieldKey: string, rawStoragePath: string | null, label: string) => {
    if (!rawStoragePath) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid={`doc-status-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}>
          <AlertCircle className="h-4 w-4" />
          {label}: Not provided
        </div>
      );
    }

    // All documents route through the proxy endpoint which signs + streams from Supabase
    const proxyUrl = `/api/application-document/${appId}/${fieldKey}`;

    // Detect type from the raw storage path / original filename
    const isPdf = /\.pdf(\?|$)/i.test(rawStoragePath);
    const isImage = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(rawStoragePath);

    return (
      <div className="flex flex-col gap-1">
        <a 
          href={proxyUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-primary hover:underline"
          data-testid={`link-document-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
        >
          <FileText className="h-4 w-4" />
          {label}
          <ExternalLink className="h-3 w-3" />
        </a>
        {isImage && (
          <img 
            src={proxyUrl} 
            alt={label} 
            className="mt-1 max-h-32 max-w-48 rounded-md border object-cover cursor-pointer"
            onClick={() => window.open(proxyUrl, '_blank')}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            data-testid={`img-document-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
          />
        )}
        {isPdf && (
          <iframe
            src={proxyUrl}
            className="mt-1 w-full h-48 rounded border"
            title={label}
            data-testid={`iframe-pdf-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
          />
        )}
        {!isImage && !isPdf && (
          <span className="text-xs text-muted-foreground">Click link above to view</span>
        )}
      </div>
    );
  };

  const ApplicationRow = ({ application }: { application: DriverApplication }) => (
    <TableRow key={application.id} data-testid={`row-application-${application.id}`}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar>
            {application.profilePictureUrl ? (
              <AvatarImage src={resolveDocUrl(application.profilePictureUrl)} alt={application.fullName} />
            ) : null}
            <AvatarFallback>
              {application.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{application.fullName}</div>
            <div className="text-sm text-muted-foreground">{application.email}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>{application.phone}</TableCell>
      <TableCell>
        <span className="capitalize">{application.vehicleType.replace('_', ' ')}</span>
        {application.vehicleRegistration && (
          <span className="text-muted-foreground ml-1">({application.vehicleRegistration})</span>
        )}
      </TableCell>
      <TableCell>
        {application.submittedAt && format(new Date(application.submittedAt), 'dd MMM yyyy')}
      </TableCell>
      <TableCell>{getStatusBadge(application.status)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSelectedApplication(application);
              setIsReviewDialogOpen(true);
              if (application.status === 'pending') {
                const statuses: Record<string, 'approved' | 'rejected' | 'pending'> = {};
                documentFields.forEach(doc => {
                  statuses[doc.key] = 'pending';
                });
                setDocumentStatuses(statuses);
              }
            }}
            data-testid={`button-view-application-${application.id}`}
          >
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
          {application.status === 'approved' && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                if (resendingId) return;
                resendApprovalMutation.mutate(application.id);
              }}
              disabled={resendingId !== null}
              data-testid={`button-resend-approval-${application.id}`}
            >
              {resendingId === application.id ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Mail className="h-4 w-4 mr-1" />
              )}
              Resend Email
            </Button>
          )}
          {(application.status === 'rejected' || application.status === 'corrections_needed') && (
            <Button
              size="sm"
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this application? The applicant will be able to reapply with the same email.')) {
                  handleDeleteApplication(application.id);
                }
              }}
              disabled={deleteApplicationMutation.isPending}
              data-testid={`button-delete-application-${application.id}`}
            >
              {deleteApplicationMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              Delete
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Driver Applications</h1>
          <p className="text-muted-foreground">Review and manage driver applications</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Link href="/admin/applications?status=pending">
            <Card 
              className="cursor-pointer transition-all duration-200 hover-elevate" 
              data-testid="stat-pending-applications"
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    {isLoading ? (
                      <Skeleton className="h-8 w-12" />
                    ) : (
                      <div className="text-2xl font-bold">{pendingApplications.length}</div>
                    )}
                    <p className="text-sm text-muted-foreground">Pending Review</p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/applications?status=approved">
            <Card 
              className="cursor-pointer transition-all duration-200 hover-elevate" 
              data-testid="stat-approved-applications"
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    {isLoading ? (
                      <Skeleton className="h-8 w-12" />
                    ) : (
                      <div className="text-2xl font-bold">{approvedApplications.length}</div>
                    )}
                    <p className="text-sm text-muted-foreground">Approved</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/applications?status=rejected">
            <Card 
              className="cursor-pointer transition-all duration-200 hover-elevate" 
              data-testid="stat-rejected-applications"
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    {isLoading ? (
                      <Skeleton className="h-8 w-12" />
                    ) : (
                      <div className="text-2xl font-bold">{rejectedApplications.length}</div>
                    )}
                    <p className="text-sm text-muted-foreground">Rejected</p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/applications?status=corrections_needed">
            <Card 
              className="cursor-pointer transition-all duration-200 hover-elevate" 
              data-testid="stat-corrections-applications"
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    {isLoading ? (
                      <Skeleton className="h-8 w-12" />
                    ) : (
                      <div className="text-2xl font-bold">{correctionsApplications.length}</div>
                    )}
                    <p className="text-sm text-muted-foreground">Corrections Needed</p>
                  </div>
                  <AlertCircle className="h-8 w-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <CardTitle>All Applications</CardTitle>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search applications..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-applications"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="pending">
              <TabsList className="mb-4">
                <TabsTrigger value="pending" data-testid="tab-pending">
                  Pending ({pendingApplications.length})
                </TabsTrigger>
                <TabsTrigger value="approved" data-testid="tab-approved">
                  Approved ({approvedApplications.length})
                </TabsTrigger>
                <TabsTrigger value="rejected" data-testid="tab-rejected">
                  Rejected ({rejectedApplications.length})
                </TabsTrigger>
                <TabsTrigger value="corrections_needed" data-testid="tab-corrections">
                  Corrections ({correctionsApplications.length})
                </TabsTrigger>
              </TabsList>

              {(['pending', 'approved', 'rejected', 'corrections_needed'] as const).map((status) => (
                <TabsContent key={status} value={status}>
                  {isLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : filteredApplications(status).length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No {status} applications found</p>
                    </div>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Applicant</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Vehicle</TableHead>
                            <TableHead>Submitted</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredApplications(status).map(app => (
                            <ApplicationRow key={app.id} application={app} />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedApplication && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Application Review
                  {getStatusBadge(selectedApplication.status)}
                </DialogTitle>
                <DialogDescription>
                  Review the application details and documents before making a decision.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                      <User className="h-4 w-4" />
                      Personal Information
                    </h3>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Full Name:</dt>
                        <dd className="font-medium">{selectedApplication.fullName}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Email:</dt>
                        <dd className="font-medium">{selectedApplication.email}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Phone:</dt>
                        <dd className="font-medium">{selectedApplication.phone}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Postcode:</dt>
                        <dd className="font-medium">{selectedApplication.postcode}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Address:</dt>
                        <dd className="font-medium text-right max-w-48 truncate">{selectedApplication.fullAddress}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Nationality:</dt>
                        <dd className="font-medium">{selectedApplication.nationality}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">British Citizen:</dt>
                        <dd className="font-medium">{selectedApplication.isBritish ? 'Yes' : 'No'}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">NI Number:</dt>
                        <dd className="font-medium">{selectedApplication.nationalInsuranceNumber}</dd>
                      </div>
                      {!selectedApplication.isBritish && selectedApplication.rightToWorkShareCode && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Right to Work Share Code:</dt>
                          <dd className="font-medium">{selectedApplication.rightToWorkShareCode}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                      <FileText className="h-4 w-4" />
                      Documents
                      {selectedApplication.status === 'pending' && Object.values(documentStatuses).length > 0 && Object.values(documentStatuses).every(s => s === 'approved') ? (
                        <Badge variant="outline" className="border-green-500 text-green-600 ml-auto">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          All Approved
                        </Badge>
                      ) : selectedApplication.status === 'pending' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto text-green-600"
                          onClick={() => {
                            const updated: Record<string, 'approved' | 'rejected' | 'pending'> = {};
                            documentFields.forEach(d => {
                              if ((selectedApplication as any)[d.key]) {
                                updated[d.key] = 'approved';
                              }
                            });
                            setDocumentStatuses(prev => ({ ...prev, ...updated }));
                          }}
                          data-testid="button-approve-all-docs"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Approve All
                        </Button>
                      ) : null}
                    </h3>
                    <div className="space-y-3">
                      {documentFields.map((doc, index) => {
                        const url = selectedApplication[doc.key as keyof DriverApplication] as string | null;
                        const docStatus = documentStatuses[doc.key] || 'pending';
                        const isPending = selectedApplication.status === 'pending';

                        return (
                          <div key={doc.key} className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              {renderDocumentLink(selectedApplication.id, doc.fieldKey, url, doc.label)}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {isPending && url && (
                                <>
                                  <Badge
                                    variant="outline"
                                    className={
                                      docStatus === 'approved'
                                        ? 'border-green-500 text-green-600'
                                        : docStatus === 'rejected'
                                          ? 'border-red-500 text-red-600'
                                          : 'border-yellow-500 text-yellow-600'
                                    }
                                    data-testid={`badge-doc-status-${index}`}
                                  >
                                    {docStatus === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                                    {docStatus === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                                    {docStatus === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                                    {docStatus.charAt(0).toUpperCase() + docStatus.slice(1)}
                                  </Badge>
                                  <Button
                                    size="icon"
                                    variant={docStatus === 'approved' ? 'default' : 'outline'}
                                    className={docStatus === 'approved' ? 'bg-green-600 text-white' : 'text-green-600'}
                                    onClick={() => setDocumentStatuses(prev => ({ ...prev, [doc.key]: 'approved' }))}
                                    data-testid={`button-doc-approve-${index}`}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant={docStatus === 'rejected' ? 'default' : 'outline'}
                                    className={docStatus === 'rejected' ? 'bg-red-600 text-white' : 'text-red-600'}
                                    onClick={() => setDocumentStatuses(prev => ({ ...prev, [doc.key]: 'rejected' }))}
                                    data-testid={`button-doc-reject-${index}`}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                className="hidden"
                                id={`doc-upload-${doc.key}`}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleDocumentUpload(doc.key, file);
                                  e.target.value = '';
                                }}
                                data-testid={`input-doc-upload-${index}`}
                              />
                              <Button
                                size="icon"
                                variant="outline"
                                disabled={uploadingDoc === doc.key}
                                onClick={() => document.getElementById(`doc-upload-${doc.key}`)?.click()}
                                data-testid={`button-doc-upload-${index}`}
                                title={url ? 'Replace document' : 'Upload document'}
                              >
                                {uploadingDoc === doc.key ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Upload className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                      <Truck className="h-4 w-4" />
                      Vehicle
                    </h3>
                    <div className="space-y-3 text-sm">
                      <div>
                        <Label className="text-muted-foreground text-xs">Type</Label>
                        <Select
                          value={selectedApplication.vehicleType}
                          onValueChange={(value) => {
                            updateVehicleMutation.mutate({
                              id: selectedApplication.id,
                              vehicleType: value,
                              vehicleRegistration: selectedApplication.vehicleRegistration || undefined,
                            });
                          }}
                          disabled={updateVehicleMutation.isPending}
                        >
                          <SelectTrigger data-testid="select-vehicle-type-edit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="motorbike">Motorbike</SelectItem>
                            <SelectItem value="car">Car</SelectItem>
                            <SelectItem value="small_van">Small Van</SelectItem>
                            <SelectItem value="medium_van">Medium Van</SelectItem>
                            <SelectItem value="lwb_van">LWB Van</SelectItem>
                            <SelectItem value="luton_van">Luton Van</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {selectedApplication.vehicleRegistration && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Registration:</dt>
                          <dd className="font-medium uppercase">{selectedApplication.vehicleRegistration}</dd>
                        </div>
                      )}
                      {selectedApplication.vehicleMake && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Make:</dt>
                          <dd className="font-medium">{selectedApplication.vehicleMake}</dd>
                        </div>
                      )}
                      {selectedApplication.vehicleModel && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Model:</dt>
                          <dd className="font-medium">{selectedApplication.vehicleModel}</dd>
                        </div>
                      )}
                      {selectedApplication.vehicleColor && (
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Colour:</dt>
                          <dd className="font-medium">{selectedApplication.vehicleColor}</dd>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                      <CreditCard className="h-4 w-4" />
                      Bank Details
                    </h3>
                    <dl className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Bank:</dt>
                        <dd className="font-medium">{selectedApplication.bankName}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Account Holder:</dt>
                        <dd className="font-medium">{selectedApplication.accountHolderName}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Sort Code:</dt>
                        <dd className="font-medium">{selectedApplication.sortCode}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Account Number:</dt>
                        <dd className="font-medium">****{selectedApplication.accountNumber.slice(-4)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                {selectedApplication.status === 'pending' && (
                  <div className="pt-4 border-t space-y-4">
                    <div>
                      <Label htmlFor="reviewNotes">Review Notes (optional)</Label>
                      <Textarea
                        id="reviewNotes"
                        placeholder="Add any notes about this application..."
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        className="mt-1"
                        data-testid="input-review-notes"
                      />
                    </div>
                    <div>
                      <Label htmlFor="rejectionReason">Rejection Reason (required if rejecting)</Label>
                      <Textarea
                        id="rejectionReason"
                        placeholder="Explain why this application is being rejected..."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="mt-1"
                        data-testid="input-rejection-reason"
                      />
                    </div>
                  </div>
                )}

                {selectedApplication.status !== 'pending' && selectedApplication.reviewNotes && (
                  <div className="pt-4 border-t">
                    <h3 className="font-semibold mb-2">Review Notes</h3>
                    <p className="text-sm text-muted-foreground">{selectedApplication.reviewNotes}</p>
                  </div>
                )}

                {selectedApplication.status === 'rejected' && selectedApplication.rejectionReason && (
                  <div className="pt-4 border-t">
                    <h3 className="font-semibold mb-2 text-red-600">Rejection Reason</h3>
                    <p className="text-sm text-muted-foreground">{selectedApplication.rejectionReason}</p>
                  </div>
                )}

                {selectedApplication.status === 'corrections_needed' && selectedApplication.reviewNotes && (
                  <div className="pt-4 border-t">
                    <h3 className="font-semibold mb-2 text-orange-600">Corrections Requested</h3>
                    <p className="text-sm text-muted-foreground">{selectedApplication.reviewNotes}</p>
                    {selectedApplication.reviewedAt && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Sent back on {format(new Date(selectedApplication.reviewedAt), 'dd MMM yyyy HH:mm')}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                {selectedApplication.status === 'pending' ? (
                  <div className="flex flex-wrap items-center gap-2 w-full justify-end">
                    <Button
                      variant="outline"
                      onClick={() => setIsReviewDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEmailTarget(selectedApplication);
                        setEmailDialogOpen(true);
                      }}
                      disabled={sendEmailMutation.isPending}
                      data-testid="button-email-driver"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Email Driver
                    </Button>
                    <Button
                      variant="outline"
                      className="border-orange-500 text-orange-600"
                      onClick={handleSendBack}
                      disabled={sendBackMutation.isPending || reviewApplicationMutation.isPending}
                      data-testid="button-send-back-application"
                    >
                      {sendBackMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <AlertCircle className="h-4 w-4 mr-2" />
                      )}
                      Send Back
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleReject}
                      disabled={reviewApplicationMutation.isPending || sendBackMutation.isPending}
                      data-testid="button-reject-application"
                    >
                      {reviewApplicationMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Reject
                    </Button>
                    <Button
                      onClick={handleApprove}
                      disabled={reviewApplicationMutation.isPending || sendBackMutation.isPending}
                      data-testid="button-approve-application"
                    >
                      {reviewApplicationMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Approve
                    </Button>
                  </div>
                ) : (selectedApplication.status === 'rejected' || selectedApplication.status === 'corrections_needed') ? (
                  <div className="flex flex-wrap items-center gap-2 w-full justify-end">
                    <Button onClick={() => setIsReviewDialogOpen(false)}>
                      Close
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (confirm('Delete this application? The applicant will be able to reapply with the same email.')) {
                          handleDeleteApplication(selectedApplication.id);
                        }
                      }}
                      disabled={deleteApplicationMutation.isPending}
                      data-testid="button-delete-application-action"
                    >
                      {deleteApplicationMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Delete Application
                    </Button>
                  </div>
                ) : (
                  <Button onClick={() => setIsReviewDialogOpen(false)}>
                    Close
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email Driver - Request Documents</DialogTitle>
            <DialogDescription>
              Send an email to {emailTarget?.fullName} ({emailTarget?.email}) requesting missing documents. This will not change the application status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="emailMessage">Message to Driver</Label>
              <Textarea
                id="emailMessage"
                placeholder={"Please upload the following missing documents:\n- Hire & Reward Insurance\n- Goods in Transit Insurance\n\nYou can reply to this email with the documents attached."}
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                className="mt-1 min-h-[150px]"
                data-testid="input-email-message"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (emailTarget && emailMessage.trim()) {
                  sendEmailMutation.mutate({ id: emailTarget.id, message: emailMessage });
                }
              }}
              disabled={sendEmailMutation.isPending || !emailMessage.trim()}
              data-testid="button-send-email"
            >
              {sendEmailMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vehicle Type Migration SQL Dialog */}
      <Dialog open={migrationSqlOpen} onOpenChange={setMigrationSqlOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Database Migration Required
            </DialogTitle>
            <DialogDescription>
              LWB Van and Luton Van vehicle types need a one-time update in your Supabase database.
              Copy the SQL below and run it in your <strong>Supabase SQL Editor</strong>, then try again.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <pre className="text-xs bg-muted rounded-md p-4 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
              {migrationSql}
            </pre>
          </div>
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setMigrationSqlOpen(false)}>Close</Button>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(migrationSql);
                toast({ title: 'SQL copied to clipboard' });
              }}
            >
              Copy SQL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
