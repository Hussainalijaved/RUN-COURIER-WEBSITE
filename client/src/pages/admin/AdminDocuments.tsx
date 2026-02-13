import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, LoadingTimeout } from '@/components/ErrorState';
import { normalizeDocUrl } from '@/lib/utils';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { FileText, CheckCircle, XCircle, Clock, Eye, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeDocuments } from '@/hooks/useRealtimeDocuments';
import type { Document, Driver, DriverApplication } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

export default function AdminDocuments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  useRealtimeDocuments();

  const { data: documents, isLoading: docsLoading, isError: docsError, refetch: refetchDocs } = useQuery<Document[]>({
    queryKey: ['/api/documents'],
    retry: 2,
    retryDelay: 1000,
  });
  
  // Loading timeout detection
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (docsLoading) {
      timer = setTimeout(() => setLoadingTooLong(true), 10000);
    } else {
      setLoadingTooLong(false);
    }
    return () => clearTimeout(timer);
  }, [docsLoading]);

  const { data: drivers } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
  });

  const { data: applications } = useQuery<DriverApplication[]>({
    queryKey: ['/api/driver-applications'],
  });

  const reviewDocumentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      return apiRequest('PATCH', `/api/documents/${id}/review`, { 
        status, 
        reviewedBy: 'admin',
        reviewNotes: status === 'rejected' ? 'Rejected by admin' : null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      // Also invalidate Supabase queries used by dashboard
      queryClient.invalidateQueries({ queryKey: ['supabase', 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
      toast({ title: 'Document reviewed successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to review document', variant: 'destructive' });
    },
  });

  const getDriverName = (driverId: string) => {
    // First check registered drivers
    const driver = drivers?.find(d => d.id === driverId);
    if (driver?.fullName) return driver.fullName;
    
    // Then check driver applications
    const application = applications?.find(a => a.id === driverId);
    if (application?.fullName) return `${application.fullName} (Applicant)`;
    
    // Format the ID for display if not found
    if (driverId.startsWith('application-')) {
      return `Pending Application`;
    }
    
    // Return formatted driver ID
    return driverId.length > 20 ? `Driver: ${driverId.substring(0, 8)}...` : `Driver: ${driverId}`;
  };

  const getDocTypeName = (type: string) => {
    const names: Record<string, string> = {
      id_passport: 'ID / Passport',
      driving_licence: 'Driving Licence',
      driving_license: 'Driving Licence',
      driving_licence_front: 'Driving Licence (Front)',
      driving_licence_back: 'Driving Licence (Back)',
      driving_license_front: 'Driving Licence (Front)',
      driving_license_back: 'Driving Licence (Back)',
      drivingLicenceFront: 'Driving Licence (Front)',
      drivingLicenceBack: 'Driving Licence (Back)',
      right_to_work: 'Right to Work',
      share_code: 'Right to Work Share Code',
      vehicle_photo: 'Vehicle Photo',
      vehicle_photo_front: 'Vehicle Photo (Front)',
      vehicle_photo_back: 'Vehicle Photo (Back)',
      vehicle_photo_left: 'Vehicle Photo (Left)',
      vehicle_photo_right: 'Vehicle Photo (Right)',
      vehicle_photo_load_space: 'Vehicle Photo (Load Space)',
      vehicle_photos_front: 'Vehicle Photo (Front)',
      vehicle_photos_back: 'Vehicle Photo (Back)',
      vehicle_photos_left: 'Vehicle Photo (Left)',
      vehicle_photos_right: 'Vehicle Photo (Right)',
      vehicle_photos_load: 'Vehicle Photo (Load Space)',
      insurance: 'Insurance',
      goods_in_transit: 'Goods in Transit Insurance',
      goods_in_transit_insurance: 'Goods in Transit Insurance',
      goodsInTransitInsurance: 'Goods in Transit Insurance',
      hire_reward: 'Hire & Reward Insurance',
      hire_and_reward: 'Hire & Reward Insurance',
      hire_and_reward_insurance: 'Hire & Reward Insurance',
      hireAndReward: 'Hire & Reward Insurance',
      proof_of_identity: 'Proof of Identity',
      proof_of_address: 'Proof of Address',
      profile_picture: 'Profile Picture',
      profilePicture: 'Profile Picture',
      dbs_certificate: 'DBS Certificate',
      dbsCertificate: 'DBS Certificate',
    };
    return names[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500"><CheckCircle className="mr-1 h-3 w-3" />Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500"><XCircle className="mr-1 h-3 w-3" />Rejected</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const pendingDocs = documents?.filter(d => d.status === 'pending') || [];
  const approvedDocs = documents?.filter(d => d.status === 'approved') || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Document Review</h1>
          <p className="text-muted-foreground">Review and approve driver documents</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Pending Documents ({pendingDocs.length})
            </CardTitle>
            <CardDescription>Documents awaiting approval or rejection</CardDescription>
          </CardHeader>
          <CardContent>
            {docsError ? (
              <ErrorState 
                title="Failed to load documents"
                message="We couldn't fetch the document list. Please check your connection and try again."
                onRetry={() => refetchDocs()}
              />
            ) : docsLoading ? (
              <div className="space-y-4">
                {loadingTooLong && (
                  <LoadingTimeout 
                    message="Loading is taking longer than expected. Please wait or try refreshing."
                    onRetry={() => refetchDocs()}
                  />
                )}
                <Skeleton className="h-96 w-full" />
              </div>
            ) : pendingDocs.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>File Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingDocs.map((doc) => (
                      <TableRow key={doc.id} data-testid={`row-document-${doc.id}`}>
                        <TableCell className="font-medium">{getDriverName(doc.driverId)}</TableCell>
                        <TableCell>{getDocTypeName(doc.type)}</TableCell>
                        <TableCell className="text-sm">{doc.fileName}</TableCell>
                        <TableCell>{getStatusBadge(doc.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedDoc(doc);
                                setViewDialogOpen(true);
                              }}
                              data-testid={`button-view-${doc.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600"
                              onClick={() => reviewDocumentMutation.mutate({ id: doc.id, status: 'approved' })}
                              disabled={reviewDocumentMutation.isPending}
                              data-testid={`button-approve-${doc.id}`}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => reviewDocumentMutation.mutate({ id: doc.id, status: 'rejected' })}
                              disabled={reviewDocumentMutation.isPending}
                              data-testid={`button-reject-${doc.id}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-muted-foreground">All documents have been reviewed</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Approved Documents ({approvedDocs.length})
            </CardTitle>
            <CardDescription>Re-review or change approval status</CardDescription>
          </CardHeader>
          <CardContent>
            {docsLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : approvedDocs.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Document Type</TableHead>
                      <TableHead>File Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvedDocs.map((doc) => (
                      <TableRow key={doc.id} data-testid={`row-approved-document-${doc.id}`}>
                        <TableCell className="font-medium">{getDriverName(doc.driverId)}</TableCell>
                        <TableCell>{getDocTypeName(doc.type)}</TableCell>
                        <TableCell className="text-sm">{doc.fileName}</TableCell>
                        <TableCell>{getStatusBadge(doc.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedDoc(doc);
                                setViewDialogOpen(true);
                              }}
                              data-testid={`button-view-approved-${doc.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => reviewDocumentMutation.mutate({ id: doc.id, status: 'rejected' })}
                              disabled={reviewDocumentMutation.isPending}
                              data-testid={`button-reject-approved-${doc.id}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-muted-foreground">No approved documents to review</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-3xl max-h-screen overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Preview Document</DialogTitle>
              <DialogDescription>View and manage document details</DialogDescription>
            </DialogHeader>
            {selectedDoc && (
              <div className="space-y-4">
                <div className="border-b border-border pb-4">
                  <div className="space-y-2">
                    <div><strong>Driver:</strong> {getDriverName(selectedDoc.driverId)}</div>
                    <div><strong>Type:</strong> {getDocTypeName(selectedDoc.type)}</div>
                    <div><strong>File:</strong> {selectedDoc.fileName}</div>
                  </div>
                </div>
                <div>
                  {(() => {
                    const docUrl = normalizeDocUrl(selectedDoc.fileUrl);
                    if (docUrl.toLowerCase().endsWith('.pdf')) {
                      return (
                        <iframe
                          src={docUrl}
                          className="w-full h-96 border rounded"
                          title="Document Preview"
                          data-testid="iframe-document-preview"
                        />
                      );
                    } else if (docUrl.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                      return (
                        <img
                          src={docUrl}
                          alt="Document Preview"
                          className="max-w-full h-auto max-h-96 rounded border"
                          data-testid="img-document-preview"
                        />
                      );
                    } else {
                      return (
                        <div className="flex flex-col items-center justify-center h-48 bg-muted rounded">
                          <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                          <p className="text-muted-foreground">Preview not available for this file type</p>
                          <a
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-4 text-primary hover:underline"
                            data-testid="link-document-open"
                          >
                            Open in new tab
                          </a>
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>
            )}
            <DialogFooter>
              {selectedDoc && (
                <div className="flex gap-2 w-full">
                  <Button
                    variant="outline"
                    className="text-green-600 flex-1"
                    onClick={() => {
                      reviewDocumentMutation.mutate({ id: selectedDoc.id, status: 'approved' });
                      setViewDialogOpen(false);
                    }}
                    disabled={reviewDocumentMutation.isPending}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="text-red-600 flex-1"
                    onClick={() => {
                      reviewDocumentMutation.mutate({ id: selectedDoc.id, status: 'rejected' });
                      setViewDialogOpen(false);
                    }}
                    disabled={reviewDocumentMutation.isPending}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                  <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                    <X className="mr-2 h-4 w-4" />
                    Close
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
