import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/context/AuthContext';
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
  Code,
  CheckCircle,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import type { Job, VendorApiKey, JobStatus } from '@shared/schema';

interface VendorStats {
  apiCallsToday: number;
  jobsCreated: number;
  successRate: number;
  monthlySpend: number;
}

const getStatusBadge = (status: JobStatus) => {
  switch (status) {
    case 'delivered':
      return <Badge className="bg-green-500 text-white" data-testid={`badge-status-${status}`}>Delivered</Badge>;
    case 'on_the_way_delivery':
    case 'collected':
      return <Badge className="bg-blue-500 text-white" data-testid={`badge-status-${status}`}>In Transit</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-500 text-white" data-testid={`badge-status-${status}`}>Pending</Badge>;
    case 'cancelled':
      return <Badge className="bg-red-500 text-white" data-testid={`badge-status-${status}`}>Cancelled</Badge>;
    default:
      return <Badge data-testid={`badge-status-${status}`}>{status}</Badge>;
  }
};

const formatDate = (date: Date | string | null) => {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function VendorDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [newKeyName, setNewKeyName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<VendorStats>({
    queryKey: ['/api/stats/vendor', user?.id],
    enabled: !!user?.id,
  });

  const { data: apiKeys, isLoading: keysLoading } = useQuery<VendorApiKey[]>({
    queryKey: ['/api/vendor/api-keys', user?.id],
    enabled: !!user?.id,
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ['/api/jobs', { vendorId: user?.id }],
    enabled: !!user?.id,
  });

  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest('POST', '/api/vendor/api-keys', { name, userId: user?.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor/api-keys'] });
      toast({ title: 'API Key Created', description: `New API key "${newKeyName}" has been created.` });
      setNewKeyName('');
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: 'Failed to create API key', variant: 'destructive' });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      return apiRequest('DELETE', `/api/vendor/api-keys/${keyId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor/api-keys'] });
      toast({ title: 'API Key Deleted' });
    },
    onError: () => {
      toast({ title: 'Failed to delete API key', variant: 'destructive' });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: 'API key copied to clipboard' });
  };

  const toggleKeyVisibility = (keyId: string) => {
    setShowKeys((prev) => ({ ...prev, [keyId]: !prev[keyId] }));
  };

  const maskKey = (key: string) => {
    if (!key) return '—';
    return key.substring(0, 8) + '...' + key.substring(key.length - 4);
  };

  const statCards = [
    { title: 'API Calls Today', value: stats?.apiCallsToday || 0, icon: Code, color: 'text-blue-500' },
    { title: 'Jobs Created', value: stats?.jobsCreated || 0, icon: Package, color: 'text-primary' },
    { title: 'Success Rate', value: `${stats?.successRate || 100}%`, icon: CheckCircle, color: 'text-green-500' },
    { title: 'Monthly Spend', value: `£${(stats?.monthlySpend || 0).toFixed(2)}`, icon: TrendingUp, color: 'text-purple-500' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Vendor Dashboard</h1>
          <p className="text-muted-foreground">Manage your API integration and deliveries</p>
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
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{stat.value}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="api-keys" className="space-y-6">
          <TabsList>
            <TabsTrigger value="api-keys" data-testid="tab-api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="jobs" data-testid="tab-jobs">Recent Jobs</TabsTrigger>
            <TabsTrigger value="docs" data-testid="tab-docs">Documentation</TabsTrigger>
          </TabsList>

          <TabsContent value="api-keys">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>Manage your API authentication keys</CardDescription>
                </div>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                      <Button 
                        onClick={() => createKeyMutation.mutate(newKeyName)} 
                        disabled={!newKeyName || createKeyMutation.isPending}
                        data-testid="button-confirm-create"
                      >
                        {createKeyMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Create Key
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {keysLoading ? (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : apiKeys && apiKeys.length > 0 ? (
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
                      {apiKeys.map((apiKey) => (
                        <TableRow key={apiKey.id} data-testid={`row-api-key-${apiKey.id}`}>
                          <TableCell className="font-medium">{apiKey.name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="text-sm bg-muted px-2 py-1 rounded">
                                {showKeys[apiKey.id] ? apiKey.apiKey : maskKey(apiKey.apiKey)}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleKeyVisibility(apiKey.id)}
                                data-testid={`button-toggle-visibility-${apiKey.id}`}
                              >
                                {showKeys[apiKey.id] ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(apiKey.createdAt)}</TableCell>
                          <TableCell>{apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : 'Never'}</TableCell>
                          <TableCell>
                            <Badge className={apiKey.isActive ? 'bg-green-500 text-white' : 'bg-gray-500 text-white'}>
                              {apiKey.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => copyToClipboard(apiKey.apiKey)}
                                data-testid={`button-copy-${apiKey.id}`}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-destructive"
                                onClick={() => deleteKeyMutation.mutate(apiKey.id)}
                                disabled={deleteKeyMutation.isPending}
                                data-testid={`button-delete-${apiKey.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Key className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No API keys yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Create your first API key to get started</p>
                  </div>
                )}
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
                {jobsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : jobs && jobs.length > 0 ? (
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
                      {jobs.slice(0, 10).map((job) => (
                        <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                          <TableCell className="font-mono">{job.trackingNumber}</TableCell>
                          <TableCell>{job.pickupPostcode} → {job.deliveryPostcode}</TableCell>
                          <TableCell>{formatDate(job.createdAt)}</TableCell>
                          <TableCell>{getStatusBadge(job.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Package className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No jobs yet</p>
                    <p className="text-sm text-muted-foreground mt-1">Use the API to create your first job</p>
                  </div>
                )}
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
