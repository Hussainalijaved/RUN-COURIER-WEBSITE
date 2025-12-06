import { useRef, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  FileText,
  Upload,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Car,
  Shield,
  CreditCard,
  User,
  Package,
  Loader2,
} from 'lucide-react';
import {
  useDriver,
  useDriverDocuments,
  useUploadDocument,
} from '@/hooks/useSupabaseDriver';

const baseDocumentTypes = [
  {
    type: 'driving_license',
    label: 'Driving License',
    description: 'Valid UK driving license (front and back)',
    icon: CreditCard,
    required: true,
    vehicleTypes: ['motorbike', 'car', 'small_van', 'medium_van'],
    isVehiclePhoto: false,
  },
  {
    type: 'hire_and_reward_insurance',
    label: 'Hire and Reward Insurance',
    description: 'Motor insurance for courier/delivery work (Hire & Reward cover)',
    icon: Shield,
    required: true,
    vehicleTypes: ['motorbike', 'car', 'small_van', 'medium_van'],
    isVehiclePhoto: false,
  },
  {
    type: 'goods_in_transit_insurance',
    label: 'Goods in Transit Insurance',
    description: 'Insurance covering goods during transportation',
    icon: Package,
    required: true,
    vehicleTypes: ['motorbike', 'car', 'small_van', 'medium_van'],
    isVehiclePhoto: false,
  },
  {
    type: 'proof_of_identity',
    label: 'Proof of Identity',
    description: 'Passport or national ID card',
    icon: User,
    required: true,
    vehicleTypes: ['motorbike', 'car', 'small_van', 'medium_van'],
    isVehiclePhoto: false,
  },
  {
    type: 'proof_of_address',
    label: 'Proof of Address',
    description: 'Utility bill or bank statement (within 3 months)',
    icon: FileText,
    required: true,
    vehicleTypes: ['motorbike', 'car', 'small_van', 'medium_van'],
    isVehiclePhoto: false,
  },
];

const vehiclePhotoTypes = [
  {
    type: 'vehicle_photo_front',
    label: 'Front',
    description: 'Front view',
    vehicleTypes: ['motorbike', 'car', 'small_van', 'medium_van'],
  },
  {
    type: 'vehicle_photo_back',
    label: 'Back',
    description: 'Back view',
    vehicleTypes: ['motorbike', 'car', 'small_van', 'medium_van'],
  },
  {
    type: 'vehicle_photo_left',
    label: 'Left Side',
    description: 'Left side view',
    vehicleTypes: ['small_van', 'medium_van'],
  },
  {
    type: 'vehicle_photo_right',
    label: 'Right Side',
    description: 'Right side view',
    vehicleTypes: ['small_van', 'medium_van'],
  },
  {
    type: 'vehicle_photo_load_space',
    label: 'Load Space',
    description: 'Cargo area',
    vehicleTypes: ['small_van', 'medium_van'],
  },
];

const getStatusBadge = (status: string | undefined) => {
  switch (status) {
    case 'approved':
      return <Badge className="bg-green-500"><CheckCircle className="mr-1 h-3 w-3" />Approved</Badge>;
    case 'rejected':
      return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Rejected</Badge>;
    case 'pending':
      return <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />Pending Review</Badge>;
    default:
      return <Badge variant="outline"><AlertTriangle className="mr-1 h-3 w-3" />Required</Badge>;
  }
};

