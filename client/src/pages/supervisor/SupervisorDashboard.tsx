import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, Users, MapPin, Clock, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import { useLocation } from 'wouter';
import { supabase } from '@/lib/supabase';

async function fetchWithAuth(url: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
}

export default function SupervisorDashboard() {
  const [, setLocation] = useLocation();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['/api/supervisor/stats'],
    queryFn: () => fetchWithAuth('/api/supervisor/stats'),
    refetchInterval: 30000,
  });

  const { data: recentJobs } = useQuery<any[]>({
    queryKey: ['/api/jobs', 'supervisor-recent'],
    queryFn: () => fetch('/api/jobs?limit=5').then(r => r.json()),
    refetchInterval: 30000,
  });

  const statCards = [
    { label: 'Total Jobs', value: stats?.totalJobs ?? '—', icon: Package, color: 'text-blue-600' },
    { label: 'Pending', value: stats?.pendingJobs ?? '—', icon: Clock, color: 'text-amber-600' },
    { label: 'Active', value: stats?.activeJobs ?? '—', icon: AlertCircle, color: 'text-orange-600' },
    { label: 'Completed', value: stats?.completedJobs ?? '—', icon: CheckCircle, color: 'text-green-600' },
    { label: 'Active Drivers', value: stats?.activeDrivers ?? '—', icon: Users, color: 'text-purple-600' },
    { label: 'Customers', value: stats?.totalCustomers ?? '—', icon: Users, color: 'text-indigo-600' },
  ];

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    assigned: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    accepted: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    collected: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Supervisor Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Overview of current operations</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setLocation('/supervisor/jobs/create')} data-testid="button-create-job">
              <Plus className="h-4 w-4 mr-2" />
              Create Job
            </Button>
            <Button variant="outline" onClick={() => setLocation('/supervisor/map')} data-testid="button-live-map">
              <MapPin className="h-4 w-4 mr-2" />
              Live Map
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {isLoading ? <span className="animate-pulse text-muted-foreground">—</span> : card.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-base">Recent Jobs</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setLocation('/supervisor/jobs')} data-testid="button-view-all-jobs">
                View all
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {!recentJobs || recentJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-6">No jobs found.</p>
              ) : (
                <div className="divide-y">
                  {recentJobs.slice(0, 5).map((job: any) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between px-6 py-3 hover-elevate cursor-pointer"
                      onClick={() => setLocation('/supervisor/jobs')}
                      data-testid={`row-job-${job.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          #{job.trackingNumber || job.id?.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {job.pickupAddress} → {job.deliveryAddress}
                        </p>
                      </div>
                      <Badge className={`ml-3 shrink-0 text-xs ${statusColors[job.status] || ''}`}>
                        {job.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {[
                { label: 'Create Job', href: '/supervisor/jobs/create', icon: Plus },
                { label: 'All Jobs', href: '/supervisor/jobs', icon: Package },
                { label: 'Live Map', href: '/supervisor/map', icon: MapPin },
                { label: 'Drivers', href: '/supervisor/drivers', icon: Users },
                { label: 'Customers', href: '/supervisor/customers', icon: Users },
                { label: 'Invoices', href: '/supervisor/invoices', icon: Package },
              ].map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  className="justify-start gap-2"
                  onClick={() => setLocation(action.href)}
                  data-testid={`button-quick-${action.label.toLowerCase().replace(' ', '-')}`}
                >
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
