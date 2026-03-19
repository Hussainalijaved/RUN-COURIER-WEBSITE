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
  DropdownMenuSeparator,
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
  Eye,
  Printer,
  Mail,
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

  const [viewInvoice, setViewInvoice] = useState<any | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

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

  const formatPrice = (val: any) => {
    const n = Number(val);
    return isNaN(n) ? '£0.00' : `£${n.toFixed(2)}`;
  };

  const getStatusBadge = (status: string) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['pending'];
    const Icon = cfg.icon;
    return (
      <Badge className={`text-xs gap-1 ${cfg.className}`}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </Badge>
    );
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
      if (viewInvoice?.id === variables.invoiceId) {
        setViewInvoice((prev: any) => prev ? { ...prev, status: variables.status } : prev);
      }
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update invoice', description: error?.message || 'Please try again', variant: 'destructive' });
    },
  });

  const printInvoice = (invoice: any) => {
    const jobDetails = invoice.job_details ? JSON.parse(invoice.job_details) : [];
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Please allow popups to print', variant: 'destructive' });
      return;
    }

    const statusClass = invoice.status === 'paid' ? 'status-paid' : invoice.status === 'overdue' ? 'status-overdue' : 'status-pending';
    const logoUrl = `${window.location.origin}/run-loader.png`;

    const jobsTableHtml = jobDetails.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Job No.</th>
            <th>Date</th>
            <th>Description</th>
            <th style="text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${jobDetails.map((job: any) => {
            const isMultiDrop = job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0;
            const desc = isMultiDrop ? `
              <div style="font-weight:600;color:#111;margin-bottom:4px;">Same-Day Delivery &mdash; ${job.multiDropStops.length} drop-offs</div>
              <div style="color:#555;font-size:11px;margin-bottom:2px;">Collected from: ${job.pickupAddress || 'N/A'}</div>
              ${job.multiDropStops.map((stop: any, i: number) => `
                <div style="font-size:11px;padding-left:10px;border-left:2px solid rgba(0,123,255,0.4);margin:2px 0;color:#444;">
                  Stop ${stop.stopOrder || (i + 1)}: ${stop.address || stop.postcode}${stop.recipientName ? ` &mdash; ${stop.recipientName}` : ''}
                </div>
              `).join('')}
            ` : `
              <div style="font-weight:600;color:#111;margin-bottom:2px;">Same-Day Delivery</div>
              <div style="font-size:11px;color:#555;">${job.pickupAddress || 'N/A'} &rarr; ${job.deliveryAddress || job.recipientName || 'N/A'}</div>
            `;
            const wtRow = job.waitingTimeCharge > 0 ? `<tr>
              <td></td>
              <td></td>
              <td style="font-size:11px;color:#666;font-style:italic;">Waiting time charge${job.waitingTimeMinutes > 0 ? ` (${job.waitingTimeMinutes} min)` : ''}</td>
              <td style="text-align:right;font-size:11px;color:#555;">£${job.waitingTimeCharge.toFixed(2)}</td>
            </tr>` : '';
            return `<tr style="vertical-align:top;">
              <td style="font-family:monospace;font-size:11px;">${job.jobNumber || job.trackingNumber || 'N/A'}</td>
              <td>${job.scheduledDate || 'N/A'}</td>
              <td>${desc}</td>
              <td style="text-align:right;font-weight:600;">£${typeof job.price === 'number' ? job.price.toFixed(2) : '0.00'}</td>
            </tr>${wtRow}`;
          }).join('')}
        </tbody>
      </table>
    ` : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #007BFF; }
          .company-header { display: flex; align-items: flex-start; gap: 15px; }
          .company-logo { width: 56px; height: 56px; object-fit: contain; }
          .company-name { font-size: 24px; font-weight: bold; color: #007BFF; margin-bottom: 4px; }
          .company-details { font-size: 11px; color: #555; line-height: 1.6; }
          .invoice-right { text-align: right; }
          .invoice-label { font-size: 12px; color: #007BFF; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
          .invoice-number { font-size: 18px; font-weight: bold; color: #111; margin-top: 6px; }
          .status { display: inline-block; margin-top: 8px; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
          .status-paid { background: #d4edda; color: #155724; }
          .status-pending { background: #fff3cd; color: #856404; }
          .status-overdue { background: #f8d7da; color: #721c24; }
          .addresses { display: flex; justify-content: space-between; margin: 24px 0; }
          .address-block { width: 45%; }
          .address-block h3 { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 8px; }
          .address-block p { margin: 3px 0; font-size: 12px; }
          .meta { background: #f8f9fa; padding: 14px 16px; margin: 16px 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
          .meta-item { text-align: center; }
          .meta-item label { font-size: 9px; color: #888; text-transform: uppercase; display: block; margin-bottom: 4px; }
          .meta-item span { font-size: 12px; font-weight: bold; color: #111; }
          table { width: 100%; border-collapse: collapse; margin: 16px 0; }
          th { background: #007BFF; color: white; padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; }
          td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 12px; vertical-align: top; }
          .totals-wrap { display: flex; justify-content: flex-end; margin-top: 8px; }
          .totals { width: 260px; }
          .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px solid #eee; }
          .totals-row.grand { border-top: 2px solid #333; border-bottom: none; font-size: 16px; font-weight: bold; padding-top: 12px; }
          .totals-row.grand span:last-child { color: #007BFF; }
          .notes { background: #fff8e1; border-left: 3px solid #ffc107; padding: 12px 16px; margin: 16px 0; font-size: 12px; }
          .payment-section { margin-top: 28px; padding-top: 20px; border-top: 2px solid #eee; }
          .payment-box { background: #f0f7ff; padding: 16px 20px; margin-top: 10px; }
          .payment-box h4 { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #333; margin: 0 0 14px 0; letter-spacing: 0.5px; }
          .payment-row { display: flex; align-items: center; padding: 7px 0; border-bottom: 1px solid #dce8f5; font-size: 12px; }
          .payment-row:last-of-type { border-bottom: none; }
          .payment-row label { color: #666; width: 140px; flex-shrink: 0; }
          .payment-row span { font-weight: 600; color: #111; font-family: monospace; font-size: 12px; }
          .payment-ref { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #b0cce8; font-size: 11px; color: #555; }
          .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #eee; text-align: center; font-size: 10px; color: #999; line-height: 1.8; }
          @media print {
            body { padding: 0; margin: 0; }
            @page { margin: 12mm 10mm; size: A4; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-header">
            <img src="${logoUrl}" alt="Run Courier" class="company-logo" />
            <div>
              <div class="company-name">RUN COURIER</div>
              <div class="company-details">Same Day Delivery</div>
            </div>
          </div>
          <div class="invoice-right">
            <div class="invoice-label">Invoice</div>
            <div class="invoice-number">${invoice.invoice_number}</div>
            <div class="status ${statusClass}">${(invoice.status || '').toUpperCase()}</div>
          </div>
        </div>
        <div class="addresses">
          <div class="address-block">
            <h3>From</h3>
            <p style="font-weight:bold;">Run Courier</p>
            <p>112 Bridgwater Road</p>
            <p>Ruislip, HA4 6LW</p>
            <p>London, United Kingdom</p>
            <p>info@runcourier.co.uk</p>
          </div>
          <div class="address-block">
            <h3>Bill To</h3>
            <p style="font-weight:bold;">${invoice.company_name || invoice.customer_name}</p>
            ${invoice.company_name ? `<p>${invoice.customer_name}</p>` : ''}
            ${invoice.business_address ? `<p>${invoice.business_address}</p>` : ''}
            <p>${invoice.customer_email || ''}</p>
          </div>
        </div>
        <div class="meta">
          <div class="meta-item"><label>Invoice Date</label><span>${formatDate(invoice.created_at)}</span></div>
          <div class="meta-item"><label>Due Date</label><span style="color:${invoice.status === 'overdue' ? '#c0392b' : '#111'};">${formatDate(invoice.due_date)}</span></div>
          <div class="meta-item"><label>Period Start</label><span>${formatDate(invoice.period_start)}</span></div>
          <div class="meta-item"><label>Period End</label><span>${formatDate(invoice.period_end)}</span></div>
        </div>
        ${jobsTableHtml}
        ${jobDetails.length === 0 ? `<div style="text-align:center;padding:24px;color:#888;border:1px solid #eee;margin:16px 0;font-size:13px;">No job details attached to this invoice</div>` : ''}
        ${invoice.notes ? `<div class="notes"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}
        <div class="totals-wrap">
          <div class="totals">
            <div class="totals-row"><span>Subtotal</span><span>${formatPrice(invoice.subtotal ?? invoice.total)}</span></div>
            <div class="totals-row"><span>VAT</span><span>${formatPrice(invoice.vat ?? 0)}</span></div>
            <div class="totals-row grand"><span>Total Due</span><span>${formatPrice(invoice.total)}</span></div>
          </div>
        </div>
        <div class="payment-section">
          <div class="payment-box">
            <h4>Bank Transfer Details</h4>
            <div class="payment-row"><label>Account Name</label><span>RUN COURIER</span></div>
            <div class="payment-row"><label>Sort Code</label><span>30-99-50</span></div>
            <div class="payment-row"><label>Account Number</label><span>36113363</span></div>
            <p class="payment-ref">Please use invoice number <strong>${invoice.invoice_number}</strong> as your payment reference.</p>
          </div>
        </div>
        <div class="footer">
          Run Courier | info@runcourier.co.uk | www.runcourier.co.uk<br>
          112 Bridgwater Road, Ruislip, HA4 6LW, London, United Kingdom<br>
          Thank you for your business
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
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

      doc.setDrawColor(0, 123, 255);
      doc.setLineWidth(0.8);
      doc.line(margin, y, pageWidth - margin, y);
      doc.setLineWidth(0.2);
      y += 8;

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

          // Waiting time line item (if applicable)
          if (job.waitingTimeCharge && job.waitingTimeCharge > 0) {
            checkPageBreak(10);
            doc.setFontSize(8.5);
            doc.setTextColor(100, 100, 100);
            doc.setFont('helvetica', 'italic');
            const wtLabel = job.waitingTimeMinutes > 0
              ? `Waiting time charge (${job.waitingTimeMinutes} min)`
              : 'Waiting time charge';
            doc.text(wtLabel, margin + 35, y + 3);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(17, 17, 17);
            doc.text(`\u00A3${job.waitingTimeCharge.toFixed(2)}`, pageWidth - margin - 2, y + 3, { align: 'right' });
            y += 8;
          }

          doc.setDrawColor(230, 230, 230);
          doc.line(margin, y + 2, pageWidth - margin, y + 2);
          y += 5;
        }
      }

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
                      const isPaid = inv.status === 'paid';
                      return (
                        <TableRow
                          key={inv.id}
                          className="cursor-pointer"
                          onClick={() => { setViewInvoice(inv); setViewDialogOpen(true); }}
                          data-testid={`row-invoice-${inv.id}`}
                        >
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
                            {getStatusBadge(inv.status)}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`menu-invoice-${inv.id}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => { setViewInvoice(inv); setViewDialogOpen(true); }}
                                  data-testid={`menu-view-invoice-${inv.id}`}
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Invoice
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => printInvoice(inv)}
                                  data-testid={`menu-print-invoice-${inv.id}`}
                                >
                                  <Printer className="mr-2 h-4 w-4" />
                                  Print
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => downloadPdf(inv)}
                                  data-testid={`menu-download-invoice-${inv.id}`}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Download PDF
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => openSendDialog(inv)}
                                  data-testid={`menu-send-invoice-${inv.id}`}
                                >
                                  <Send className="mr-2 h-4 w-4" />
                                  Send Invoice
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
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

      {/* View Invoice Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
            <DialogDescription>
              {viewInvoice?.invoice_number}
            </DialogDescription>
          </DialogHeader>
          {viewInvoice && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Bill To</h4>
                  <p className="font-medium">{viewInvoice.customer_name}</p>
                  {viewInvoice.company_name && <p className="text-sm">{viewInvoice.company_name}</p>}
                  {viewInvoice.business_address && (
                    <p className="text-sm text-muted-foreground">{viewInvoice.business_address}</p>
                  )}
                  <p className="text-sm text-muted-foreground">{viewInvoice.customer_email}</p>
                </div>
                <div className="text-right">
                  <div className="mb-2">
                    <span className="text-sm text-muted-foreground">Status: </span>
                    {getStatusBadge(viewInvoice.status)}
                  </div>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Created:</span> {formatDate(viewInvoice.created_at)}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Due:</span> {formatDate(viewInvoice.due_date)}
                  </p>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Period:</span>{' '}
                    {formatDate(viewInvoice.period_start)} - {formatDate(viewInvoice.period_end)}
                  </p>
                </div>
              </div>

              {viewInvoice.job_details && JSON.parse(viewInvoice.job_details).length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Jobs Included</h4>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Job No.</TableHead>
                          <TableHead>Route Details</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {JSON.parse(viewInvoice.job_details).map((job: any, idx: number) => {
                          const isMultiDrop = job.isMultiDrop && job.multiDropStops && job.multiDropStops.length > 0;
                          return (
                            <>
                            <TableRow key={idx} className="align-top">
                              <TableCell className="font-mono text-sm">
                                {job.jobNumber || job.trackingNumber || 'N/A'}
                              </TableCell>
                              <TableCell className="text-sm max-w-[300px] break-words">
                                {isMultiDrop ? (
                                  <div>
                                    <div className="font-medium mb-1">
                                      Same-Day Delivery &mdash; {job.multiDropStops.length} drop-offs
                                    </div>
                                    <div className="text-xs text-muted-foreground mb-1">
                                      Collected from: {job.pickupAddress || 'N/A'}
                                    </div>
                                    {job.multiDropStops.map((stop: any, stopIdx: number) => (
                                      <div
                                        key={stopIdx}
                                        className="text-xs text-muted-foreground pl-3 py-0.5 border-l-2 border-primary/30"
                                      >
                                        Stop {stop.stopOrder || stopIdx + 1}: {stop.address || stop.postcode}
                                        {stop.recipientName && (
                                          <span className="ml-1">&mdash; {stop.recipientName}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-medium mb-0.5">Same-Day Delivery</div>
                                    <div className="text-xs text-muted-foreground">
                                      {job.pickupAddress || 'N/A'} &rarr;{' '}
                                      {job.deliveryAddress || job.recipientName || 'N/A'}
                                    </div>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatPrice(job.price)}
                              </TableCell>
                            </TableRow>
                            {job.waitingTimeCharge > 0 && (
                              <TableRow key={`${idx}-wt`}>
                                <TableCell />
                                <TableCell className="text-xs text-muted-foreground italic">
                                  Waiting time charge{job.waitingTimeMinutes > 0 ? ` (${job.waitingTimeMinutes} min)` : ''}
                                </TableCell>
                                <TableCell className="text-right text-xs text-muted-foreground">
                                  {formatPrice(job.waitingTimeCharge)}
                                </TableCell>
                              </TableRow>
                            )}
                            </>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {viewInvoice.notes && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Notes</h4>
                  <p className="text-sm p-3 bg-muted rounded-md">{viewInvoice.notes}</p>
                </div>
              )}

              <div className="bg-muted/50 p-4 rounded-lg">
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(viewInvoice.subtotal ?? viewInvoice.total)}</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground">VAT</span>
                  <span>{formatPrice(viewInvoice.vat ?? 0)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatPrice(viewInvoice.total)}</span>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Bank Transfer Details</h4>
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Account Name:</span> RUN COURIER</p>
                  <p><span className="text-muted-foreground">Sort Code:</span> 30-99-50</p>
                  <p><span className="text-muted-foreground">Account Number:</span> 36113363</p>
                  <p><span className="text-muted-foreground">Reference:</span> {viewInvoice.invoice_number}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => viewInvoice && downloadPdf(viewInvoice)} data-testid="button-download-pdf">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
            <Button variant="outline" onClick={() => viewInvoice && printInvoice(viewInvoice)} data-testid="button-print-invoice">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button variant="outline" onClick={() => { if (viewInvoice) { openSendDialog(viewInvoice); setViewDialogOpen(false); } }} data-testid="button-send-invoice">
              <Mail className="h-4 w-4 mr-2" />
              Send Email
            </Button>
            {viewInvoice?.status !== 'paid' && (
              <Button
                onClick={() => viewInvoice && markPaidMutation.mutate({ invoiceId: viewInvoice.id, status: 'paid' })}
                disabled={markPaidMutation.isPending}
                data-testid="button-mark-paid"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark Paid
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Invoice Dialog */}
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
