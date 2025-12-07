import { useState } from 'react';
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
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/AuthContext';
import type { DriverApplication } from '@shared/schema';
import { format } from 'date-fns';

export default function AdminApplications() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApplication, setSelectedApplication] = useState<DriverApplication | null>(null);
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
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
      rejectionReason 
    }: { 
      id: string; 
      status: 'approved' | 'rejected'; 
      reviewNotes?: string;
      rejectionReason?: string;
    }) => {
      const response = await apiRequest("PATCH", `/api/driver-applications/${id}/review`, {
        status,
        reviewedBy: user?.id || 'admin',
        reviewNotes,
        rejectionReason,
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-applications'] });
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
    },
    onError: () => {
      toast({ title: 'Failed to update application', variant: 'destructive' });
    },
  });

  const pendingApplications = applications?.filter(a => a.status === 'pending') || [];
  const approvedApplications = applications?.filter(a => a.status === 'approved') || [];
  const rejectedApplications = applications?.filter(a => a.status === 'rejected') || [];

  const filteredApplications = (status: 'pending' | 'approved' | 'rejected') => {
    const list = status === 'pending' 
      ? pendingApplications 
      : status === 'approved' 
        ? approvedApplications 
        : rejectedApplications;
    
    if (!searchQuery) return list;
    
    const searchLower = searchQuery.toLowerCase();
    return list.filter(app => 
      app.fullName.toLowerCase().includes(searchLower) ||
      app.email.toLowerCase().includes(searchLower) ||
      app.phone.includes(searchLower)
    );
  };

  const handleApprove = () => {
    if (!selectedApplication) return;
    reviewApplicationMutation.mutate({
      id: selectedApplication.id,
      status: 'approved',
      reviewNotes,
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="border-green-500 text-green-600"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="border-red-500 text-red-600"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const DocumentLink = ({ url, label }: { url: string | null; label: string }) => {
    if (!url) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          {label}: Not provided
        </div>
      );
    }
    return (
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-primary hover:underline"
      >
        <FileText className="h-4 w-4" />
        {label}
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  };

  const ApplicationRow = ({ application }: { application: DriverApplication }) => (
    <TableRow key={application.id} data-testid={`row-application-${application.id}`}>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar>
            {application.profilePictureUrl ? (
              <AvatarImage src={application.profilePictureUrl} alt={application.fullName} />
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
      </TableCell>
      <TableCell>
        {application.submittedAt && format(new Date(application.submittedAt), 'dd MMM yyyy')}
      </TableCell>
      <TableCell>{getStatusBadge(application.status)}</TableCell>
      <TableCell>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setSelectedApplication(application);
            setIsReviewDialogOpen(true);
          }}
          data-testid={`button-view-application-${application.id}`}
        >
          <Eye className="h-4 w-4 mr-1" />
          View
        </Button>
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

        <div className="grid gap-4 md:grid-cols-3">
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
              </TabsList>

              {(['pending', 'approved', 'rejected'] as const).map((status) => (
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
                    </h3>
                    <div className="space-y-2">
                      <DocumentLink url={selectedApplication.profilePictureUrl} label="Profile Picture" />
                      <DocumentLink url={selectedApplication.drivingLicenceFrontUrl} label="Driving Licence (Front)" />
                      <DocumentLink url={selectedApplication.drivingLicenceBackUrl} label="Driving Licence (Back)" />
                      <DocumentLink url={selectedApplication.dbsCertificateUrl} label="DBS Certificate" />
                      <DocumentLink url={selectedApplication.goodsInTransitInsuranceUrl} label="Goods in Transit Insurance" />
                      <DocumentLink url={selectedApplication.hireAndRewardUrl} label="Hire & Reward Insurance" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                      <Truck className="h-4 w-4" />
                      Vehicle
                    </h3>
                    <p className="capitalize">{selectedApplication.vehicleType.replace('_', ' ')}</p>
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
              </div>

              <DialogFooter>
                {selectedApplication.status === 'pending' ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setIsReviewDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleReject}
                      disabled={reviewApplicationMutation.isPending}
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
                      disabled={reviewApplicationMutation.isPending}
                      data-testid="button-approve-application"
                    >
                      {reviewApplicationMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Approve
                    </Button>
                  </>
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
    </DashboardLayout>
  );
}