export default function DriverDocuments() {
  const { data: driver, isLoading: driverLoading } = useDriver();
  const { data: documents, isLoading: docsLoading } = useDriverDocuments(driver?.id);
  const uploadDocumentMutation = useUploadDocument();
  const { toast } = useToast();
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const vehicleType = driver?.vehicleType || 'car';
  
  const documentTypes = baseDocumentTypes.filter(
    (doc) => doc.vehicleTypes.includes(vehicleType)
  );

  const vehiclePhotos = vehiclePhotoTypes.filter(
    (photo) => photo.vehicleTypes.includes(vehicleType)
  );

  const getDocumentStatus = (docType: string) => {
    const doc = documents?.find((d) => d.type === docType);
    return doc?.status;
  };

  const getDocument = (docType: string) => {
    return documents?.find((d) => d.type === docType);
  };

  const handleUploadClick = useCallback((docType: string) => {
    const input = fileInputRefs.current[docType];
    if (input) {
      input.click();
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const file = e.target.files?.[0];
    if (!file || !driver?.id) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }

    uploadDocumentMutation.mutate(
      { driverId: driver.id, file, documentType: docType },
      {
        onSuccess: () => {
          toast({
            title: "Document uploaded",
            description: "Your document has been uploaded and is pending review.",
          });
          if (fileInputRefs.current[docType]) {
            fileInputRefs.current[docType]!.value = '';
          }
        },
        onError: (error: any) => {
          toast({
            title: "Upload failed",
            description: error.message || "Failed to upload document. Please try again.",
            variant: "destructive",
          });
        },
      }
    );
  }, [driver?.id, uploadDocumentMutation, toast]);

  const approvedCount = documents?.filter((d) => d.status === 'approved').length || 0;
  const totalRequired = documentTypes.length + vehiclePhotos.length;
  const progressPercent = (approvedCount / totalRequired) * 100;

  const isLoading = driverLoading || docsLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Documents</h1>
          <p className="text-muted-foreground">Upload and manage your verification documents</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {driver?.isVerified ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Verification Complete
                </>
              ) : (
                <>
                  <Clock className="h-5 w-5 text-yellow-500" />
                  Verification In Progress
                </>
              )}
            </CardTitle>
            <CardDescription>
              {driver?.isVerified 
                ? 'All your documents have been verified. You can now accept jobs.'
                : `${approvedCount} of ${totalRequired} required documents approved`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={progressPercent} className="h-2" />
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {isLoading ? (
            <>
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </>
          ) : (
            <>
              {documentTypes.map((docType) => {
                const status = getDocumentStatus(docType.type);
                const doc = getDocument(docType.type);
                const Icon = docType.icon;
                
                return (
                  <Card key={docType.type} data-testid={`document-${docType.type}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg ${
                            status === 'approved' ? 'bg-green-100 text-green-600' :
                            status === 'rejected' ? 'bg-red-100 text-red-600' :
                            status === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            <Icon className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-medium">{docType.label}</h3>
                              {docType.required && !status && (
                                <Badge variant="outline" className="text-xs">Required</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{docType.description}</p>
                            {doc?.reviewNotes && status === 'rejected' && (
                              <p className="text-sm text-destructive mt-1">
                                Rejection reason: {doc.reviewNotes}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {getStatusBadge(status)}
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            ref={(el) => { fileInputRefs.current[docType.type] = el; }}
                            onChange={(e) => handleFileChange(e, docType.type)}
                            data-testid={`input-file-${docType.type}`}
                          />
                          <Button 
                            variant={status === 'approved' ? 'outline' : 'default'}
                            size="sm"
                            onClick={() => handleUploadClick(docType.type)}
                            disabled={uploadDocumentMutation.isPending}
                            data-testid={`button-upload-${docType.type}`}
                          >
                            {uploadDocumentMutation.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="mr-2 h-4 w-4" />
                            )}
                            {status ? 'Re-upload' : 'Upload'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <Card data-testid="document-vehicle-photos">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-muted">
                      <Car className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Vehicle Photos</CardTitle>
                      <CardDescription>
                        {vehiclePhotos.length === 2 
                          ? 'Upload front and back photos of your vehicle'
                          : 'Upload photos of your vehicle from all angles'
                        }
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`grid gap-4 ${vehiclePhotos.length <= 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'}`}>
                    {vehiclePhotos.map((photo) => {
                      const status = getDocumentStatus(photo.type);
                      const doc = getDocument(photo.type);
                      
                      return (
                        <div 
                          key={photo.type} 
                          className={`border-2 border-dashed rounded-lg p-4 text-center ${
                            status === 'approved' ? 'border-green-500 bg-green-50' :
                            status === 'rejected' ? 'border-red-500 bg-red-50' :
                            status === 'pending' ? 'border-yellow-500 bg-yellow-50' :
                            'border-muted-foreground/25 hover:border-primary/50'
                          }`}
                          data-testid={`photo-upload-${photo.type}`}
                        >
                          <div className="flex flex-col items-center gap-2">
                            {status === 'approved' ? (
                              <CheckCircle className="h-8 w-8 text-green-500" />
                            ) : status === 'rejected' ? (
                              <XCircle className="h-8 w-8 text-red-500" />
                            ) : status === 'pending' ? (
                              <Clock className="h-8 w-8 text-yellow-500" />
                            ) : (
                              <Upload className="h-8 w-8 text-muted-foreground" />
                            )}
                            <span className="font-medium text-sm">{photo.label}</span>
                            <span className="text-xs text-muted-foreground">{photo.description}</span>
                            {doc?.reviewNotes && status === 'rejected' && (
                              <span className="text-xs text-destructive">{doc.reviewNotes}</span>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              ref={(el) => { fileInputRefs.current[photo.type] = el; }}
                              onChange={(e) => handleFileChange(e, photo.type)}
                              data-testid={`input-file-${photo.type}`}
                            />
                            <Button 
                              variant={status === 'approved' ? 'outline' : 'default'}
                              size="sm"
                              className="mt-2"
                              onClick={() => handleUploadClick(photo.type)}
                              disabled={uploadDocumentMutation.isPending}
                              data-testid={`button-upload-${photo.type}`}
                            >
                              {uploadDocumentMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              {status ? 'Re-upload' : 'Upload'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900">Document Requirements</h4>
                <ul className="text-sm text-blue-800 mt-1 space-y-1">
                  <li>• All documents must be clear, legible, and show full information</li>
                  <li>• Documents must be valid and not expired</li>
                  <li>• Accepted formats: JPG, PNG, PDF (max 10MB)</li>
                  <li>• Verification typically takes 1-2 business days</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
