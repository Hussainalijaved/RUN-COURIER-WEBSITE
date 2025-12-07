import { Link } from 'wouter';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Package,
  Clock,
  CheckCircle,
  MapPin,
  ArrowRight,
  Plus,
  Eye,
  Truck,
  Wallet,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import type { Job, JobStatus } from '@shared/schema';

interface CustomerStats {
  totalOrders: number;
  completedOrders: number;
  activeOrders: number;
  totalSpent: number;
}

const getStatusBadge = (status: JobStatus) => {
  switch (status) {
    case 'delivered':
      return <Badge className="bg-green-500 text-white" data-testid={`badge-status-${status}`}>Delivered</Badge>;
    case 'on_the_way_delivery':
    case 'collected':
      return <Badge className="bg-blue-500 text-white" data-testid={`badge-status-${status}`}>Out for Delivery</Badge>;
    case 'on_the_way_pickup':
    case 'arrived_pickup':
      return <Badge className="bg-purple-500 text-white" data-testid={`badge-status-${status}`}>Picking Up</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-500 text-white" data-testid={`badge-status-${status}`}>Pending</Badge>;
    case 'assigned':
    case 'accepted':
      return <Badge className="bg-indigo-500 text-white" data-testid={`badge-status-${status}`}>Assigned</Badge>;
    case 'cancelled':
      return <Badge className="bg-red-500 text-white" data-testid={`badge-status-${status}`}>Cancelled</Badge>;
    default:
      return <Badge data-testid={`badge-status-${status}`}>{status}</Badge>;
  }
};

const formatPrice = (price: string | number) => {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return `£${num.toFixed(2)}`;
};

const formatDate = (date: Date | string | null) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function CustomerDashboard() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<CustomerStats>({
    queryKey: ['/api/stats/customer', user?.id],
    enabled: !!user?.id,
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ['/api/jobs', { customerId: user?.id }],
    enabled: !!user?.id,
  });

  const activeJobs = jobs?.filter((j) => 
    !['delivered', 'cancelled'].includes(j.status)
  ) || [];
  
  const recentJobs = jobs?.slice(0, 5) || [];

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-page-title">My Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Welcome back{user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}! Here's your delivery overview.</p>
          </div>
          <Link href="/book">
            <Button data-testid="button-new-booking" className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              New Booking
            </Button>
          </Link>
        </div>

        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card data-testid="stat-total-orders">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold">{stats?.totalOrders || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card data-testid="stat-active-orders">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
              <Truck className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold">{stats?.activeOrders || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card data-testid="stat-completed-orders">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivered</CardTitle>
              <CheckCircle className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold">{stats?.completedOrders || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card data-testid="stat-total-spent">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
              <Wallet className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold">{formatPrice(stats?.totalSpent || 0)}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {activeJobs.length > 0 && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary animate-pulse" />
                Active Delivery
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeJobs.map((job) => (
                <div key={job.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" data-testid={`active-job-${job.id}`}>
                  <div>
                    <div className="font-mono font-bold">{job.trackingNumber}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {job.pickupPostcode} → {job.deliveryPostcode}
                      </span>
                    </div>
                    <div className="mt-1">
                      {getStatusBadge(job.status)}
                    </div>
                  </div>
                  <Link href={`/track?id=${job.trackingNumber}`}>
                    <Button data-testid={`button-track-${job.id}`}>
                      <MapPin className="mr-2 h-4 w-4" />
                      Track Delivery
                    </Button>
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Your delivery history</CardDescription>
            </div>
            <Link href="/customer/orders">
              <Button variant="outline" size="sm" data-testid="button-view-all-orders">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {jobsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentJobs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentJobs.map((job) => (
                    <TableRow key={job.id} data-testid={`row-order-${job.id}`}>
                      <TableCell className="font-mono">{job.trackingNumber}</TableCell>
                      <TableCell>
                        {job.pickupPostcode} → {job.deliveryPostcode}
                      </TableCell>
                      <TableCell>{formatDate(job.createdAt)}</TableCell>
                      <TableCell>{getStatusBadge(job.status)}</TableCell>
                      <TableCell className="text-right font-medium">{formatPrice(job.totalPrice)}</TableCell>
                      <TableCell>
                        <Link href={`/track?id=${job.trackingNumber}`}>
                          <Button variant="ghost" size="icon" data-testid={`button-view-order-${job.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No orders yet</p>
                <Link href="/book">
                  <Button className="mt-4" data-testid="button-first-booking">
                    <Plus className="mr-2 h-4 w-4" />
                    Book Your First Delivery
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
