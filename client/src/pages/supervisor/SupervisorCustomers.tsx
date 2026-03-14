import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users, Search, Building2, User } from 'lucide-react';

export default function SupervisorCustomers() {
  const [search, setSearch] = useState('');

  const { data: customers = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/users', 'customers'],
    queryFn: () => fetch('/api/users?role=customer').then(r => r.json()),
  });

  const filtered = (customers as any[]).filter((c: any) => {
    const q = search.toLowerCase();
    return !q || (
      (c.fullName || c.full_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.companyName || c.company_name || '').toLowerCase().includes(q)
    );
  });

  const initials = (name: string) => name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
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
                <p className="text-muted-foreground text-sm">No customers found.</p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((customer: any) => {
                  const name = customer.fullName || customer.full_name || customer.email || 'Unknown';
                  const company = customer.companyName || customer.company_name;
                  const isBusiness = customer.userType === 'business' || customer.user_type === 'business';
                  return (
                    <div key={customer.id} className="flex flex-wrap items-center gap-4 px-6 py-4" data-testid={`row-customer-${customer.id}`}>
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="text-sm font-medium">{initials(name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-[150px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{name}</p>
                          {isBusiness ? (
                            <Badge variant="secondary" className="text-xs gap-1"><Building2 className="h-3 w-3" />Business</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs gap-1"><User className="h-3 w-3" />Individual</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{customer.email}</p>
                        {company && <p className="text-xs text-muted-foreground">{company}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
