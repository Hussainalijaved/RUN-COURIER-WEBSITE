import { useState, useEffect } from 'react';
import { Link, useSearch } from 'wouter';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, LoadingTimeout } from '@/components/ErrorState';
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
  Package,
  Clock,
  CheckCircle,
  MapPin,
  ArrowLeft,
  Eye,
  Truck,
  XCircle,
  Filter,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'wouter';
import type { Job, JobStatus } from '@shared/schema';

type FilterType = 'all' | 'active' | 'delivered' | 'cancelled';

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

const formatPrice = (price: string | number | null | undefined) => {
  if (price === null || price === undefined) return '£0.00';
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return `£${(num || 0).toFixed(2)}`;
};

const formatDate = (date: Date | string | null) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

export default function CustomerOrders() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const filterParam = params.get('filter') as FilterType || 'all';

  const { data: jobs, isLoading, isError, refetch } = useQuery<Job[]>({
    queryKey: ['/api/jobs', { customerId: user?.id }],
    enabled: !!user?.id,
    retry: 2,
    retryDelay: 1000,
  });
  
  // Loading timeout detection
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading) {
      timer = setTimeout(() => setLoadingTooLong(true), 10000);
    } else {
      setLoadingTooLong(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  const filterJobs = (jobs: Job[], filter: FilterType): Job[] => {
    switch (filter) {
      case 'active':
        return jobs.filter(j => !['delivered', 'cancelled'].includes(j.status));
      case 'delivered':
        return jobs.filter(j => j.status === 'delivered');
      case 'cancelled':
        return jobs.filter(j => j.status === 'cancelled');
      default:
        return jobs;
    }
  };

  const filteredJobs = jobs ? filterJobs(jobs, filterParam) : [];

  const handleFilterChange = (value: FilterType) => {
    if (value === 'all') {
      setLocation('/customer/orders');
    } else {
      setLocation(`/customer/orders?filter=${value}`);
    }
  };

  const getFilterLabel = (filter: FilterType) => {
    switch (filter) {
      case 'active': return 'Active Orders';
      case 'delivered': return 'Delivered Orders';
      case 'cancelled': return 'Cancelled Orders';
      default: return 'All Orders';
    }
  };

  const getFilterIcon = (filter: FilterType) => {
    switch (filter) {
      case 'active': return <Truck className="h-4 w-4 text-blue-500" />;
      case 'delivered': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'cancelled': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Package className="h-4 w-4 text-primary" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <Link href="/customer">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
                {getFilterIcon(filterParam)}
                {getFilterLabel(filterParam)}
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                {filterParam === 'all' 
                  ? 'View all your past and current deliveries' 
                  : `Showing ${filterParam} orders only`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterParam} onValueChange={(value) => handleFilterChange(value as FilterType)}>
              <SelectTrigger className="w-[180px]" data-testid="select-filter">
                <SelectValue placeholder="Filter orders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="filter-all">All Orders</SelectItem>
                <SelectItem value="active" data-testid="filter-active">Active</SelectItem>
                <SelectItem value="delivered" data-testid="filter-delivered">Delivered</SelectItem>
                <SelectItem value="cancelled" data-testid="filter-cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Orders ({filteredJobs.length})
            </CardTitle>
            <CardDescription>
              {filterParam === 'all' 
                ? 'Complete list of all your deliveries' 
                : `Filtered to show ${filterParam} orders`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isError ? (
              <ErrorState 
                title="Failed to load orders"
                message="We couldn't fetch your orders. Please check your connection and try again."
                onRetry={() => refetch()}
              />
            ) : isLoading ? (
              <div className="space-y-4">
                {loadingTooLong && (
                  <LoadingTimeout 
                    message="Loading is taking longer than expected. Please wait or try refreshing."
                    onRetry={() => refetch()}
                  />
                )}
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredJobs.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job No.</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobs.map((job) => (
                      <TableRow key={job.id} data-testid={`row-order-${job.id}`}>
                        <TableCell>
                          <div className="font-mono font-medium">{(job as any).jobNumber || '—'}</div>
                          <div className="text-xs text-muted-foreground">{job.trackingNumber}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {job.pickupPostcode} → {job.deliveryPostcode}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {formatDate(job.createdAt)}
                          </div>
                        </TableCell>
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
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                {filterParam === 'all' ? (
                  <>
                    <Package className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-2">No orders yet</p>
                    <Link href="/book">
                      <Button data-testid="button-first-booking">
                        Book Your First Delivery
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    {getFilterIcon(filterParam)}
                    <p className="text-muted-foreground mt-4 mb-2">No {filterParam} orders found</p>
                    <Button variant="outline" onClick={() => handleFilterChange('all')} data-testid="button-show-all">
                      Show All Orders
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
