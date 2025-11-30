import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Link } from 'wouter';
import {
  Package,
  Users,
  Truck,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  MapPin,
  FileText,
  ArrowRight,
  Eye,
} from 'lucide-react';

const stats = [
  { title: "Today's Jobs", value: '47', change: '+12%', icon: Package, color: 'text-blue-500' },
  { title: 'Active Drivers', value: '23', change: '+3', icon: Truck, color: 'text-green-500' },
  { title: "Today's Revenue", value: '£2,456', change: '+18%', icon: TrendingUp, color: 'text-primary' },
  { title: 'Pending Approvals', value: '5', change: '', icon: FileText, color: 'text-yellow-500' },
];

const recentJobs = [
  { id: 'RC001234', customer: 'John Smith', pickup: 'EC1A 1BB', delivery: 'SW1A 1AA', status: 'in_progress', driver: 'Mike Wilson', amount: '£45.00' },
  { id: 'RC001235', customer: 'Sarah Johnson', pickup: 'W1D 3QS', delivery: 'E14 5HP', status: 'pending', driver: null, amount: '£32.50' },
  { id: 'RC001236', customer: 'ABC Corp', pickup: 'N1 9GU', delivery: 'SE1 7PB', status: 'delivered', driver: 'Tom Brown', amount: '£67.00' },
  { id: 'RC001237', customer: 'Emily Davis', pickup: 'NW1 6XE', delivery: 'SW3 1AY', status: 'in_progress', driver: 'James Lee', amount: '£28.00' },
  { id: 'RC001238', customer: 'Tech Solutions', pickup: 'EC2A 4NE', delivery: 'W2 1NY', status: 'cancelled', driver: null, amount: '£0.00' },
];

const pendingDocuments = [
  { driver: 'Alex Turner', type: 'Driving Licence', uploaded: '2 hours ago' },
  { driver: 'Sarah Williams', type: 'Insurance', uploaded: '4 hours ago' },
  { driver: 'Chris Evans', type: 'Right to Work', uploaded: '1 day ago' },
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'delivered':
      return <Badge className="bg-green-500 text-white">Delivered</Badge>;
    case 'in_progress':
      return <Badge className="bg-blue-500 text-white">In Progress</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-500 text-white">Pending</Badge>;
    case 'cancelled':
      return <Badge className="bg-red-500 text-white">Cancelled</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export default function AdminDashboard() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Overview of your courier operations</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, idx) => (
            <Card key={idx}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                {stat.change && (
                  <p className="text-xs text-muted-foreground">
                    <span className="text-green-500">{stat.change}</span> from yesterday
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Jobs</CardTitle>
                <CardDescription>Latest delivery orders</CardDescription>
              </div>
              <Link href="/admin/jobs">
                <Button variant="outline" size="sm">
                  View All <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-sm">{job.id}</TableCell>
                      <TableCell>{job.customer}</TableCell>
                      <TableCell className="text-sm">
                        {job.pickup} → {job.delivery}
                      </TableCell>
                      <TableCell>{job.driver || '—'}</TableCell>
                      <TableCell>{getStatusBadge(job.status)}</TableCell>
                      <TableCell className="text-right font-medium">{job.amount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Pending Documents</CardTitle>
                <Link href="/admin/documents">
                  <Button variant="ghost" size="sm">
                    <Eye className="h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pendingDocuments.map((doc, idx) => (
                    <div key={idx} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{doc.driver}</p>
                        <p className="text-xs text-muted-foreground">{doc.type}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{doc.uploaded}</span>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500">
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500">
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/admin/jobs">
                  <Button variant="outline" className="w-full justify-start">
                    <Package className="mr-2 h-4 w-4" />
                    Manage Jobs
                  </Button>
                </Link>
                <Link href="/admin/drivers">
                  <Button variant="outline" className="w-full justify-start">
                    <Users className="mr-2 h-4 w-4" />
                    Manage Drivers
                  </Button>
                </Link>
                <Link href="/admin/map">
                  <Button variant="outline" className="w-full justify-start">
                    <MapPin className="mr-2 h-4 w-4" />
                    Live Map
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
