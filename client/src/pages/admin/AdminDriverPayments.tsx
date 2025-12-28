import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { insertDriverPaymentSchema } from '@shared/schema';
import type { Driver, DriverPayment, Job } from '@shared/schema';

const paymentFormSchema = insertDriverPaymentSchema
  .pick({ driverId: true, description: true })
  .extend({
    driverId: z.string().min(1, "Please select a driver"),
    amount: z.string().min(1, "Amount is required").refine(
      (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
      "Amount must be a positive number"
    ),
    reference: z.string().optional(),
    description: z.string().optional(),
  });

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export default function AdminDriverPayments() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      driverId: '',
      amount: '',
      reference: '',
      description: '',
    },
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<DriverPayment[]>({
    queryKey: ['/api/driver-payments'],
  });

  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ['/api/jobs'],
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

  const createPaymentMutation = useMutation({
    mutationFn: async (data: PaymentFormValues) => {
      return apiRequest('POST', '/api/driver-payments', {
        driverId: data.driverId,
        amount: data.amount,
        netAmount: data.amount,
        platformFee: "0.00",
        status: 'paid',
        description: data.description || 'Manual payment',
        payoutReference: data.reference || null,
        paidAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/driver-payments'] });
      toast({ title: 'Payment recorded successfully' });
      setPaymentDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: 'Failed to create payment', variant: 'destructive' });
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

  const onSubmit = (data: PaymentFormValues) => {
    createPaymentMutation.mutate(data);
  };

  const isLoading = driversLoading || paymentsLoading;
  const activeDrivers = drivers.filter(d => d.isActive !== false);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Driver Payments</h1>
            <p className="text-muted-foreground">Manage and record payments to drivers</p>
          </div>
          <Button 
            onClick={() => setPaymentDialogOpen(true)}
            data-testid="button-new-payment"
          >
            <PoundSterling className="w-4 h-4 mr-2" />
            Record Payment
          </Button>
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

        <Card data-testid="card-payments-table">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Payment History</CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by driver or tracking..."
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
                    <SelectItem value="all" data-testid="select-item-status-all">All Status</SelectItem>
                    <SelectItem value="pending" data-testid="select-item-status-pending">Pending</SelectItem>
                    <SelectItem value="processing" data-testid="select-item-status-processing">Processing</SelectItem>
                    <SelectItem value="paid" data-testid="select-item-status-paid">Paid</SelectItem>
                    <SelectItem value="failed" data-testid="select-item-status-failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedPaymentIds.length > 0 && (
              <div className="flex items-center gap-2 mt-4 p-2 bg-muted rounded-md">
                <span className="text-sm">{selectedPaymentIds.length} selected</span>
                <Button
                  size="sm"
                  onClick={() => {
                    const reference = prompt('Enter payment reference for batch:');
                    if (reference) {
                      batchMarkPaidMutation.mutate({ paymentIds: selectedPaymentIds, reference });
                    }
                  }}
                  disabled={batchMarkPaidMutation.isPending}
                  data-testid="button-batch-mark-paid"
                >
                  {batchMarkPaidMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Mark Selected as Paid
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedPaymentIds([])}
                  data-testid="button-clear-selection"
                >
                  Clear Selection
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredPayments.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={selectedPaymentIds.length === filteredPayments.filter(p => p.status === 'pending').length && filteredPayments.filter(p => p.status === 'pending').length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPaymentIds(filteredPayments.filter(p => p.status === 'pending').map(p => p.id));
                          } else {
                            setSelectedPaymentIds([]);
                          }
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
                        <span className="font-mono text-sm">
                          {payment.jobTrackingNumber || getJobTrackingNumber(payment.jobId)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-green-600">{formatPrice(payment.netAmount)}</span>
                          {parseFloat(payment.platformFee || "0") > 0 && (
                            <span className="text-xs text-muted-foreground">Fee: {formatPrice(payment.platformFee || 0)}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{payment.payoutReference || '—'}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatDate(payment.paidAt || payment.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        {payment.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const reference = prompt('Enter payment reference:');
                              if (reference) {
                                markPaidMutation.mutate({ paymentId: payment.id, reference });
                              }
                            }}
                            disabled={markPaidMutation.isPending}
                            data-testid={`button-mark-paid-${payment.id}`}
                          >
                            {markPaidMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Mark Paid
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CreditCard className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No payments found</p>
                <p className="text-sm text-muted-foreground">Payments will appear here when jobs are completed</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={paymentDialogOpen} onOpenChange={(open) => {
        setPaymentDialogOpen(open);
        if (!open) form.reset();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Driver Payment</DialogTitle>
            <DialogDescription>
              Record a manual payment to a driver
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
              <FormField
                control={form.control}
                name="driverId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Driver</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-driver">
                          <SelectValue placeholder="Select a driver" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {activeDrivers.map(driver => (
                          <SelectItem 
                            key={driver.id} 
                            value={driver.id}
                            data-testid={`select-item-driver-${driver.id}`}
                          >
                            {driver.fullName} ({driver.driverCode || 'No ID'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (£)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        data-testid="input-amount"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Reference</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Bank transfer reference..."
                        data-testid="input-reference"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Payment description..."
                        data-testid="input-description"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setPaymentDialogOpen(false);
                    form.reset();
                  }} 
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createPaymentMutation.isPending}
                  data-testid="button-record-payment"
                >
                  {createPaymentMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <PoundSterling className="w-4 h-4 mr-2" />
                  )}
                  Record Payment
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
