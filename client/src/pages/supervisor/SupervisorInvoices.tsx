import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Search } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  unpaid: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-muted text-muted-foreground',
};

export default function SupervisorInvoices() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: invoices = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/supervisor/invoices'],
  });

  const filtered = (invoices as any[]).filter((inv: any) => {
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch = !q || (
      (inv.customer_email || '').toLowerCase().includes(q) ||
      (inv.invoice_number || '').toLowerCase().includes(q) ||
      (inv.id || '').toLowerCase().includes(q)
    );
    return matchesStatus && matchesSearch;
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} invoice{filtered.length !== 1 ? 's' : ''}</p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email, invoice number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-0">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4 border-t animate-pulse">
                    <div className="flex-1 space-y-1">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="h-3 w-48 bg-muted rounded" />
                    </div>
                    <div className="h-5 w-16 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No invoices found.</p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((inv: any) => (
                  <div key={inv.id} className="flex flex-wrap items-center gap-4 px-6 py-4" data-testid={`row-invoice-${inv.id}`}>
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-sm font-medium text-foreground">
                        {inv.invoice_number || `INV-${inv.id?.slice(0, 8)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{inv.customer_email || 'Unknown customer'}</p>
                      {inv.due_date && (
                        <p className="text-xs text-muted-foreground">
                          Due: {new Date(inv.due_date).toLocaleDateString('en-GB')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {inv.amount != null && (
                        <span className="text-sm font-semibold text-foreground">
                          £{Number(inv.amount).toFixed(2)}
                        </span>
                      )}
                      <Badge className={`text-xs ${STATUS_COLORS[inv.status] || ''}`}>
                        {(inv.status || 'unknown').charAt(0).toUpperCase() + (inv.status || 'unknown').slice(1)}
                      </Badge>
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
