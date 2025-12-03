import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Package,
  MapPin,
  Calendar,
  TrendingUp,
  CheckCircle,
  Search,
} from 'lucide-react';
import { useState } from 'react';
import {
  useDriver,
  useDriverJobs,
} from '@/hooks/useSupabaseDriver';

const formatPrice = (price: string | number) => {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return `£${num.toFixed(2)}`;
};

const formatDate = (date: Date | string | null) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export default function DriverHistory() {
  const [searchTerm, setSearchTerm] = useState('');

  const { data: driver } = useDriver();
  const { data: myJobs, isLoading } = useDriverJobs(driver?.id);

  const completedJobs = myJobs?.filter((j) => j.status === 'delivered') || [];
  
  const filteredJobs = completedJobs.filter((job) => 
    job.trackingNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.pickupPostcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.deliveryPostcode?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDriverPayment = (job: { driverPrice?: string | null; totalPrice?: string | number }) => {
    if (job.driverPrice) {
      return parseFloat(job.driverPrice);
    }
    return typeof job.totalPrice === 'string' ? parseFloat(job.totalPrice) : (job.totalPrice || 0);
  };

  const totalEarnings = completedJobs.reduce((sum, job) => {
    return sum + getDriverPayment(job);
  }, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Delivery History</h1>
            <p className="text-muted-foreground">View your completed deliveries</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card data-testid="stat-total-jobs">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Completed</CardTitle>
              <CheckCircle className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedJobs.length}</div>
              <p className="text-xs text-muted-foreground">deliveries</p>
            </CardContent>
          </Card>
          <Card data-testid="stat-total-earnings">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
              <TrendingUp className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(totalEarnings)}</div>
              <p className="text-xs text-muted-foreground">lifetime</p>
            </CardContent>
          </Card>
          <Card data-testid="stat-avg-earnings">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Per Delivery</CardTitle>
              <Package className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatPrice(completedJobs.length > 0 ? totalEarnings / completedJobs.length : 0)}
              </div>
              <p className="text-xs text-muted-foreground">per job</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle>Completed Deliveries</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by tracking or postcode..."
                  className="pl-10 w-full sm:w-64"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : filteredJobs.length > 0 ? (
              <div className="space-y-3">
                {filteredJobs.map((job) => (
                  <div 
                    key={job.id} 
                    className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg border gap-4"
                    data-testid={`history-job-${job.id}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono font-medium">{job.trackingNumber}</span>
                        <Badge variant="secondary" className="text-green-600">
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Delivered
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        <span>{job.pickupPostcode} → {job.deliveryPostcode}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(job.updatedAt)}</span>
                        <span>•</span>
                        <span>{job.distance} miles</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-600 text-lg">{formatPrice(getDriverPayment(job))}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchTerm ? 'No deliveries match your search' : 'No completed deliveries yet'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchTerm ? 'Try a different search term' : 'Complete your first delivery to see it here'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
