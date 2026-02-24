import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  PoundSterling,
  CreditCard,
  TrendingUp,
  Users,
  Filter,
  Calendar,
  MapPin,
  ChevronRight,
  Building2,
  Edit2,
  Save,
  Eye,
  EyeOff,
  Banknote,
  Copy,
  Send,
  ArrowRight,
  Mail,
  Trash2,
  X,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Driver, DriverPayment, Job } from '@shared/schema';

interface CompanyBankDetails {
  bankName: string;
  accountHolderName: string;
  sortCode: string;
  accountNumber: string;
  updatedAt?: string;
}

interface WeeklyJob {
  id: string;
  trackingNumber: string;
  driverId: string;
  pickupPostcode: string;
  pickupAddress: string;
  deliveryPostcode: string;
  deliveryAddress: string;
  status: string;
  driverPrice: string | null;
  totalPrice: string;
  deliveredAt: string | null;
  actualDeliveryTime: string | null;
  createdAt: string;
}

interface DriverJobGroup {
  driver: Driver;
  jobs: WeeklyJob[];
  totalEarnings: number;
}

type PayStep = 'amount' | 'confirm' | 'success';

export default function AdminDriverPayments() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payDriver, setPayDriver] = useState<Driver | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payDescription, setPayDescription] = useState('');
  const [payStep, setPayStep] = useState<PayStep>('amount');
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [editingCompanyBank, setEditingCompanyBank] = useState(false);
  const [showCompanyAccountNumber, setShowCompanyAccountNumber] = useState(false);
  const [companyBankForm, setCompanyBankForm] = useState<CompanyBankDetails>({
    bankName: '',
    accountHolderName: '',
    sortCode: '',
    accountNumber: '',
  });
  const { toast } = useToast();

  const { data: drivers = [], isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<DriverPayment[]>({
    queryKey: ['/api/driver-payments'],
  });

  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ['/api/jobs'],
  });

  const { data: weeklyJobs = [], isLoading: weeklyJobsLoading } = useQuery<WeeklyJob[]>({
    queryKey: ['/api/driver-jobs/weekly'],
  });

  const { data: companyBankDetails, isLoading: companyBankLoading } = useQuery<CompanyBankDetails | null>({
    queryKey: ['/api/admin/company-bank-details'],
  });

  useEffect(() => {
    if (companyBankDetails) {
      setCompanyBankForm(companyBankDetails);
    }
  }, [companyBankDetails]);

  const driverJobGroups: DriverJobGroup[] = (() => {
    const groupMap = new Map<string, WeeklyJob[]>();
    weeklyJobs.forEach(job => {
      const existing = groupMap.get(job.driverId) || [];
      existing.push(job);
      groupMap.set(job.driverId, existing);
    });
    const groups: DriverJobGroup[] = [];
    groupMap.forEach((driverJobs, driverId) => {
      const driver = drivers.find(d => d.id === driverId);
      if (driver) {
        const totalEarnings = driverJobs.reduce((sum, job) =>
          sum + parseFloat(job.driverPrice || job.totalPrice || '0'), 0);
        groups.push({ driver, jobs: driverJobs, totalEarnings });
      }
    });
    return groups.sort((a, b) => b.totalEarnings - a.totalEarnings);
  })();

  const sendPaymentMutation = useMutation({
    mutationFn: async ({ driverId, amount, reference, description }: {
      driverId: string;
      amount: string;
      reference: string;
      description: string;
    }) => {
      return apiRequest('POST', '/api/driver-payments', {
        driverId,
        amount,
        netAmount: amount,
        platformFee: "0.00",
        status: 'paid',
        description: description || 'Bank transfer payment',
        payoutReference: reference || `PAY-${Date.now()}`,
        paidAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-payments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/driver-jobs/weekly'] });
      setPayStep('success');
    },
    onError: () => {
      toast({ title: 'Payment failed', description: 'Please try again', variant: 'destructive' });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ paymentId, reference }: { paymentId: string; reference: string }) => {
      return apiRequest('PATCH', `/api/driver-payments/${paymentId}`, {
        status: 'paid',
        paidAt: new Date().toISOString(),
        payoutReference: reference,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-payments'] });
      toast({ title: 'Payment marked as paid' });
    },
    onError: () => {
      toast({ title: 'Failed to update payment', variant: 'destructive' });
    },
  });

  const batchMarkPaidMutation = useMutation({
    mutationFn: async ({ paymentIds, reference }: { paymentIds: string[]; reference: string }) => {
      const promises = paymentIds.map(id =>
        apiRequest('PATCH', `/api/driver-payments/${id}`, {
          status: 'paid',
          paidAt: new Date().toISOString(),
          payoutReference: reference,
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-payments'] });
      toast({ title: 'Payments marked as paid' });
      setSelectedPaymentIds([]);
    },
    onError: () => {
      toast({ title: 'Failed to update payments', variant: 'destructive' });
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      return apiRequest('DELETE', `/api/driver-payments/${paymentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-payments'] });
      toast({ title: 'Payment deleted' });
    },
    onError: () => {
      toast({ title: 'Failed to delete payment', variant: 'destructive' });
    },
  });

  const saveCompanyBankMutation = useMutation({
    mutationFn: async (data: CompanyBankDetails) => {
      return apiRequest('PUT', '/api/admin/company-bank-details', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/company-bank-details'] });
      toast({ title: 'Company bank details saved' });
      setEditingCompanyBank(false);
    },
    onError: () => {
      toast({ title: 'Failed to save company bank details', variant: 'destructive' });
    },
  });

  const openPayDialog = (driver: Driver, amount?: number) => {
    setPayDriver(driver);
    setPayAmount(amount ? amount.toFixed(2) : '');
    setPayReference('');
    setPayDescription('');
    setPayStep('amount');
    setPayDialogOpen(true);
  };

  const closePayDialog = () => {
    setPayDialogOpen(false);
    setPayDriver(null);
    setPayAmount('');
    setPayReference('');
    setPayDescription('');
    setPayStep('amount');
  };

  const handleSendPayment = () => {
    if (!payDriver || !payAmount) return;
    sendPaymentMutation.mutate({
      driverId: payDriver.id,
      amount: payAmount,
      reference: payReference,
      description: payDescription,
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied` });
    }).catch(() => {});
  };

  const getDriverName = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    return driver?.fullName || 'Unknown Driver';
  };

  const getDriverCode = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    return driver?.driverCode || 'N/A';
  };

  const getJobTrackingNumber = (jobId: string | null) => {
    if (!jobId) return 'Manual Payment';
    const job = jobs.find(j => j.id === jobId);
    return job?.trackingNumber || jobId;
  };

  const filteredPayments = payments.filter(payment => {
    const driverName = getDriverName(payment.driverId).toLowerCase();
    const driverCode = getDriverCode(payment.driverId).toLowerCase();
    const jobTracking = payment.jobTrackingNumber?.toLowerCase() || '';
    const matchesSearch =
      driverName.includes(searchQuery.toLowerCase()) ||
      driverCode.includes(searchQuery.toLowerCase()) ||
      jobTracking.includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || payment.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingPayments = payments.filter(p => p.status === 'pending');
  const totalPending = pendingPayments.reduce((sum, p) => sum + parseFloat(p.netAmount), 0);
  const totalPaid = payments.filter(p => p.status === 'paid').reduce((sum, p) => sum + parseFloat(p.netAmount), 0);
  const uniqueDriversWithPending = new Set(pendingPayments.map(p => p.driverId)).size;

  const formatPrice = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `£${num.toFixed(2)}`;
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatSortCode = (code: string) => {
    const digits = code.replace(/\D/g, '');
    if (digits.length === 6) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
    }
    return code;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600" data-testid={`badge-status-${status}`}><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'processing':
        return <Badge variant="outline" className="text-blue-600 border-blue-600" data-testid={`badge-status-${status}`}><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
      case 'paid':
        return <Badge variant="outline" className="text-green-600 border-green-600" data-testid={`badge-status-${status}`}><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge>;
      case 'failed':
        return <Badge variant="outline" className="text-red-600 border-red-600" data-testid={`badge-status-${status}`}><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline" data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  const togglePaymentSelection = (paymentId: string) => {
    setSelectedPaymentIds(prev =>
      prev.includes(paymentId)
        ? prev.filter(id => id !== paymentId)
        : [...prev, paymentId]
    );
  };

  const isLoading = driversLoading || paymentsLoading;
  const activeDrivers = drivers.filter(d => d.isActive !== false);
  const driversWithBank = activeDrivers.filter(d => d.bankName && d.sortCode && d.accountNumber);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Driver Payments</h1>
            <p className="text-muted-foreground">Pay drivers and track payment history</p>
          </div>
          <Select
            value=""
            onValueChange={(driverId) => {
              const driver = drivers.find(d => d.id === driverId);
              if (driver) openPayDialog(driver);
            }}
          >
            <SelectTrigger className="w-auto sm:w-56" data-testid="select-pay-driver">
              <div className="flex items-center gap-2">
                <Banknote className="w-4 h-4" />
                <span>Pay a Driver</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {driversWithBank.length > 0 ? (
                driversWithBank.map(driver => (
                  <SelectItem key={driver.id} value={driver.id} data-testid={`select-item-pay-${driver.id}`}>
                    {driver.driverCode ? `${driver.driverCode} - ` : ''}{driver.fullName}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="_none" disabled>No drivers with bank details</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card data-testid="card-total-pending">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{formatPrice(totalPending)}</div>
              <p className="text-xs text-muted-foreground">{pendingPayments.length} payments pending</p>
            </CardContent>
          </Card>
          <Card data-testid="card-total-paid">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatPrice(totalPaid)}</div>
              <p className="text-xs text-muted-foreground">{payments.filter(p => p.status === 'paid').length} payments completed</p>
            </CardContent>
          </Card>
          <Card data-testid="card-drivers-owed">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Drivers Owed</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{uniqueDriversWithPending}</div>
              <p className="text-xs text-muted-foreground">drivers with pending payments</p>
            </CardContent>
          </Card>
          <Card data-testid="card-all-time">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">All Time Payouts</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(totalPaid + totalPending)}</div>
              <p className="text-xs text-muted-foreground">{payments.length} total payments</p>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-company-bank">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Run Courier Bank Details</CardTitle>
            </div>
            {!editingCompanyBank && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingCompanyBank(true)}
                data-testid="button-edit-company-bank"
              >
                <Edit2 className="h-4 w-4 mr-1" />
                {companyBankDetails ? 'Edit' : 'Add Details'}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {companyBankLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : editingCompanyBank ? (
              <div className="space-y-3 max-w-md">
                <div>
                  <Label>Bank Name</Label>
                  <Input
                    value={companyBankForm.bankName}
                    onChange={(e) => setCompanyBankForm(prev => ({ ...prev, bankName: e.target.value }))}
                    placeholder="e.g. Barclays, HSBC, Lloyds"
                    data-testid="input-company-bank-name"
                  />
                </div>
                <div>
                  <Label>Account Holder Name</Label>
                  <Input
                    value={companyBankForm.accountHolderName}
                    onChange={(e) => setCompanyBankForm(prev => ({ ...prev, accountHolderName: e.target.value }))}
                    placeholder="Run Courier Ltd"
                    data-testid="input-company-account-holder"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Sort Code</Label>
                    <Input
                      value={companyBankForm.sortCode}
                      onChange={(e) => setCompanyBankForm(prev => ({ ...prev, sortCode: e.target.value }))}
                      placeholder="00-00-00"
                      data-testid="input-company-sort-code"
                    />
                  </div>
                  <div>
                    <Label>Account Number</Label>
                    <Input
                      value={companyBankForm.accountNumber}
                      onChange={(e) => setCompanyBankForm(prev => ({ ...prev, accountNumber: e.target.value }))}
                      placeholder="12345678"
                      data-testid="input-company-account-number"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => saveCompanyBankMutation.mutate(companyBankForm)}
                    disabled={saveCompanyBankMutation.isPending || !companyBankForm.bankName || !companyBankForm.sortCode || !companyBankForm.accountNumber}
                    data-testid="button-save-company-bank"
                  >
                    {saveCompanyBankMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingCompanyBank(false);
                      if (companyBankDetails) setCompanyBankForm(companyBankDetails);
                    }}
                    data-testid="button-cancel-company-bank"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : companyBankDetails ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Bank</p>
                  <p className="font-medium" data-testid="text-company-bank-name">{companyBankDetails.bankName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Account Holder</p>
                  <p className="font-medium" data-testid="text-company-account-holder">{companyBankDetails.accountHolderName || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Sort Code</p>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-medium" data-testid="text-company-sort-code">{formatSortCode(companyBankDetails.sortCode)}</p>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(companyBankDetails.sortCode, 'Sort code')} data-testid="button-copy-company-sort-code">
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Account Number</p>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-medium" data-testid="text-company-account-number">
                      {showCompanyAccountNumber ? companyBankDetails.accountNumber : `****${companyBankDetails.accountNumber.slice(-4)}`}
                    </p>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowCompanyAccountNumber(!showCompanyAccountNumber)} data-testid="button-toggle-company-account">
                      {showCompanyAccountNumber ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(companyBankDetails.accountNumber, 'Account number')} data-testid="button-copy-company-account">
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground text-sm">No company bank details saved yet</p>
                <p className="text-xs text-muted-foreground mt-1">Click "Add Details" to save Run Courier's bank information</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-weekly-jobs">
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Driver Earnings</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">Click Pay to send payment to driver</p>
            </div>
          </CardHeader>
          <CardContent>
            {weeklyJobsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : driverJobGroups.length > 0 ? (
              <Accordion type="multiple" className="w-full">
                {driverJobGroups.map((group) => {
                  const driverHasBank = group.driver.bankName && group.driver.sortCode && group.driver.accountNumber;
                  return (
                    <AccordionItem key={group.driver.id} value={group.driver.id} data-testid={`accordion-driver-${group.driver.id}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex flex-1 items-center justify-between pr-4 gap-2 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-start">
                              <span className="font-medium">{group.driver.fullName}</span>
                              <span className="text-xs text-muted-foreground font-mono">{group.driver.driverCode || 'No ID'}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" data-testid={`badge-job-count-${group.driver.id}`}>
                              {group.jobs.length} job{group.jobs.length !== 1 ? 's' : ''}
                            </Badge>
                            <span className="font-semibold text-green-600">{formatPrice(group.totalEarnings)}</span>
                            {driverHasBank ? (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPayDialog(group.driver, group.totalEarnings);
                                }}
                                data-testid={`button-pay-driver-${group.driver.id}`}
                              >
                                <Send className="w-4 h-4 mr-1" />
                                Pay {formatPrice(group.totalEarnings)}
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                                No bank details
                              </Badge>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Job</TableHead>
                                <TableHead>Pickup</TableHead>
                                <TableHead>Delivery</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.jobs.map((job) => (
                                <TableRow key={job.id} data-testid={`row-weekly-job-${job.id}`}>
                                  <TableCell>
                                    <span className="font-mono text-sm font-medium">{job.trackingNumber}</span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-start gap-1">
                                      <MapPin className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
                                      <div className="flex flex-col">
                                        <span className="text-sm font-medium">{job.pickupPostcode}</span>
                                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">{job.pickupAddress}</span>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-start gap-1">
                                      <ChevronRight className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
                                      <div className="flex flex-col">
                                        <span className="text-sm font-medium">{job.deliveryPostcode}</span>
                                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">{job.deliveryAddress}</span>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm">{formatDate(job.deliveredAt || job.actualDeliveryTime || job.createdAt)}</span>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <span className="font-medium text-green-600">{formatPrice(job.driverPrice || job.totalPrice)}</span>
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-muted/50">
                                <TableCell colSpan={4} className="font-medium text-right">Total:</TableCell>
                                <TableCell className="text-right">
                                  <span className="font-bold text-green-600">{formatPrice(group.totalEarnings)}</span>
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No completed jobs this week</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-payments-table">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Payment History</CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search driver or tracking..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-full sm:w-64"
                    data-testid="input-search"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedPaymentIds.length > 0 && (
              <div className="flex items-center gap-2 mt-4 p-2 bg-muted rounded-md flex-wrap">
                <span className="text-sm">{selectedPaymentIds.length} selected</span>
                <Button
                  size="sm"
                  onClick={() => {
                    const reference = prompt('Enter payment reference for batch:');
                    if (reference) batchMarkPaidMutation.mutate({ paymentIds: selectedPaymentIds, reference });
                  }}
                  disabled={batchMarkPaidMutation.isPending}
                  data-testid="button-batch-mark-paid"
                >
                  {batchMarkPaidMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Mark Selected as Paid
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedPaymentIds([])} data-testid="button-clear-selection">Clear</Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : filteredPayments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={selectedPaymentIds.length === filteredPayments.filter(p => p.status === 'pending').length && filteredPayments.filter(p => p.status === 'pending').length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedPaymentIds(filteredPayments.filter(p => p.status === 'pending').map(p => p.id));
                          else setSelectedPaymentIds([]);
                        }}
                        className="rounded"
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Job</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => (
                    <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                      <TableCell>
                        {payment.status === 'pending' && (
                          <input
                            type="checkbox"
                            checked={selectedPaymentIds.includes(payment.id)}
                            onChange={() => togglePaymentSelection(payment.id)}
                            className="rounded"
                            data-testid={`checkbox-payment-${payment.id}`}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{getDriverName(payment.driverId)}</span>
                          <span className="text-xs text-muted-foreground font-mono">{getDriverCode(payment.driverId)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{payment.jobTrackingNumber || getJobTrackingNumber(payment.jobId)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-green-600">{formatPrice(payment.netAmount)}</span>
                      </TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{payment.payoutReference || '—'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatDate(payment.paidAt || payment.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {payment.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const reference = prompt('Enter payment reference:');
                                if (reference) markPaidMutation.mutate({ paymentId: payment.id, reference });
                              }}
                              disabled={markPaidMutation.isPending}
                              data-testid={`button-mark-paid-${payment.id}`}
                            >
                              {markPaidMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle className="w-4 h-4 mr-1" />Mark Paid</>}
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Delete this ${formatPrice(payment.netAmount)} payment to ${getDriverName(payment.driverId)}?`)) {
                                deletePaymentMutation.mutate(payment.id);
                              }
                            }}
                            disabled={deletePaymentMutation.isPending}
                            data-testid={`button-delete-payment-${payment.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No payments found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={payDialogOpen} onOpenChange={(open) => { if (!open) closePayDialog(); }}>
        <DialogContent className="max-w-sm">
          {payStep === 'amount' && payDriver && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Pay {payDriver.fullName}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="p-3 bg-muted/50 rounded-md space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">To:</span>
                    <span className="font-medium">{payDriver.accountHolderName || payDriver.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bank:</span>
                    <span className="font-medium">{payDriver.bankName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sort Code:</span>
                    <span className="font-mono font-medium">{formatSortCode(payDriver.sortCode || '')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account:</span>
                    <span className="font-mono font-medium">****{(payDriver.accountNumber || '').slice(-4)}</span>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Amount</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-2.5 text-muted-foreground font-medium">£</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="pl-7 text-lg font-semibold"
                      placeholder="0.00"
                      autoFocus
                      data-testid="input-pay-amount"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Reference (optional)</Label>
                  <Input
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    placeholder="e.g. Weekly pay, Bonus..."
                    className="mt-1"
                    data-testid="input-pay-reference"
                  />
                </div>

                <Button
                  className="w-full"
                  disabled={!payAmount || parseFloat(payAmount) <= 0}
                  onClick={() => setPayStep('confirm')}
                  data-testid="button-continue-payment"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}

          {payStep === 'confirm' && payDriver && (
            <>
              <DialogHeader>
                <DialogTitle>Confirm Payment</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="text-center py-4">
                  <p className="text-3xl font-bold text-green-600" data-testid="text-confirm-amount">£{parseFloat(payAmount).toFixed(2)}</p>
                  <p className="text-muted-foreground mt-1">to {payDriver.fullName}</p>
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    {payDriver.bankName} | {formatSortCode(payDriver.sortCode || '')} | ****{(payDriver.accountNumber || '').slice(-4)}
                  </p>
                  {payReference && (
                    <p className="text-xs text-muted-foreground mt-2">Ref: {payReference}</p>
                  )}
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md">
                  <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      {payDriver.fullName} will receive an email confirmation of this payment
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPayStep('amount')}
                    className="flex-1"
                    data-testid="button-back"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleSendPayment}
                    disabled={sendPaymentMutation.isPending}
                    className="flex-1"
                    data-testid="button-confirm-pay"
                  >
                    {sendPaymentMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Pay £{parseFloat(payAmount).toFixed(2)}
                  </Button>
                </div>
              </div>
            </>
          )}

          {payStep === 'success' && payDriver && (
            <>
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold" data-testid="text-payment-success">Payment Sent</h3>
                  <p className="text-3xl font-bold text-green-600 mt-1">£{parseFloat(payAmount).toFixed(2)}</p>
                  <p className="text-muted-foreground mt-1">to {payDriver.fullName}</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>Confirmation email sent to {payDriver.email || 'driver'}</span>
                </div>
                <Button onClick={closePayDialog} className="mt-4" data-testid="button-done">
                  Done
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
