import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
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
} from 'lucide-react';
import {
  useDriver,
  useDriverDocuments,
} from '@/hooks/useSupabaseDriver';

const documentTypes = [
  {
    type: 'driving_license',
    label: 'Driving License',
    description: 'Valid UK driving license (front and back)',
    icon: CreditCard,
    required: true,
  },
  {
    type: 'insurance',
    label: 'Vehicle Insurance',
    description: 'Comprehensive insurance certificate',
    icon: Shield,
    required: true,
  },
  {
    type: 'vehicle_registration',
    label: 'Vehicle Registration (V5C)',
    description: 'Vehicle registration certificate',
    icon: Car,
    required: true,
  },
  {
    type: 'proof_of_identity',
    label: 'Proof of Identity',
    description: 'Passport or national ID card',
    icon: User,
    required: true,
  },
  {
    type: 'proof_of_address',
    label: 'Proof of Address',
    description: 'Utility bill or bank statement (within 3 months)',
    icon: FileText,
    required: true,
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

  const getDocumentStatus = (docType: string) => {
    const doc = documents?.find((d) => d.type === docType);
    return doc?.status;
  };

  const getDocument = (docType: string) => {
    return documents?.find((d) => d.type === docType);
  };

  const approvedCount = documents?.filter((d) => d.status === 'approved').length || 0;
  const totalRequired = documentTypes.filter((d) => d.required).length;
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
            documentTypes.map((docType) => {
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
                        <Button 
                          variant={status === 'approved' ? 'outline' : 'default'}
                          size="sm"
                          data-testid={`button-upload-${docType.type}`}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          {status ? 'Re-upload' : 'Upload'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
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
