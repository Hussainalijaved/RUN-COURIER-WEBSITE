import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, Search } from 'lucide-react';

const VEHICLE_LABELS: Record<string, string> = {
  motorbike: 'Motorbike',
  car: 'Car',
  small_van: 'Small Van',
  medium_van: 'Medium Van',
  large_van: 'Large Van',
  luton: 'Luton',
};

export default function SupervisorDrivers() {
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: drivers = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/supabase-drivers'],
    queryFn: () => fetch('/api/supabase-drivers').then(r => r.json()),
    refetchInterval: 30000,
  });

  const filtered = (drivers as any[]).filter((driver: any) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || (
      (driver.full_name || '').toLowerCase().includes(q) ||
      (driver.email || '').toLowerCase().includes(q) ||
      (driver.driver_code || '').toLowerCase().includes(q) ||
      (driver.phone || '').toLowerCase().includes(q)
    );
    const matchesVehicle = vehicleFilter === 'all' || driver.vehicle_type === vehicleFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'verified' && driver.is_verified && driver.is_active !== false) ||
      (statusFilter === 'pending' && !driver.is_verified) ||
      (statusFilter === 'inactive' && driver.is_active === false);
    return matchesSearch && matchesVehicle && matchesStatus;
  });

  const initials = (name: string) =>
    name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  const getStatusBadge = (driver: any) => {
    if (driver.is_active === false) {
      return <Badge variant="secondary" className="text-xs">Inactive</Badge>;
    }
    if (!driver.is_verified) {
      return <Badge variant="outline" className="text-xs text-yellow-700 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400">Pending</Badge>;
    }
    return (
      <Badge className={`text-xs ${driver.is_available ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
        {driver.is_available ? 'Available' : 'Unavailable'}
      </Badge>
    );
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Drivers</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} driver{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, driver code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>
              <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-vehicle-filter">
                  <SelectValue placeholder="Vehicle type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vehicles</SelectItem>
                  {Object.entries(VEHICLE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Drivers</SelectItem>
                  <SelectItem value="verified">Active & Verified</SelectItem>
                  <SelectItem value="pending">Pending Approval</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-0">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4 border-t animate-pulse">
                    <div className="h-10 w-10 bg-muted rounded-full" />
                    <div className="flex-1 space-y-1">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="h-3 w-48 bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Users className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No drivers found.</p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((driver: any) => (
                  <div key={driver.id} className="flex flex-wrap items-center gap-4 px-6 py-4" data-testid={`row-driver-${driver.id}`}>
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="text-sm font-medium">{initials(driver.full_name || '')}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-[150px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{driver.full_name || 'Unknown'}</p>
                        {driver.driver_code && (
                          <Badge variant="outline" className="text-xs font-mono">{driver.driver_code}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{driver.email}</p>
                      {driver.phone && <p className="text-xs text-muted-foreground">{driver.phone}</p>}
                      {driver.postcode && <p className="text-xs text-muted-foreground">{driver.postcode}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {driver.vehicle_type && (
                        <Badge variant="secondary" className="text-xs">
                          {VEHICLE_LABELS[driver.vehicle_type] || driver.vehicle_type}
                        </Badge>
                      )}
                      {getStatusBadge(driver)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
