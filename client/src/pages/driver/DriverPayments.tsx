import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Wallet,
  TrendingUp,
  Clock,
  CheckCircle,
  Package,
  Calendar,
  ArrowUpRight,
  Receipt,
  Banknote,
  FileText,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useDriver } from '@/hooks/useSupabaseDriver';
import type { DriverPayment, DriverPaymentStatus } from '@shared/schema';
import { format } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';

const formatPrice = (price: string | number) => {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return `£${num.toFixed(2)}`;
};

const getStatusBadgeVariant = (status: DriverPaymentStatus) => {
  switch (status) {
    case 'paid':
      return 'default';
    case 'pending':
      return 'secondary';
    case 'processing':
      return 'outline';
    case 'failed':
      return 'destructive';
    default:
      return 'secondary';
  }
};

const getStatusLabel = (status: DriverPaymentStatus) => {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'pending':
      return 'Pending';
    case 'processing':
      return 'Processing';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
};

export default function DriverPayments() {
  const { data: driver, isLoading: driverLoading } = useDriver();

  const { data: payments, isLoading: paymentsLoading } = useQuery<DriverPayment[]>({
    queryKey: ['/api/driver-payments', { driverId: driver?.id }],
    enabled: !!driver?.id,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<{
    totalEarnings: number;
    pendingAmount: number;
    paidAmount: number;
    totalJobs: number;
  }>({
    queryKey: ['/api/driver-payments/stats', driver?.id],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/driver-payments/stats/${driver!.id}`);
      return response.json();
    },
    enabled: !!driver?.id,
  });

  const isLoading = driverLoading || paymentsLoading || statsLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Payment History</h1>
          <p className="text-muted-foreground">
            Track your earnings and payment status
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-earnings">
                  {formatPrice(stats?.totalEarnings || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Lifetime earnings from jobs
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Payout</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600" data-testid="text-pending-amount">
                  {formatPrice(stats?.pendingAmount || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Awaiting payment
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Paid Out</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600" data-testid="text-paid-amount">
                  {formatPrice(stats?.paidAmount || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Successfully transferred
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Jobs Completed</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-jobs">
                  {stats?.totalJobs || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Paid deliveries
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Payment Records
            </CardTitle>
            <CardDescription>
              Your earning history from completed jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <div className="text-right space-y-2">
                      <Skeleton className="h-4 w-16 ml-auto" />
                      <Skeleton className="h-5 w-20 ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            ) : payments && payments.length > 0 ? (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                    data-testid={`payment-record-${payment.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Banknote className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {payment.description || 'Job Payment'}
                          {payment.jobTrackingNumber && (
                            <span className="text-xs text-muted-foreground">
                              #{payment.jobTrackingNumber}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {payment.createdAt
                            ? format(new Date(payment.createdAt), 'dd MMM yyyy, HH:mm')
                            : 'Date not available'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-green-600">
                        +{formatPrice(payment.netAmount)}
                      </div>
                      <Badge variant={getStatusBadgeVariant(payment.status)}>
                        {getStatusLabel(payment.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-muted mx-auto flex items-center justify-center mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No Payment Records</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  You don't have any payment records yet. Complete deliveries to start earning!
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Payment Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium mb-2">Weekly Payments</h4>
                <p className="text-sm text-muted-foreground">
                  Payments are processed weekly. Funds are transferred to your registered bank account every Friday.
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium mb-2">Minimum Payout</h4>
                <p className="text-sm text-muted-foreground">
                  The minimum payout threshold is £20. Smaller amounts will roll over to the next payment cycle.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
