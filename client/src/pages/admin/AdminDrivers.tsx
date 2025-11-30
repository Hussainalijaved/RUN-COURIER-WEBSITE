import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  MoreHorizontal,
  Eye,
  FileText,
  CheckCircle,
  XCircle,
  Star,
  Truck,
  Users,
  UserCheck,
  Loader2,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Driver, User } from '@shared/schema';

export default function AdminDrivers() {
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  const { data: drivers, isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users', { role: 'driver' }],
  });

  const verifyDriverMutation = useMutation({
    mutationFn: async ({ id, isVerified }: { id: string; isVerified: boolean }) => {
      return apiRequest(`/api/drivers/${id}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ isVerified }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drivers'] });
      toast({ title: 'Driver status updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update driver', variant: 'destructive' });
    },
  });

  const getDriverUser = (userId: string) => {
    return users?.find((u) => u.id === userId);
  };

  const filteredDrivers = drivers?.filter((driver) => {
    const user = getDriverUser(driver.userId);
    const searchLower = searchQuery.toLowerCase();
    return (
      driver.vehicleRegistration?.toLowerCase().includes(searchLower) ||
      user?.fullName?.toLowerCase().includes(searchLower) ||
      user?.email?.toLowerCase().includes(searchLower)
    );
  }) || [];

  const totalDrivers = drivers?.length || 0;
  const verifiedDrivers = drivers?.filter((d) => d.isVerified).length || 0;
  const availableDrivers = drivers?.filter((d) => d.isAvailable).length || 0;
  const pendingDrivers = drivers?.filter((d) => !d.isVerified).length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Drivers Management</h1>
          <p className="text-muted-foreground">Manage and verify driver accounts</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card data-testid="stat-total-drivers">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  {driversLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold">{totalDrivers}</div>
                  )}
                  <p className="text-sm text-muted-foreground">Total Drivers</p>
                </div>
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-verified-drivers">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  {driversLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold text-green-500">{verifiedDrivers}</div>
                  )}
                  <p className="text-sm text-muted-foreground">Verified</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-available-drivers">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  {driversLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold text-blue-500">{availableDrivers}</div>
                  )}
                  <p className="text-sm text-muted-foreground">Available Now</p>
                </div>
                <Truck className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-pending-drivers">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  {driversLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold text-yellow-500">{pendingDrivers}</div>
                  )}
                  <p className="text-sm text-muted-foreground">Pending Verification</p>
                </div>
                <UserCheck className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search drivers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-drivers"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {driversLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredDrivers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Registration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Jobs</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDrivers.map((driver) => {
                    const user = getDriverUser(driver.userId);
                    const initials = user?.fullName?.split(' ').map((n) => n[0]).join('') || 'D';
                    return (
                      <TableRow key={driver.id} data-testid={`row-driver-${driver.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback className="bg-primary text-primary-foreground">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{user?.fullName || 'Unknown'}</div>
                              <div className="text-xs text-muted-foreground">{user?.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-muted-foreground" />
                            <span className="capitalize">{driver.vehicleType?.replace('_', ' ')}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{driver.vehicleRegistration || '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {driver.isVerified ? (
                              <Badge className="bg-green-500 text-white w-fit" data-testid={`badge-verified-${driver.id}`}>Verified</Badge>
                            ) : (
                              <Badge variant="secondary" className="w-fit" data-testid={`badge-unverified-${driver.id}`}>Unverified</Badge>
                            )}
                            {driver.isAvailable && (
                              <Badge className="bg-blue-500 text-white w-fit" data-testid={`badge-available-${driver.id}`}>Available</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {driver.rating && parseFloat(driver.rating) > 0 ? (
                            <div className="flex items-center gap-1">
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              <span>{parseFloat(driver.rating).toFixed(1)}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{driver.totalJobs || 0}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-driver-actions-${driver.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem data-testid={`menu-view-${driver.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem data-testid={`menu-documents-${driver.id}`}>
                                <FileText className="mr-2 h-4 w-4" />
                                View Documents
                              </DropdownMenuItem>
                              {!driver.isVerified ? (
                                <DropdownMenuItem
                                  className="text-green-600"
                                  onClick={() => verifyDriverMutation.mutate({ id: driver.id, isVerified: true })}
                                  disabled={verifyDriverMutation.isPending}
                                  data-testid={`menu-verify-${driver.id}`}
                                >
                                  {verifyDriverMutation.isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                  )}
                                  Approve Driver
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => verifyDriverMutation.mutate({ id: driver.id, isVerified: false })}
                                  disabled={verifyDriverMutation.isPending}
                                  data-testid={`menu-revoke-${driver.id}`}
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Revoke Verification
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No drivers found</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
