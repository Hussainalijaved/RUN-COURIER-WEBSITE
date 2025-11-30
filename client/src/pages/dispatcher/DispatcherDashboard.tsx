import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Package,
  Users,
  Clock,
  MapPin,
  Search,
  UserPlus,
  Truck,
  CheckCircle,
  Radio,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { JobStatus } from '@shared/schema';

const stats = [
  { title: 'Pending Jobs', value: '8', icon: Clock, color: 'text-yellow-500' },
  { title: 'Active Drivers', value: '12', icon: Truck, color: 'text-green-500' },
  { title: 'In Progress', value: '15', icon: Radio, color: 'text-blue-500' },
  { title: 'Delivered Today', value: '47', icon: CheckCircle, color: 'text-primary' },
];

const pendingJobs = [
  { id: 'RC001240', customer: 'Tech Corp', pickup: 'EC2A 4NE', delivery: 'W2 1NY', vehicleType: 'car', weight: 8, urgency: 'high' },
  { id: 'RC001241', customer: 'Sarah Williams', pickup: 'SW1A 1AA', delivery: 'NW1 6XE', vehicleType: 'motorbike', weight: 2, urgency: 'normal' },
  { id: 'RC001242', customer: 'Legal Docs Ltd', pickup: 'WC2A 1PL', delivery: 'EC4A 1BD', vehicleType: 'motorbike', weight: 1, urgency: 'high' },
  { id: 'RC001243', customer: 'Home Goods', pickup: 'N1 9GU', delivery: 'SE1 7PB', vehicleType: 'small_van', weight: 45, urgency: 'normal' },
];

const availableDrivers = [
  { id: 'd1', name: 'Mike Wilson', vehicle: 'Car', location: 'EC1A', rating: 4.9, jobsToday: 5, distance: '0.8 miles' },
  { id: 'd2', name: 'Tom Brown', vehicle: 'Motorbike', location: 'W1D', rating: 4.7, jobsToday: 7, distance: '1.2 miles' },
  { id: 'd3', name: 'James Lee', vehicle: 'Car', location: 'SE1', rating: 4.8, jobsToday: 4, distance: '2.1 miles' },
  { id: 'd4', name: 'Sarah Miller', vehicle: 'Small Van', location: 'N1', rating: 4.6, jobsToday: 3, distance: '0.5 miles' },
];

const getUrgencyBadge = (urgency: string) => {
  if (urgency === 'high') {
    return <Badge className="bg-red-500 text-white">Urgent</Badge>;
  }
  return <Badge variant="secondary">Normal</Badge>;
};

export default function DispatcherDashboard() {
  const { toast } = useToast();
  const [selectedJob, setSelectedJob] = useState<typeof pendingJobs[0] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleAssign = (driverId: string, driverName: string) => {
    toast({
      title: 'Driver Assigned',
      description: `${driverName} has been assigned to job ${selectedJob?.id}`,
    });
    setSelectedJob(null);
  };

  const filteredDrivers = availableDrivers.filter(driver => {
    if (!selectedJob) return true;
    return driver.vehicle.toLowerCase().replace(' ', '_') === selectedJob.vehicleType ||
           (selectedJob.vehicleType === 'car' && driver.vehicle === 'Car') ||
           (selectedJob.vehicleType === 'motorbike' && driver.vehicle === 'Motorbike') ||
           (selectedJob.vehicleType === 'small_van' && driver.vehicle === 'Small Van');
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dispatch Center</h1>
          <p className="text-muted-foreground">Assign drivers to pending jobs</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
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
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-medium">{job.id}</span>
                      {getUrgencyBadge(job.urgency)}
                    </div>
                    <div className="text-sm text-muted-foreground">{job.customer}</div>
                    <div className="flex items-center gap-2 mt-2 text-sm">
                      <MapPin className="h-3 w-3 text-green-500" />
                      {job.pickup}
                      <span>→</span>
                      <MapPin className="h-3 w-3 text-red-500" />
                      {job.delivery}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline" className="capitalize">{job.vehicleType.replace('_', ' ')}</Badge>
                      <Badge variant="outline">{job.weight}kg</Badge>
                    </div>
                  </div>
                ))}
              </div>
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
                  ? `Drivers matching ${selectedJob.vehicleType.replace('_', ' ')}`
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
              <ScrollArea className="h-[400px]">
                <div className="space-y-3 pr-4">
                  {filteredDrivers.map((driver) => (
                    <div
                      key={driver.id}
                      className="flex items-center justify-between p-4 rounded-lg border hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {driver.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{driver.name}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <Truck className="h-3 w-3" />
                            {driver.vehicle}
                            <span className="text-xs">•</span>
                            {driver.distance} away
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {driver.jobsToday} jobs today • Rating: {driver.rating}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={!selectedJob}
                        onClick={() => handleAssign(driver.id, driver.name)}
                        data-testid={`assign-driver-${driver.id}`}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Assign
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
