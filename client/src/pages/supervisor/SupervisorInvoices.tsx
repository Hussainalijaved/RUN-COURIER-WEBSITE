import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileText, Search, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  paid: {
    label: 'Paid',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle2,
  },
  pending: {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    icon: Clock,
  },
  unpaid: {
    label: 'Unpaid',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    icon: Clock,
  },
  overdue: {
    label: 'Overdue',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    icon: AlertCircle,
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-muted text-muted-foreground',
    icon: XCircle,
  },
};

export default function SupervisorInvoices() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: invoices = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/invoices'],
    refetchInterval: 60000,
  });

  const filtered = (invoices as any[]).filter((inv: any) => {
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (inv.invoice_number || '').toLowerCase().includes(q) ||
      (inv.customer_email || '').toLowerCase().includes(q) ||
      (inv.customer_name || '').toLowerCase().includes(q) ||
      (inv.company_name || '').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const formatDate = (dateStr: string) =>
    dateStr
      ? new Date(dateStr).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  const formatAmount = (val: any) => {
    const n = Number(val);
    return isNaN(n) ? '—' : `£${n.toFixed(2)}`;
  };

  const totalAmount = filtered.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
  const paidAmount = filtered
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} invoice{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Invoiced</p>
              <p className="text-xl font-bold text-foreground mt-1">{formatAmount(totalAmount)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Paid</p>
              <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">{formatAmount(paidAmount)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Outstanding</p>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                {formatAmount(totalAmount - paidAmount)}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by invoice number, customer..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
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
              <div>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4 border-t animate-pulse">
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="h-3 w-48 bg-muted rounded" />
                    </div>
                    <div className="h-5 w-20 bg-muted rounded" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">No invoices found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv: any) => {
                      const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG['pending'];
                      const Icon = cfg.icon;
                      return (
                        <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                          <TableCell>
                            <p className="text-sm font-medium text-foreground">
                              {inv.invoice_number || `INV-${inv.id?.slice(0, 8)}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(inv.created_at)}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm text-foreground">
                              {inv.customer_name || inv.company_name || '—'}
                            </p>
                            {inv.customer_email && (
                              <p className="text-xs text-muted-foreground">{inv.customer_email}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <p className="text-xs text-muted-foreground">
                              {inv.period_start && inv.period_end
                                ? `${formatDate(inv.period_start)} – ${formatDate(inv.period_end)}`
                                : '—'}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(inv.due_date)}
                            </p>
                          </TableCell>
                          <TableCell className="text-right">
                            <p className="text-sm font-semibold text-foreground">
                              {formatAmount(inv.total)}
                            </p>
                            {inv.vat && Number(inv.vat) > 0 && (
                              <p className="text-xs text-muted-foreground">
                                incl. VAT {formatAmount(inv.vat)}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs gap-1 ${cfg.className}`}>
                              <Icon className="h-3 w-3" />
                              {cfg.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
