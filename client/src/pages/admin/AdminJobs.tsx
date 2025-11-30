import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  UserPlus,
  XCircle,
  MapPin,
  Clock,
  Package,
} from 'lucide-react';
import type { JobStatus } from '@shared/schema';

const mockJobs = [
  { id: 'RC001234', trackingNumber: 'RC001234', customer: 'John Smith', customerEmail: 'john@example.com', pickup: '123 High Street, EC1A 1BB', delivery: '456 Oxford Road, SW1A 1AA', status: 'on_the_way_delivery' as JobStatus, driver: 'Mike Wilson', driverId: 'd1', vehicleType: 'car', weight: 5, distance: 8.5, amount: 45.00, createdAt: '2024-01-15 09:30' },
  { id: 'RC001235', trackingNumber: 'RC001235', customer: 'Sarah Johnson', customerEmail: 'sarah@example.com', pickup: '78 Bond Street, W1D 3QS', delivery: '90 Canary Wharf, E14 5HP', status: 'pending' as JobStatus, driver: null, driverId: null, vehicleType: 'small_van', weight: 25, distance: 12.3, amount: 67.50, createdAt: '2024-01-15 10:15' },
  { id: 'RC001236', trackingNumber: 'RC001236', customer: 'ABC Corp', customerEmail: 'orders@abccorp.com', pickup: '12 Angel Lane, N1 9GU', delivery: '34 London Bridge, SE1 7PB', status: 'delivered' as JobStatus, driver: 'Tom Brown', driverId: 'd2', vehicleType: 'motorbike', weight: 2, distance: 5.2, amount: 28.00, createdAt: '2024-01-15 08:00' },
  { id: 'RC001237', trackingNumber: 'RC001237', customer: 'Emily Davis', customerEmail: 'emily@email.com', pickup: '56 Camden Road, NW1 6XE', delivery: '78 Chelsea, SW3 1AY', status: 'collected' as JobStatus, driver: 'James Lee', driverId: 'd3', vehicleType: 'car', weight: 8, distance: 7.8, amount: 42.00, createdAt: '2024-01-15 11:00' },
  { id: 'RC001238', trackingNumber: 'RC001238', customer: 'Tech Solutions', customerEmail: 'info@techsolutions.com', pickup: '100 Shoreditch, EC2A 4NE', delivery: '200 Paddington, W2 1NY', status: 'cancelled' as JobStatus, driver: null, driverId: null, vehicleType: 'medium_van', weight: 50, distance: 6.1, amount: 0.00, createdAt: '2024-01-15 07:45' },
];

const mockDrivers = [
  { id: 'd1', name: 'Mike Wilson', vehicle: 'car', available: true },
  { id: 'd2', name: 'Tom Brown', vehicle: 'motorbike', available: true },
  { id: 'd3', name: 'James Lee', vehicle: 'car', available: false },
  { id: 'd4', name: 'Sarah Miller', vehicle: 'small_van', available: true },
];

const getStatusBadge = (status: JobStatus) => {
  const statusConfig: Record<JobStatus, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-yellow-500' },
    assigned: { label: 'Assigned', className: 'bg-blue-400' },
    accepted: { label: 'Accepted', className: 'bg-blue-500' },
    on_the_way_pickup: { label: 'To Pickup', className: 'bg-indigo-500' },
    arrived_pickup: { label: 'At Pickup', className: 'bg-purple-500' },
    collected: { label: 'Collected', className: 'bg-cyan-500' },
    on_the_way_delivery: { label: 'Delivering', className: 'bg-blue-600' },
    delivered: { label: 'Delivered', className: 'bg-green-500' },
    cancelled: { label: 'Cancelled', className: 'bg-red-500' },
  };
  const config = statusConfig[status] || { label: status, className: 'bg-gray-500' };
  return <Badge className={`${config.className} text-white`}>{config.label}</Badge>;
};

export default function AdminJobs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedJob, setSelectedJob] = useState<typeof mockJobs[0] | null>(null);

  const filteredJobs = mockJobs.filter((job) => {
    const matchesSearch =
      job.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.customer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Jobs Management</h1>
            <p className="text-muted-foreground">View and manage all delivery jobs</p>
          </div>
          <Button data-testid="button-create-job">
            <Package className="mr-2 h-4 w-4" />
            Create Job
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by tracking number or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-jobs"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="on_the_way_pickup">To Pickup</SelectItem>
                  <SelectItem value="collected">Collected</SelectItem>
                  <SelectItem value="on_the_way_delivery">Delivering</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-sm">{job.trackingNumber}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{job.customer}</div>
                        <div className="text-xs text-muted-foreground">{job.customerEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-green-500" />
                          {job.pickup.split(',')[0]}
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-3 w-3 text-red-500" />
                          {job.delivery.split(',')[0]}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="capitalize">{job.vehicleType.replace('_', ' ')}</TableCell>
                    <TableCell>{job.driver || '—'}</TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell className="text-right font-medium">£{job.amount.toFixed(2)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`job-actions-${job.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedJob(job)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          {!job.driver && job.status === 'pending' && (
                            <DropdownMenuItem>
                              <UserPlus className="mr-2 h-4 w-4" />
                              Assign Driver
                            </DropdownMenuItem>
                          )}
                          {job.status !== 'delivered' && job.status !== 'cancelled' && (
                            <DropdownMenuItem className="text-destructive">
                              <XCircle className="mr-2 h-4 w-4" />
                              Cancel Job
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Job Details - {selectedJob?.trackingNumber}</DialogTitle>
              <DialogDescription>
                Created on {selectedJob?.createdAt}
              </DialogDescription>
            </DialogHeader>
            {selectedJob && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Pickup</h4>
                    <p className="text-sm">{selectedJob.pickup}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Delivery</h4>
                    <p className="text-sm">{selectedJob.delivery}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Vehicle</p>
                    <p className="font-medium capitalize">{selectedJob.vehicleType.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Weight</p>
                    <p className="font-medium">{selectedJob.weight} kg</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Distance</p>
                    <p className="font-medium">{selectedJob.distance} miles</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Amount</p>
                    <p className="font-medium">£{selectedJob.amount.toFixed(2)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {getStatusBadge(selectedJob.status)}
                  {selectedJob.driver && (
                    <Badge variant="outline">Driver: {selectedJob.driver}</Badge>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
