import { useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FileText,
  Download,
  Printer,
  Calendar,
  CreditCard,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useState } from 'react';
import type { Invoice, Job, InvoiceStatus } from '@shared/schema';

const getStatusBadge = (status: InvoiceStatus) => {
  switch (status) {
    case 'paid':
      return <Badge className="bg-green-500 text-white" data-testid={`badge-status-${status}`}><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-500 text-white" data-testid={`badge-status-${status}`}><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    case 'overdue':
      return <Badge className="bg-red-500 text-white" data-testid={`badge-status-${status}`}><AlertCircle className="h-3 w-3 mr-1" />Overdue</Badge>;
    case 'cancelled':
      return <Badge className="bg-gray-500 text-white" data-testid={`badge-status-${status}`}>Cancelled</Badge>;
    default:
      return <Badge data-testid={`badge-status-${status}`}>{status}</Badge>;
  }
};

const formatPrice = (price: string | number) => {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return `£${num.toFixed(2)}`;
};

const formatDate = (date: Date | string | null) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

interface InvoiceWithJobs {
  invoice: Invoice;
  jobs: Job[];
}

function InvoicePreview({ invoiceData, onClose }: { invoiceData: InvoiceWithJobs; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);
  const { invoice, jobs } = invoiceData;

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice ${invoice.invoiceNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
            .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
            .logo { font-size: 24px; font-weight: bold; color: #007BFF; }
            .invoice-title { font-size: 32px; color: #666; }
            .info-section { margin-bottom: 30px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .info-block { width: 48%; }
            .info-block h3 { font-size: 12px; color: #666; margin-bottom: 8px; text-transform: uppercase; }
            .info-block p { margin: 4px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 30px; }
            th { background: #f5f5f5; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #ddd; }
            td { padding: 12px; border-bottom: 1px solid #eee; }
            .totals { margin-top: 30px; text-align: right; }
            .total-row { display: flex; justify-content: flex-end; margin-bottom: 8px; }
            .total-label { width: 150px; text-align: right; padding-right: 20px; }
            .total-value { width: 100px; text-align: right; }
            .grand-total { font-size: 20px; font-weight: bold; color: #007BFF; border-top: 2px solid #333; padding-top: 10px; margin-top: 10px; }
            .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
            .status { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
            .status-paid { background: #d4edda; color: #155724; }
            .status-pending { background: #fff3cd; color: #856404; }
            .status-overdue { background: #f8d7da; color: #721c24; }
          </style>
        </head>
        <body>
          ${content.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleDownloadPDF = () => {
    handlePrint();
  };

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center justify-between">
          <span>Invoice {invoice.invoiceNumber}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} data-testid="button-download-pdf">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print">
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </DialogTitle>
      </DialogHeader>

      <div ref={printRef} className="p-6 bg-white">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-2xl font-bold text-primary">RUN COURIER™</h1>
            <p className="text-muted-foreground">Professional Courier Services</p>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-light text-muted-foreground">INVOICE</h2>
            <p className="text-lg font-semibold">{invoice.invoiceNumber}</p>
            <div className={`mt-2 inline-block px-3 py-1 rounded-full text-xs font-bold ${
              invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
              invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {invoice.status.toUpperCase()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Bill To</h3>
            <p className="font-semibold">{invoice.companyName || invoice.customerName}</p>
            <p className="text-muted-foreground">{invoice.customerEmail}</p>
            {invoice.businessAddress && <p className="text-muted-foreground">{invoice.businessAddress}</p>}
            {invoice.vatNumber && <p className="text-muted-foreground">VAT: {invoice.vatNumber}</p>}
          </div>
          <div className="text-right">
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Invoice Date</h3>
              <p>{formatDate(invoice.createdAt)}</p>
            </div>
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Due Date</h3>
              <p className={invoice.status === 'overdue' ? 'text-red-600 font-semibold' : ''}>
                {formatDate(invoice.dueDate)}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Billing Period</h3>
              <p>{formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}</p>
            </div>
          </div>
        </div>

        <table className="w-full mb-8">
          <thead>
            <tr className="border-b-2">
              <th className="text-left py-3 text-xs font-semibold text-muted-foreground uppercase">Tracking #</th>
              <th className="text-left py-3 text-xs font-semibold text-muted-foreground uppercase">Date</th>
              <th className="text-left py-3 text-xs font-semibold text-muted-foreground uppercase">Route</th>
              <th className="text-right py-3 text-xs font-semibold text-muted-foreground uppercase">Amount</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length > 0 ? jobs.map((job) => (
              <tr key={job.id} className="border-b">
                <td className="py-3 font-mono text-sm">{job.trackingNumber}</td>
                <td className="py-3 text-muted-foreground">{formatDate(job.createdAt)}</td>
                <td className="py-3 text-muted-foreground text-sm">
                  {job.pickupPostcode} → {job.deliveryPostcode}
                </td>
                <td className="py-3 text-right font-medium">{formatPrice(job.totalPrice)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted-foreground">
                  No deliveries found for this invoice period
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-64">
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPrice(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-muted-foreground">VAT (20%)</span>
              <span>{formatPrice(invoice.vat || 0)}</span>
            </div>
            <div className="flex justify-between py-3 border-t-2 border-black mt-2">
              <span className="font-bold text-lg">Total Due</span>
              <span className="font-bold text-lg text-primary">{formatPrice(invoice.total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t text-sm text-muted-foreground">
          <p className="font-semibold mb-2">Payment Information</p>
          <p>Bank: Barclays Business</p>
          <p>Account Name: Run Courier Ltd</p>
          <p>Sort Code: 20-00-00 | Account Number: 12345678</p>
          <p className="mt-4">Please include invoice number {invoice.invoiceNumber} as payment reference.</p>
        </div>
      </div>
    </DialogContent>
  );
}

export default function CustomerInvoices() {
  const { user } = useAuth();
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ['/api/invoices', { customerId: user?.id }],
    enabled: !!user?.id,
  });

  const { data: invoiceDetails } = useQuery<InvoiceWithJobs>({
    queryKey: ['/api/invoices', selectedInvoice, 'details'],
    enabled: !!selectedInvoice,
  });

  const stats = {
    totalInvoices: invoices?.length || 0,
    pendingAmount: invoices?.filter(i => i.status === 'pending').reduce((sum, i) => sum + parseFloat(i.total), 0) || 0,
    paidThisMonth: invoices?.filter(i => {
      if (i.status !== 'paid' || !i.paidAt) return false;
      const paidDate = new Date(i.paidAt);
      const now = new Date();
      return paidDate.getMonth() === now.getMonth() && paidDate.getFullYear() === now.getFullYear();
    }).reduce((sum, i) => sum + parseFloat(i.total), 0) || 0,
    overdueCount: invoices?.filter(i => i.status === 'overdue').length || 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">My Invoices</h1>
          <p className="text-muted-foreground">View and download your invoice history</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card data-testid="stat-total-invoices">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
              <FileText className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold">{stats.totalInvoices}</div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="stat-pending-amount">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Payment</CardTitle>
              <Clock className="h-5 w-5 text-yellow-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{formatPrice(stats.pendingAmount)}</div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="stat-paid-this-month">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Paid This Month</CardTitle>
              <CreditCard className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{formatPrice(stats.paidThisMonth)}</div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="stat-overdue">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertCircle className="h-5 w-5 text-red-500" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-bold">{stats.overdueCount}</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice History
            </CardTitle>
            <CardDescription>
              All your invoices from Pay Later bookings
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : invoices && invoices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id} data-testid={`row-invoice-${invoice.id}`}>
                      <TableCell className="font-mono font-medium" data-testid={`text-invoice-number-${invoice.id}`}>
                        {invoice.invoiceNumber}
                      </TableCell>
                      <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}
                      </TableCell>
                      <TableCell className="font-medium">{formatPrice(invoice.total)}</TableCell>
                      <TableCell className={invoice.status === 'overdue' ? 'text-red-600 font-medium' : ''}>
                        {formatDate(invoice.dueDate)}
                      </TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedInvoice(invoice.id)}
                            data-testid={`button-view-invoice-${invoice.id}`}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Invoices Yet</h3>
                <p className="text-muted-foreground mb-4">
                  When you make Pay Later bookings, your invoices will appear here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
        {invoiceDetails && (
          <InvoicePreview
            invoiceData={invoiceDetails}
            onClose={() => setSelectedInvoice(null)}
          />
        )}
      </Dialog>
    </DashboardLayout>
  );
}
