import { useState, useEffect, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, LoadingTimeout } from '@/components/ErrorState';
import { normalizeDocUrl } from '@/lib/utils';
import { Input } from '@/components/ui/input';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { FileText, CheckCircle, XCircle, Clock, Eye, X, AlertTriangle, Trash2, ChevronRight, FolderOpen, Search, User } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeDocuments } from '@/hooks/useRealtimeDocuments';
import type { Document, Driver, DriverApplication } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

interface DriverGroup {
  driverId: string;
  driverName: string;
  docs: Document[];
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
}

export default function AdminDocuments() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [openDriverIds, setOpenDriverIds] = useState<Set<string>>(new Set());

  useRealtimeDocuments();

  useEffect(() => {
    if (!selectedDoc || !viewDialogOpen) {
      setPreviewUrl(null);
      setPreviewError(null);
      return;
    }
    
    const resolvePreview = async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const docAny = selectedDoc as any;
        if (docAny.signedUrl) {
          setPreviewUrl(docAny.signedUrl);
          setPreviewLoading(false);
          return;
        }
        if (selectedDoc.fileUrl?.startsWith('http')) {
          setPreviewUrl(selectedDoc.fileUrl);
          setPreviewLoading(false);
          return;
        }
        const response = await fetch(`/api/documents/${selectedDoc.id}/signed-url`);
        if (response.ok) {
          const data = await response.json();
          if (data.isText) {
            setPreviewUrl(null);
          } else {
            setPreviewUrl(data.signedUrl);
          }
        } else {
          setPreviewUrl(normalizeDocUrl(selectedDoc.fileUrl));
        }
      } catch (err) {
        console.error('Failed to get signed URL:', err);
        setPreviewUrl(normalizeDocUrl(selectedDoc.fileUrl));
        setPreviewError('Could not load document preview. The file may be missing or inaccessible.');
      } finally {
        setPreviewLoading(false);
      }
    };
    
    resolvePreview();
  }, [selectedDoc, viewDialogOpen]);

  const { data: documents, isLoading: docsLoading, isError: docsError, refetch: refetchDocs } = useQuery<Document[]>({
    queryKey: ['/api/documents'],
    retry: 2,
    retryDelay: 1000,
  });
  
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
      queryClient.invalidateQueries({ queryKey: ['supabase', 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
      toast({ title: 'Document reviewed successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to review document', variant: 'destructive' });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      queryClient.invalidateQueries({ queryKey: ['supabase', 'documents'] });
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
      toast({ title: 'Document deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete document', variant: 'destructive' });
    },
  });

  const getDriverName = (driverId: string) => {
    const driver = drivers?.find(d => d.id === driverId);
    if (driver?.fullName) return driver.fullName;
    const application = applications?.find(a => a.id === driverId);
    if (application?.fullName) return `${application.fullName} (Applicant)`;
    if (driverId.startsWith('application-')) return `Pending Application`;
    return driverId.length > 20 ? `Driver: ${driverId.substring(0, 8)}...` : `Driver: ${driverId}`;
  };

  const getDriverId = (driverId: string) => {
    const driver = drivers?.find(d => d.id === driverId);
    if (driver?.driverCode) return driver.driverCode;
    return null;
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
  const rejectedDocs = documents?.filter(d => d.status === 'rejected') || [];

  const driverGroups: DriverGroup[] = useMemo(() => {
    if (!documents) return [];
    const groupMap = new Map<string, Document[]>();
    for (const doc of documents) {
      const existing = groupMap.get(doc.driverId) || [];
      existing.push(doc);
      groupMap.set(doc.driverId, existing);
    }
    const groups: DriverGroup[] = [];
    const entries = Array.from(groupMap.entries());
    for (const [driverId, docs] of entries) {
      const name = getDriverName(driverId);
      if (searchQuery && !name.toLowerCase().includes(searchQuery.toLowerCase())) {
        continue;
      }
      groups.push({
        driverId,
        driverName: name,
        docs,
        pendingCount: docs.filter((d: Document) => d.status === 'pending').length,
        approvedCount: docs.filter((d: Document) => d.status === 'approved').length,
        rejectedCount: docs.filter((d: Document) => d.status === 'rejected').length,
      });
    }
    groups.sort((a, b) => {
      if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
      if (a.pendingCount === 0 && b.pendingCount > 0) return 1;
      return a.driverName.localeCompare(b.driverName);
    });
    return groups;
  }, [documents, drivers, applications, searchQuery]);

  const toggleDriver = (driverId: string) => {
    setOpenDriverIds(prev => {
      const next = new Set(prev);
      if (next.has(driverId)) {
        next.delete(driverId);
      } else {
        next.add(driverId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setOpenDriverIds(new Set(driverGroups.map(g => g.driverId)));
  };

  const collapseAll = () => {
    setOpenDriverIds(new Set());
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Document Review</h1>
          <p className="text-muted-foreground">Review and approve driver documents</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold" data-testid="text-total-docs">{documents?.length || 0}</div>
              <p className="text-sm text-muted-foreground">Total Documents</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-docs">{pendingDocs.length}</div>
              <p className="text-sm text-muted-foreground">Pending Review</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600" data-testid="text-approved-docs">{approvedDocs.length}</div>
              <p className="text-sm text-muted-foreground">Approved</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600" data-testid="text-rejected-docs">{rejectedDocs.length}</div>
              <p className="text-sm text-muted-foreground">Rejected</p>
            </CardContent>
          </Card>
        </div>

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
        ) : (
          <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by driver name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-drivers"
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={expandAll} data-testid="button-expand-all">
                  Expand All
                </Button>
                <Button size="sm" variant="outline" onClick={collapseAll} data-testid="button-collapse-all">
                  Collapse All
                </Button>
              </div>
            </div>

            {driverGroups.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">
                    {searchQuery ? 'No drivers found matching your search' : 'No documents uploaded yet'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {driverGroups.map((group) => {
                  const isOpen = openDriverIds.has(group.driverId);
                  const rcId = getDriverId(group.driverId);
                  return (
                    <Collapsible
                      key={group.driverId}
                      open={isOpen}
                      onOpenChange={() => toggleDriver(group.driverId)}
                    >
                      <Card data-testid={`card-driver-folder-${group.driverId}`}>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer flex flex-row items-center justify-between gap-2 p-4">
                            <div className="flex items-center gap-3 min-w-0 flex-1 flex-wrap">
                              <ChevronRight className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                              <FolderOpen className="h-5 w-5 text-primary shrink-0" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold truncate" data-testid={`text-driver-name-${group.driverId}`}>
                                    {group.driverName}
                                  </span>
                                  {rcId && (
                                    <Badge variant="outline" className="text-xs shrink-0">{rcId}</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              <Badge variant="secondary" className="text-xs">{group.docs.length} docs</Badge>
                              {group.pendingCount > 0 && (
                                <Badge className="bg-yellow-500 text-xs">{group.pendingCount} pending</Badge>
                              )}
                              {group.approvedCount > 0 && (
                                <Badge className="bg-green-500 text-xs">{group.approvedCount} approved</Badge>
                              )}
                              {group.rejectedCount > 0 && (
                                <Badge className="bg-red-500 text-xs">{group.rejectedCount} rejected</Badge>
                              )}
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 pb-4">
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Document Type</TableHead>
                                    <TableHead>File Name</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.docs.map((doc) => (
                                    <TableRow key={doc.id} data-testid={`row-document-${doc.id}`}>
                                      <TableCell className="font-medium">{getDocTypeName(doc.type)}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{doc.fileName}</TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-1 flex-wrap">
                                          {getStatusBadge(doc.status)}
                                          {(doc as any).fileMissing && <Badge variant="destructive" className="text-xs">File Missing</Badge>}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedDoc(doc);
                                              setViewDialogOpen(true);
                                            }}
                                            data-testid={`button-view-${doc.id}`}
                                          >
                                            <Eye className="h-4 w-4" />
                                          </Button>
                                          {doc.status !== 'approved' && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="text-green-600"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                reviewDocumentMutation.mutate({ id: doc.id, status: 'approved' });
                                              }}
                                              disabled={reviewDocumentMutation.isPending}
                                              data-testid={`button-approve-${doc.id}`}
                                            >
                                              <CheckCircle className="h-4 w-4" />
                                            </Button>
                                          )}
                                          {doc.status !== 'rejected' && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="text-red-600"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                reviewDocumentMutation.mutate({ id: doc.id, status: 'rejected' });
                                              }}
                                              disabled={reviewDocumentMutation.isPending}
                                              data-testid={`button-reject-${doc.id}`}
                                            >
                                              <XCircle className="h-4 w-4" />
                                            </Button>
                                          )}
                                          {doc.status === 'rejected' && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              className="text-destructive"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm('Are you sure you want to permanently delete this document?')) {
                                                  deleteDocumentMutation.mutate(doc.id);
                                                }
                                              }}
                                              disabled={deleteDocumentMutation.isPending}
                                              data-testid={`button-delete-${doc.id}`}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </>
        )}

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
                  {(selectedDoc as any)?.fileMissing ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center">
                      <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
                      <p className="font-semibold text-destructive">File Not Available</p>
                      <p className="text-sm text-muted-foreground mt-2">This document file is missing from storage. The driver needs to re-upload this document.</p>
                    </div>
                  ) : previewLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                  ) : previewError ? (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      <div className="text-center">
                        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>{previewError}</p>
                      </div>
                    </div>
                  ) : previewUrl ? (
                    (() => {
                      const isPdf = previewUrl.toLowerCase().match(/\.pdf/i) || (selectedDoc.fileName || '').toLowerCase().endsWith('.pdf');
                      return (
                        <div className="space-y-3">
                          <div className="flex justify-center">
                            <a
                              href={previewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-sm text-primary underline"
                              data-testid="link-open-document"
                            >
                              <Eye className="h-4 w-4" />
                              Open in new tab
                            </a>
                          </div>
                          {isPdf ? (
                            <div className="flex flex-col items-center justify-center h-64 bg-muted rounded">
                              <FileText className="h-16 w-16 text-muted-foreground mb-3" />
                              <p className="text-sm text-muted-foreground">PDF Document</p>
                              <p className="text-xs text-muted-foreground mt-1">Click "Open in new tab" above to view</p>
                            </div>
                          ) : (
                            <img
                              src={previewUrl}
                              alt={selectedDoc.fileName || 'Document'}
                              className="max-w-full max-h-96 mx-auto rounded"
                              data-testid="img-document-preview"
                              onError={() => {
                                setPreviewError('Failed to load image. The file may be missing or inaccessible.');
                              }}
                            />
                          )}
                        </div>
                      );
                    })()
                  ) : selectedDoc.fileUrl?.startsWith('text:') ? (
                    <div className="p-4 bg-muted rounded text-center">
                      <p className="font-mono text-lg">{selectedDoc.fileUrl.replace('text:', '')}</p>
                      <p className="text-sm text-muted-foreground mt-2">Text/Code Value</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      <p>No preview available</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <DialogFooter>
              {selectedDoc && (
                <div className="flex gap-2 w-full">
                  {selectedDoc.status !== 'approved' && (
                    <Button
                      variant="outline"
                      className="text-green-600 flex-1"
                      onClick={() => {
                        reviewDocumentMutation.mutate({ id: selectedDoc.id, status: 'approved' });
                        setViewDialogOpen(false);
                      }}
                      disabled={reviewDocumentMutation.isPending}
                      data-testid="button-dialog-approve"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve
                    </Button>
                  )}
                  {selectedDoc.status !== 'rejected' && (
                    <Button
                      variant="outline"
                      className="text-red-600 flex-1"
                      onClick={() => {
                        reviewDocumentMutation.mutate({ id: selectedDoc.id, status: 'rejected' });
                        setViewDialogOpen(false);
                      }}
                      disabled={reviewDocumentMutation.isPending}
                      data-testid="button-dialog-reject"
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setViewDialogOpen(false)} data-testid="button-dialog-close">
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
