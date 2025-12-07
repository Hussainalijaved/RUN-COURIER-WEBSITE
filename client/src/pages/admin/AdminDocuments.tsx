import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileText, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { Document, Driver } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

export default function AdminDocuments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents, isLoading: docsLoading } = useQuery<Document[]>({
    queryKey: ['/api/documents'],
  });

  const { data: drivers } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
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
      toast({ title: 'Document reviewed successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to review document', variant: 'destructive' });
    },
  });

  const getDriverName = (driverId: string) => {
    return drivers?.find(d => d.id === driverId)?.fullName || 'Unknown Driver';
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
            {docsLoading ? (
              <Skeleton className="h-96 w-full" />
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
                        <TableCell className="capitalize">{doc.type.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-sm">{doc.fileName}</TableCell>
                        <TableCell>{getStatusBadge(doc.status)}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
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
              All Documents
            </CardTitle>
            <CardDescription>Complete document history</CardDescription>
          </CardHeader>
          <CardContent>
            {docsLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : documents && documents.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Driver</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reviewed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id} data-testid={`row-all-doc-${doc.id}`}>
                        <TableCell className="font-medium">{getDriverName(doc.driverId)}</TableCell>
                        <TableCell className="capitalize text-sm">{doc.type.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-sm">{doc.fileName}</TableCell>
                        <TableCell>{getStatusBadge(doc.status)}</TableCell>
                        <TableCell className="text-sm">{doc.reviewedBy || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No documents found</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
