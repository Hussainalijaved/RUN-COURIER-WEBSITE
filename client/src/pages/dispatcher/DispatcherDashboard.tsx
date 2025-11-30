import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Package,
  Users,
  Clock,
  MapPin,
  Search,
  UserPlus,
  Truck,
  CheckCircle,
  Radio,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Job, Driver, User } from '@shared/schema';

interface DispatcherStats {
  pendingJobs: number;
  activeDrivers: number;
  inProgressJobs: number;
  deliveredToday: number;
}

export default function DispatcherDashboard() {
  const { toast } = useToast();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: stats, isLoading: statsLoading } = useQuery<DispatcherStats>({
    queryKey: ['/api/stats/dispatcher'],
  });

  const { data: pendingJobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ['/api/jobs', { status: 'pending' }],
  });

  const { data: drivers, isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users', { role: 'driver' }],
  });

  const assignMutation = useMutation({
    mutationFn: async ({ jobId, driverId }: { jobId: string; driverId: string }) => {
      return apiRequest(`/api/jobs/${jobId}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ driverId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats/dispatcher'] });
      toast({ title: 'Driver assigned successfully' });
      setSelectedJob(null);
    },
    onError: () => {
      toast({ title: 'Failed to assign driver', variant: 'destructive' });
    },
  });

  const getDriverUser = (userId: string) => {
    return users?.find((u) => u.id === userId);
  };

  const availableDrivers = drivers?.filter((d) => d.isAvailable && d.isVerified) || [];

  const filteredDrivers = availableDrivers.filter((driver) => {
    const user = getDriverUser(driver.userId);
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      user?.fullName?.toLowerCase().includes(searchLower) ||
      driver.vehicleRegistration?.toLowerCase().includes(searchLower);
    
    if (!selectedJob) return matchesSearch;
    return matchesSearch && driver.vehicleType === selectedJob.vehicleType;
  });

  const formatPrice = (price: string | number) => {
    const num = typeof price === 'string' ? parseFloat(price) : price;
    return `£${num.toFixed(2)}`;
  };

  const statCards = [
    { title: 'Pending Jobs', value: stats?.pendingJobs || 0, icon: Clock, color: 'text-yellow-500' },
    { title: 'Active Drivers', value: stats?.activeDrivers || 0, icon: Truck, color: 'text-green-500' },
    { title: 'In Progress', value: stats?.inProgressJobs || 0, icon: Radio, color: 'text-blue-500' },
    { title: 'Delivered Today', value: stats?.deliveredToday || 0, icon: CheckCircle, color: 'text-primary' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Dispatch Center</h1>
          <p className="text-muted-foreground">Assign drivers to pending jobs</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {statCards.map((stat, idx) => (
            <Card key={idx} data-testid={`stat-${stat.title.toLowerCase().replace(/\s/g, '-')}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <div className="text-2xl font-bold">{stat.value}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Pending Jobs
              </CardTitle>
              <CardDescription>Jobs waiting for driver assignment</CardDescription>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : pendingJobs && pendingJobs.length > 0 ? (
                <div className="space-y-3">
                  {pendingJobs.map((job) => (
                    <div
                      key={job.id}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedJob?.id === job.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-primary/50'
                      }`}
                      onClick={() => setSelectedJob(job)}
                      data-testid={`pending-job-${job.id}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono font-medium">{job.trackingNumber}</span>
                        <span className="text-sm font-bold text-primary">{formatPrice(job.totalPrice)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-sm">
                        <MapPin className="h-3 w-3 text-green-500" />
                        {job.pickupPostcode}
                        <span>→</span>
                        <MapPin className="h-3 w-3 text-red-500" />
                        {job.deliveryPostcode}
                      </div>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="capitalize">{job.vehicleType?.replace('_', ' ')}</Badge>
                        <Badge variant="outline">{job.weight}kg</Badge>
                        {job.isUrgent && <Badge className="bg-red-500 text-white">Urgent</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                  <p className="text-muted-foreground">All jobs have been assigned</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Available Drivers
              </CardTitle>
              <CardDescription>
                {selectedJob
                  ? `Drivers matching ${selectedJob.vehicleType?.replace('_', ' ')}`
                  : 'Select a job to see matching drivers'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search drivers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-drivers"
                />
              </div>
              {driversLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3 pr-4">
                    {filteredDrivers.length > 0 ? (
                      filteredDrivers.map((driver) => {
                        const user = getDriverUser(driver.userId);
                        const initials = user?.fullName?.split(' ').map((n) => n[0]).join('') || 'D';
                        return (
                          <div
                            key={driver.id}
                            className="flex items-center justify-between p-4 rounded-lg border hover:border-primary/50 transition-colors"
                            data-testid={`driver-${driver.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarFallback className="bg-primary text-primary-foreground">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium">{user?.fullName || 'Unknown'}</div>
                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                  <Truck className="h-3 w-3" />
                                  <span className="capitalize">{driver.vehicleType?.replace('_', ' ')}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {driver.totalJobs || 0} jobs • Rating: {driver.rating || '5.0'}
                                </div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              disabled={!selectedJob || assignMutation.isPending}
                              onClick={() => selectedJob && assignMutation.mutate({ jobId: selectedJob.id, driverId: driver.id })}
                              data-testid={`button-assign-${driver.id}`}
                            >
                              {assignMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <UserPlus className="h-4 w-4 mr-2" />
                                  Assign
                                </>
                              )}
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                        <p className="text-muted-foreground">
                          {selectedJob 
                            ? `No available ${selectedJob.vehicleType?.replace('_', ' ')} drivers`
                            : 'No available drivers'
                          }
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
