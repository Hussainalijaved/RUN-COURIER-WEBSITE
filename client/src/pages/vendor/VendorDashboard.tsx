import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Package,
  Key,
  Plus,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Clock,
  CheckCircle,
  TrendingUp,
  Code,
} from 'lucide-react';
import type { JobStatus } from '@shared/schema';

const stats = [
  { title: 'API Calls Today', value: '1,234', icon: Code, color: 'text-blue-500' },
  { title: 'Jobs Created', value: '156', icon: Package, color: 'text-primary' },
  { title: 'Success Rate', value: '99.2%', icon: CheckCircle, color: 'text-green-500' },
  { title: 'Monthly Spend', value: '£2,456', icon: TrendingUp, color: 'text-purple-500' },
];

const mockApiKeys = [
  { id: 'key1', name: 'Production', key: 'sk_live_xxxx...xxxx', created: '2024-01-01', lastUsed: '2 mins ago', status: 'active' },
  { id: 'key2', name: 'Development', key: 'sk_test_xxxx...xxxx', created: '2024-01-10', lastUsed: '1 hour ago', status: 'active' },
];

const recentJobs = [
  { id: 'RC001234', pickup: 'EC1A 1BB', delivery: 'SW1A 1AA', status: 'delivered' as JobStatus, created: '2024-01-15 09:30' },
  { id: 'RC001235', pickup: 'W1D 3QS', delivery: 'E14 5HP', status: 'on_the_way_delivery' as JobStatus, created: '2024-01-15 10:15' },
  { id: 'RC001236', pickup: 'N1 9GU', delivery: 'SE1 7PB', status: 'pending' as JobStatus, created: '2024-01-15 10:45' },
];

const getStatusBadge = (status: JobStatus) => {
  switch (status) {
    case 'delivered':
      return <Badge className="bg-green-500 text-white">Delivered</Badge>;
    case 'on_the_way_delivery':
      return <Badge className="bg-blue-500 text-white">In Transit</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-500 text-white">Pending</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export default function VendorDashboard() {
  const { toast } = useToast();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [newKeyName, setNewKeyName] = useState('');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'API key copied to clipboard',
    });
  };

  const toggleKeyVisibility = (keyId: string) => {
    setShowKeys((prev) => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const createNewKey = () => {
    toast({
      title: 'API Key Created',
      description: `New API key "${newKeyName}" has been created.`,
    });
    setNewKeyName('');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Vendor Dashboard</h1>
          <p className="text-muted-foreground">Manage your API integration and deliveries</p>
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

        <Tabs defaultValue="api-keys" className="space-y-6">
          <TabsList>
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="jobs">Recent Jobs</TabsTrigger>
            <TabsTrigger value="docs">Documentation</TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>Manage your API authentication keys</CardDescription>
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button data-testid="button-create-key">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create API Key</DialogTitle>
                      <DialogDescription>
                        Create a new API key for your application
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Key Name</Label>
                        <Input
                          placeholder="e.g., Production"
                          value={newKeyName}
                          onChange={(e) => setNewKeyName(e.target.value)}
                          data-testid="input-key-name"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={createNewKey} data-testid="button-confirm-create">
                        Create Key
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mockApiKeys.map((apiKey) => (
                      <TableRow key={apiKey.id}>
                        <TableCell className="font-medium">{apiKey.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-sm bg-muted px-2 py-1 rounded">
                              {showKeys[apiKey.id] ? 'sk_live_1234567890abcdef' : apiKey.key}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleKeyVisibility(apiKey.id)}
                            >
                              {showKeys[apiKey.id] ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>{apiKey.created}</TableCell>
                        <TableCell>{apiKey.lastUsed}</TableCell>
                        <TableCell>
                          <Badge className="bg-green-500 text-white">Active</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => copyToClipboard('sk_live_1234567890abcdef')}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon">
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs">
            <Card>
              <CardHeader>
                <CardTitle>Recent API Jobs</CardTitle>
                <CardDescription>Jobs created via the API</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job ID</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentJobs.map((job) => (
                      <TableRow key={job.id}>
                        <TableCell className="font-mono">{job.id}</TableCell>
                        <TableCell>{job.pickup} → {job.delivery}</TableCell>
                        <TableCell>{job.created}</TableCell>
                        <TableCell>{getStatusBadge(job.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="docs">
            <Card>
              <CardHeader>
                <CardTitle>API Documentation</CardTitle>
                <CardDescription>Quick reference for integrating with Run Courier API</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="font-semibold mb-2">Authentication</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Include your API key in the Authorization header:
                  </p>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`Authorization: Bearer sk_live_your_api_key`}
                  </pre>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Create a Job</h3>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`POST /api/v1/jobs

{
  "pickup": {
    "postcode": "EC1A 1BB",
    "address": "123 High Street",
    "contact_name": "John Smith",
    "phone": "07700900001"
  },
  "delivery": {
    "postcode": "SW1A 1AA",
    "address": "456 Oxford Road",
    "contact_name": "Sarah Johnson",
    "phone": "07700900002"
  },
  "vehicle_type": "car",
  "weight": 5,
  "description": "Important documents"
}`}
                  </pre>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Track a Job</h3>
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
{`GET /api/v1/jobs/{job_id}

Response:
{
  "id": "RC001234",
  "status": "on_the_way_delivery",
  "driver": {
    "name": "Mike Wilson",
    "location": { "lat": 51.5074, "lng": -0.1278 }
  },
  "eta": "14:30"
}`}
                  </pre>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">Webhooks</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure webhook URLs in your dashboard to receive real-time updates
                    when job status changes. Webhook events include: job.created, job.assigned,
                    job.collected, job.delivered, job.cancelled.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
