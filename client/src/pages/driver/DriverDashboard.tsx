import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Package,
  MapPin,
  Clock,
  Navigation,
  Phone,
  CheckCircle,
  TrendingUp,
  Star,
  Truck,
  ArrowRight,
} from 'lucide-react';
import type { JobStatus } from '@shared/schema';

const stats = [
  { title: "Today's Earnings", value: '£127.50', icon: TrendingUp, color: 'text-green-500' },
  { title: 'Jobs Completed', value: '5', icon: CheckCircle, color: 'text-blue-500' },
  { title: 'Rating', value: '4.9', icon: Star, color: 'text-yellow-500' },
];

const currentJob = {
  id: 'RC001234',
  status: 'on_the_way_pickup' as JobStatus,
  pickup: {
    address: '123 High Street, London EC1A 1BB',
    contact: 'John Smith',
    phone: '07700 900001',
    instructions: 'Ring doorbell, first floor',
  },
  delivery: {
    address: '456 Oxford Road, London SW1A 1AA',
    contact: 'Sarah Johnson',
    phone: '07700 900002',
    instructions: 'Leave with reception',
  },
  vehicleType: 'car',
  weight: 5,
  amount: '£45.00',
};

const availableJobs = [
  { id: 'RC001240', pickup: 'W1D 3QS', delivery: 'E14 5HP', distance: '8.2 miles', amount: '£38.00', vehicleType: 'car' },
  { id: 'RC001241', pickup: 'N1 9GU', delivery: 'SE1 7PB', distance: '5.5 miles', amount: '£28.00', vehicleType: 'car' },
  { id: 'RC001242', pickup: 'SW3 1AY', delivery: 'NW1 6XE', distance: '6.8 miles', amount: '£32.00', vehicleType: 'car' },
];

export default function DriverDashboard() {
  const [isOnline, setIsOnline] = useState(true);
  const [jobStatus, setJobStatus] = useState<JobStatus>(currentJob.status);

  const statusFlow: JobStatus[] = [
    'on_the_way_pickup',
    'arrived_pickup',
    'collected',
    'on_the_way_delivery',
    'delivered',
  ];

  const advanceStatus = () => {
    const currentIndex = statusFlow.indexOf(jobStatus);
    if (currentIndex < statusFlow.length - 1) {
      setJobStatus(statusFlow[currentIndex + 1]);
    }
  };

  const getStatusLabel = (status: JobStatus) => {
    const labels: Record<string, string> = {
      on_the_way_pickup: 'Heading to Pickup',
      arrived_pickup: 'Arrived at Pickup',
      collected: 'Parcel Collected',
      on_the_way_delivery: 'Heading to Delivery',
      delivered: 'Delivered',
    };
    return labels[status] || status;
  };

  const getNextActionLabel = (status: JobStatus) => {
    const actions: Record<string, string> = {
      on_the_way_pickup: 'Arrived at Pickup',
      arrived_pickup: 'Collected Parcel',
      collected: 'En Route to Delivery',
      on_the_way_delivery: 'Mark Delivered',
    };
    return actions[status] || 'Complete';
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Driver Dashboard</h1>
            <p className="text-muted-foreground">Manage your deliveries and availability</p>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="online-toggle" className="text-sm">
              {isOnline ? 'Online' : 'Offline'}
            </Label>
            <Switch
              id="online-toggle"
              checked={isOnline}
              onCheckedChange={setIsOnline}
              data-testid="switch-online"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((stat, idx) => (
            <Card key={idx}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {jobStatus !== 'delivered' && (
          <Card className="border-primary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  Current Job
                </CardTitle>
                <Badge className="bg-primary">{getStatusLabel(jobStatus)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className={`p-4 rounded-lg border-2 ${
                  jobStatus.includes('pickup') ? 'border-primary bg-primary/5' : 'border-border'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-green-500" />
                    <span className="font-semibold">Pickup</span>
                  </div>
                  <p className="text-sm mb-2">{currentJob.pickup.address}</p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{currentJob.pickup.contact}</span>
                    <a href={`tel:${currentJob.pickup.phone}`} className="flex items-center gap-1 text-primary">
                      <Phone className="h-3 w-3" />
                      Call
                    </a>
                  </div>
                  {currentJob.pickup.instructions && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Note: {currentJob.pickup.instructions}
                    </p>
                  )}
                </div>

                <div className={`p-4 rounded-lg border-2 ${
                  jobStatus.includes('delivery') || jobStatus === 'collected' ? 'border-primary bg-primary/5' : 'border-border'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-red-500" />
                    <span className="font-semibold">Delivery</span>
                  </div>
                  <p className="text-sm mb-2">{currentJob.delivery.address}</p>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{currentJob.delivery.contact}</span>
                    <a href={`tel:${currentJob.delivery.phone}`} className="flex items-center gap-1 text-primary">
                      <Phone className="h-3 w-3" />
                      Call
                    </a>
                  </div>
                  {currentJob.delivery.instructions && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Note: {currentJob.delivery.instructions}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="outline" className="flex-1">
                  <Navigation className="mr-2 h-4 w-4" />
                  Open in Maps
                </Button>
                <Button onClick={advanceStatus} className="flex-1" data-testid="button-advance-status">
                  <CheckCircle className="mr-2 h-4 w-4" />
                  {getNextActionLabel(jobStatus)}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isOnline && (
          <Card>
            <CardHeader>
              <CardTitle>Available Jobs</CardTitle>
              <CardDescription>Accept a job to start earning</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {availableJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-4 rounded-lg border hover:border-primary/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">{job.id}</span>
                        <Badge variant="outline" className="capitalize">{job.vehicleType}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {job.pickup} → {job.delivery}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        {job.distance}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-primary">{job.amount}</div>
                      <Button size="sm" className="mt-2" data-testid={`accept-job-${job.id}`}>
                        Accept
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
