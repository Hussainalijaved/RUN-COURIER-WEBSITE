import { Link } from 'wouter';
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
import {
  Package,
  Clock,
  CheckCircle,
  MapPin,
  ArrowRight,
  Plus,
  Eye,
  Truck,
} from 'lucide-react';
import type { JobStatus } from '@shared/schema';

const mockOrders = [
  { id: 'RC001234', pickup: 'EC1A 1BB', delivery: 'SW1A 1AA', status: 'on_the_way_delivery' as JobStatus, driver: 'Mike Wilson', amount: '£45.00', date: '2024-01-15' },
  { id: 'RC001230', pickup: 'W1D 3QS', delivery: 'E14 5HP', status: 'delivered' as JobStatus, driver: 'Tom Brown', amount: '£32.50', date: '2024-01-14' },
  { id: 'RC001225', pickup: 'N1 9GU', delivery: 'SE1 7PB', status: 'delivered' as JobStatus, driver: 'James Lee', amount: '£28.00', date: '2024-01-12' },
];

const stats = [
  { title: 'Total Orders', value: '24', icon: Package },
  { title: 'Active', value: '1', icon: Truck },
  { title: 'Delivered', value: '23', icon: CheckCircle },
];

const getStatusBadge = (status: JobStatus) => {
  switch (status) {
    case 'delivered':
      return <Badge className="bg-green-500 text-white">Delivered</Badge>;
    case 'on_the_way_delivery':
      return <Badge className="bg-blue-500 text-white">Out for Delivery</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-500 text-white">Pending</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export default function CustomerDashboard() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Dashboard</h1>
            <p className="text-muted-foreground">Welcome back! Here's your delivery overview.</p>
          </div>
          <Link href="/book">
            <Button data-testid="button-new-booking">
              <Plus className="mr-2 h-4 w-4" />
              New Booking
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((stat, idx) => (
            <Card key={idx}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className="h-5 w-5 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {mockOrders.some(o => o.status === 'on_the_way_delivery') && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary animate-pulse" />
                Active Delivery
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mockOrders.filter(o => o.status === 'on_the_way_delivery').map((order) => (
                <div key={order.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="font-mono font-bold">{order.id}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {order.pickup} → {order.delivery}
                      </span>
                    </div>
                    <div className="text-sm mt-1">Driver: {order.driver}</div>
                  </div>
                  <Link href={`/track?id=${order.id}`}>
                    <Button data-testid="button-track-active">
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
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Your delivery history</CardDescription>
            </div>
            <Link href="/customer/orders">
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
                  <TableHead>Route</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono">{order.id}</TableCell>
                    <TableCell>
                      {order.pickup} → {order.delivery}
                    </TableCell>
                    <TableCell>{order.date}</TableCell>
                    <TableCell>{getStatusBadge(order.status)}</TableCell>
                    <TableCell className="text-right font-medium">{order.amount}</TableCell>
                    <TableCell>
                      <Link href={`/track?id=${order.id}`}>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
