import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  FileText,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  MoreHorizontal,
  Send,
  CheckCheck,
  RotateCcw,
  Download,
  Loader2,
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendDialogInvoice, setSendDialogInvoice] = useState<any | null>(null);
  const [sendEmail, setSendEmail] = useState('');

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

  const resendMutation = useMutation({
    mutationFn: async ({ invoice, overrideEmail }: { invoice: any; overrideEmail?: string }) => {
      const response = await apiRequest('POST', `/api/invoices/${invoice.id}/resend`,
        overrideEmail ? { overrideEmail } : undefined
      );
      return response.json();
    },
    onSuccess: (result: any) => {
      toast({ title: 'Invoice sent', description: `Sent to ${result.customerEmail || sendEmail}` });
      setSendDialogOpen(false);
      setSendDialogInvoice(null);
      setSendEmail('');
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to send invoice', description: error?.message || 'Please try again', variant: 'destructive' });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async ({ invoiceId, status }: { invoiceId: string; status: string }) => {
      const response = await apiRequest('PATCH', `/api/invoices/${invoiceId}/status`, { status });
      return response.json();
    },
    onSuccess: (_: any, variables: any) => {
      toast({ title: variables.status === 'paid' ? 'Invoice marked as paid' : 'Invoice marked as unpaid' });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update invoice', description: error?.message || 'Please try again', variant: 'destructive' });
    },
  });

  const formatPrice = (val: any) => {
    const n = Number(val);
    return isNaN(n) ? '£0.00' : `£${n.toFixed(2)}`;
  };

  const downloadPdf = async (inv: any) => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const jobDetails = inv.job_details ? JSON.parse(inv.job_details) : [];
      const pageWidth = 210;
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      const checkPageBreak = (needed: number) => {
        if (y + needed > 280) { doc.addPage(); y = margin; }
      };

      // Header
      doc.setFontSize(20);
      doc.setTextColor(0, 123, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('RUN COURIER', margin, y + 7);
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text('Same Day Delivery', margin, y + 14);
      doc.setFontSize(22);
      doc.setTextColor(17, 17, 17);
      doc.setFont('helvetica', 'bold');
      doc.text('INVOICE', pageWidth - margin, y + 7, { align: 'right' });
      doc.setFontSize(11);
      doc.setTextColor(51, 51, 51);
      doc.text(inv.invoice_number || inv.id, pageWidth - margin, y + 14, { align: 'right' });
      const statusLabel = (inv.status || '').toUpperCase();
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      const statusColor: [number, number, number] = inv.status === 'paid' ? [21, 87, 36] : inv.status === 'overdue' ? [114, 28, 36] : [133, 100, 4];
      doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
      doc.text(statusLabel, pageWidth - margin, y + 21, { align: 'right' });
      y += 30;

      // Divider
      doc.setDrawColor(0, 123, 255);
      doc.setLineWidth(0.8);
      doc.line(margin, y, pageWidth - margin, y);
      doc.setLineWidth(0.2);
      y += 8;

      // Bill To + Invoice Details
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'bold');
      doc.text('BILL TO', margin, y);
      doc.text('INVOICE DETAILS', pageWidth / 2 + 10, y);
      y += 6;
      doc.setFontSize(11);
      doc.setTextColor(17, 17, 17);
      doc.setFont('helvetica', 'bold');
      doc.text(inv.customer_name || '', margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      if (inv.company_name) { doc.text(inv.company_name, margin, y); y += 5; }
      if (inv.business_address) {
        const addrLines = doc.splitTextToSize(inv.business_address, contentWidth / 2 - 5);
        doc.text(addrLines, margin, y);
        y += addrLines.length * 4.5;
      }
      doc.setTextColor(80, 80, 80);
      doc.text(inv.customer_email || '', margin, y);

      let detailY = y - (inv.company_name ? 10 : 5) - (inv.business_address ? 5 : 0);
      const detailX = pageWidth / 2 + 10;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text('Invoice Date', detailX, detailY);
      detailY += 4;
      doc.setFontSize(10);
      doc.setTextColor(17, 17, 17);
      doc.text(formatDate(inv.created_at), detailX, detailY);
      detailY += 7;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('Due Date', detailX, detailY);
      detailY += 4;
      doc.setFontSize(10);
      doc.setTextColor(200, 50, 50);
      doc.setFont('helvetica', 'bold');
      doc.text(formatDate(inv.due_date), detailX, detailY);
      detailY += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('Period', detailX, detailY);
      detailY += 4;
      doc.setFontSize(10);
      doc.setTextColor(17, 17, 17);
      doc.text(`${formatDate(inv.period_start)} - ${formatDate(inv.period_end)}`, detailX, detailY);
      y = Math.max(y, detailY) + 10;

      // Job table
      if (jobDetails.length > 0) {
        checkPageBreak(20);
        doc.setFillColor(248, 249, 250);
        doc.rect(margin, y, contentWidth, 8, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(51, 51, 51);
        doc.text('Job No.', margin + 2, y + 5.5);
        doc.text('Route Details', margin + 35, y + 5.5);
        doc.text('Date', margin + 130, y + 5.5);
        doc.text('Amount', pageWidth - margin - 2, y + 5.5, { align: 'right' });
        y += 10;
        doc.setFont('helvetica', 'normal');
        for (const job of jobDetails) {
          const isMultiDrop = job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0;
          const rowHeight = isMultiDrop ? 12 + job.multiDropStops.length * 5 : 14;
          checkPageBreak(rowHeight + 5);
          doc.setFontSize(9);
          doc.setTextColor(17, 17, 17);
          doc.setFont('helvetica', 'normal');
          doc.text(String(job.jobNumber || job.trackingNumber || 'N/A'), margin + 2, y + 4);
          if (isMultiDrop) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text(`Same-Day Delivery \u2014 ${job.multiDropStops.length} drop-offs`, margin + 35, y + 4);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(80, 80, 80);
            doc.text(`Collected from: ${job.pickupAddress || 'N/A'}`, margin + 35, y + 9);
            let stopY = y + 14;
            for (let si = 0; si < job.multiDropStops.length; si++) {
              const stop = job.multiDropStops[si];
              checkPageBreak(6);
              doc.setDrawColor(0, 123, 255);
              doc.setLineWidth(0.5);
              doc.line(margin + 37, stopY - 3, margin + 37, stopY + 1);
              doc.setTextColor(51, 51, 51);
              doc.setFontSize(8);
              const stopText = `Stop ${stop.stopOrder || si + 1}: ${stop.address || stop.postcode}${stop.recipientName ? ` \u2014 ${stop.recipientName}` : ''}`;
              const stopLines = doc.splitTextToSize(stopText, 85);
              doc.text(stopLines, margin + 39, stopY);
              stopY += stopLines.length * 4;
            }
            y = Math.max(y + rowHeight, stopY);
          } else {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.text('Same-Day Delivery', margin + 35, y + 4);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(80, 80, 80);
            const routeText = `${job.pickupAddress || 'N/A'} \u2192 ${job.deliveryAddress || job.recipientName || 'N/A'}`;
            const routeLines = doc.splitTextToSize(routeText, 90);
            doc.text(routeLines, margin + 35, y + 9);
            y += 6 + routeLines.length * 4;
          }
          doc.setFontSize(9);
          doc.setTextColor(17, 17, 17);
          doc.text(job.scheduledDate || 'N/A', margin + 130, y - (isMultiDrop ? rowHeight - 4 : 6) + 4);
          doc.setFont('helvetica', 'bold');
          doc.text(`\u00A3${typeof job.price === 'number' ? job.price.toFixed(2) : '0.00'}`, pageWidth - margin - 2, y - (isMultiDrop ? rowHeight - 4 : 6) + 4, { align: 'right' });
          doc.setDrawColor(230, 230, 230);
          doc.line(margin, y + 2, pageWidth - margin, y + 2);
          y += 5;
        }
      }

      // Notes
      if (inv.notes) {
        checkPageBreak(20);
        y += 5;
        doc.setFillColor(255, 243, 205);
        const noteLines = doc.splitTextToSize(inv.notes, contentWidth - 10);
        doc.roundedRect(margin, y, contentWidth, 10 + noteLines.length * 4, 2, 2, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(17, 17, 17);
        doc.text('Notes:', margin + 5, y + 6);
        doc.setFont('helvetica', 'normal');
        doc.text(noteLines, margin + 5, y + 11);
        y += 14 + noteLines.length * 4;
      }

      // Totals
      checkPageBreak(35);
      y += 5;
      doc.setFillColor(248, 249, 250);
      doc.roundedRect(margin, y, contentWidth, 30, 2, 2, 'F');
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.setFont('helvetica', 'normal');
      doc.text('Subtotal:', pageWidth - margin - 50, y + 8);
      doc.setTextColor(17, 17, 17);
      doc.text(formatPrice(inv.subtotal ?? inv.total), pageWidth - margin - 5, y + 8, { align: 'right' });
      doc.setTextColor(80, 80, 80);
      doc.text('VAT:', pageWidth - margin - 50, y + 15);
      doc.setTextColor(17, 17, 17);
      doc.text(formatPrice(inv.vat ?? 0), pageWidth - margin - 5, y + 15, { align: 'right' });
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 123, 255);
      doc.text('Total:', pageWidth - margin - 50, y + 25);
      doc.text(formatPrice(inv.total), pageWidth - margin - 5, y + 25, { align: 'right' });
      y += 38;

      // Bank details
      checkPageBreak(35);
      doc.setFillColor(232, 244, 253);
      doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 17, 17);
      doc.text('Bank Transfer Details', margin + 5, y + 7);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(51, 51, 51);
      doc.text('Account Name: RUN COURIER', margin + 5, y + 13);
      doc.text('Sort Code: 30-99-50', margin + 5, y + 18);
      doc.text('Account Number: 36113363', margin + 80, y + 13);
      doc.text(`Reference: ${inv.invoice_number || inv.id}`, margin + 80, y + 18);
      y += 35;

      // Footer
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.setFont('helvetica', 'normal');
      doc.text('Run Courier | 112 Bridgwater Road, Ruislip, HA4 6LW, London | info@runcourier.co.uk | runcourier.co.uk', pageWidth / 2, 290, { align: 'center' });

      doc.save(`${inv.invoice_number || 'invoice'}.pdf`);
      toast({ title: 'PDF downloaded', description: `${inv.invoice_number || 'invoice'}.pdf saved` });
    } catch {
      toast({ title: 'Failed to download PDF', variant: 'destructive' });
    }
  };

  const openSendDialog = (inv: any) => {
    setSendDialogInvoice(inv);
    setSendEmail(inv.customer_email || '');
    setSendDialogOpen(true);
  };

  const handleSend = () => {
    if (!sendDialogInvoice) return;
    if (!sendEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendEmail.trim())) {
      toast({ title: 'Please enter a valid email address', variant: 'destructive' });
      return;
    }
    const isOverride = sendEmail.trim() !== sendDialogInvoice.customer_email;
    resendMutation.mutate({ invoice: sendDialogInvoice, overrideEmail: isOverride ? sendEmail.trim() : undefined });
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} invoice{filtered.length !== 1 ? 's' : ''}
          </p>
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
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv: any) => {
                      const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG['pending'];
                      const Icon = cfg.icon;
                      const isPaid = inv.status === 'paid';
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
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`menu-invoice-${inv.id}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => openSendDialog(inv)}
                                  data-testid={`menu-send-invoice-${inv.id}`}
                                >
                                  <Send className="mr-2 h-4 w-4" />
                                  Send Invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => downloadPdf(inv)}
                                  data-testid={`menu-download-invoice-${inv.id}`}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Download PDF
                                </DropdownMenuItem>
                                {!isPaid ? (
                                  <DropdownMenuItem
                                    onClick={() => markPaidMutation.mutate({ invoiceId: inv.id, status: 'paid' })}
                                    disabled={markPaidMutation.isPending}
                                    data-testid={`menu-mark-paid-${inv.id}`}
                                  >
                                    <CheckCheck className="mr-2 h-4 w-4" />
                                    Mark as Paid
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => markPaidMutation.mutate({ invoiceId: inv.id, status: 'pending' })}
                                    disabled={markPaidMutation.isPending}
                                    data-testid={`menu-mark-unpaid-${inv.id}`}
                                  >
                                    <RotateCcw className="mr-2 h-4 w-4" />
                                    Mark as Unpaid
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={sendDialogOpen} onOpenChange={(open) => { if (!open) { setSendDialogOpen(false); setSendDialogInvoice(null); setSendEmail(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Invoice</DialogTitle>
            <DialogDescription>
              <span>Send invoice {sendDialogInvoice?.invoice_number || ''} to the customer.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Customer Email</Label>
              <Input
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                placeholder="customer@example.com"
                type="email"
                data-testid="input-send-email"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSendDialogOpen(false); setSendDialogInvoice(null); setSendEmail(''); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={resendMutation.isPending || !sendEmail}
              data-testid="button-confirm-send-invoice"
            >
              {resendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Send Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
