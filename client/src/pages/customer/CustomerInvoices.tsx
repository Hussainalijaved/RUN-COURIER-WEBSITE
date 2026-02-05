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
import logoImage from '@assets/run_courier_logo.jpeg';

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

const formatPrice = (price: string | number | null | undefined) => {
  if (price === null || price === undefined) return '£0.00';
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return `£${(num || 0).toFixed(2)}`;
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

const COMPANY_DETAILS = {
  name: 'Run Courier Ltd',
  tradingName: 'RUN COURIER',
  address: '71-75 Shelton Street',
  city: 'London',
  postcode: 'WC2H 9JQ',
  country: 'United Kingdom',
  companyNumber: '12345678',
  phone: '+44 20 7123 4567',
  email: 'accounts@runcourier.co.uk',
  website: 'www.runcourier.co.uk',
  bankName: 'Barclays Business',
  accountName: 'Run Courier Ltd',
  sortCode: '20-00-00',
  accountNumber: '12345678',
};

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
            body { font-family: Arial, sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #007BFF; }
            .company-header { display: flex; align-items: flex-start; gap: 15px; }
            .company-logo { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; }
            .company-name { font-size: 28px; font-weight: bold; color: #007BFF; margin-bottom: 5px; }
            .company-details { font-size: 11px; color: #666; line-height: 1.6; }
            .invoice-title { font-size: 32px; font-weight: bold; color: #333; text-align: right; }
            .invoice-label { font-size: 14px; color: #007BFF; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; }
            .invoice-number { font-size: 16px; margin-top: 10px; }
            .addresses { display: flex; justify-content: space-between; margin: 30px 0; }
            .address-block { width: 45%; }
            .address-block h3 { font-size: 11px; color: #666; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
            .address-block p { margin: 4px 0; font-size: 13px; }
            .invoice-meta { background: #f8f9fa; padding: 15px; margin: 20px 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
            .meta-item { text-align: center; }
            .meta-item label { font-size: 10px; color: #666; text-transform: uppercase; display: block; margin-bottom: 5px; }
            .meta-item span { font-size: 13px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #007BFF; color: white; padding: 12px; text-align: left; font-size: 11px; text-transform: uppercase; }
            th:last-child { text-align: right; }
            td { padding: 12px; border-bottom: 1px solid #eee; font-size: 12px; }
            td:last-child { text-align: right; }
            .totals { margin-left: auto; width: 280px; }
            .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; }
            .totals-row.subtotal { border-bottom: 1px solid #ddd; }
            .totals-row.total { border-top: 2px solid #333; font-size: 16px; font-weight: bold; margin-top: 10px; padding-top: 15px; }
            .totals-row.total span:last-child { color: #007BFF; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; }
            .payment-info { background: #f8f9fa; padding: 20px; margin-top: 20px; }
            .payment-info h4 { margin: 0 0 15px 0; font-size: 13px; text-transform: uppercase; color: #333; }
            .payment-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 12px; }
            .payment-grid div { display: flex; justify-content: space-between; }
            .payment-grid label { color: #666; }
            .legal-footer { margin-top: 30px; font-size: 10px; color: #999; text-align: center; line-height: 1.8; }
            .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
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

      <div ref={printRef} className="p-6 bg-white text-black">
        <div className="flex justify-between items-start mb-6 pb-4 border-b-4 border-primary">
          <div className="flex items-start gap-4 company-header">
            <img 
              src={logoImage} 
              alt="Run Courier Logo" 
              className="h-16 w-16 object-contain rounded company-logo"
              style={{ width: '64px', height: '64px', objectFit: 'contain', borderRadius: '8px' }}
              data-testid="invoice-logo"
            />
            <div>
              <h1 className="text-2xl font-bold text-primary">{COMPANY_DETAILS.tradingName}</h1>
              <div className="text-xs text-gray-600 mt-2 leading-relaxed">
                <p>{COMPANY_DETAILS.name}</p>
                <p>{COMPANY_DETAILS.address}</p>
                <p>{COMPANY_DETAILS.city}, {COMPANY_DETAILS.postcode}</p>
                <p>{COMPANY_DETAILS.country}</p>
                <p className="mt-2">Tel: {COMPANY_DETAILS.phone}</p>
                <p>Email: {COMPANY_DETAILS.email}</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">Invoice</p>
            <h2 className="text-2xl font-bold text-gray-800">{invoice.invoiceNumber}</h2>
            <div className={`mt-3 inline-block px-3 py-1 rounded text-xs font-bold ${
              invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
              invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {invoice.status.toUpperCase()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 pb-1 border-b">From</h3>
            <p className="font-semibold text-sm">{COMPANY_DETAILS.name}</p>
            <p className="text-sm text-gray-600">{COMPANY_DETAILS.address}</p>
            <p className="text-sm text-gray-600">{COMPANY_DETAILS.city}, {COMPANY_DETAILS.postcode}</p>
            <p className="text-sm text-gray-600 mt-2">Company No: {COMPANY_DETAILS.companyNumber}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 pb-1 border-b">Bill To</h3>
            <p className="font-semibold text-sm">{invoice.companyName || invoice.customerName}</p>
            <p className="text-sm text-gray-600">{invoice.customerEmail}</p>
            {invoice.businessAddress && <p className="text-sm text-gray-600">{invoice.businessAddress}</p>}
          </div>
        </div>

        <div className="bg-gray-50 p-4 mb-6 grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500 uppercase">Invoice Date</p>
            <p className="font-semibold text-sm">{formatDate(invoice.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Due Date</p>
            <p className={`font-semibold text-sm ${invoice.status === 'overdue' ? 'text-red-600' : ''}`}>
              {formatDate(invoice.dueDate)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Period Start</p>
            <p className="font-semibold text-sm">{formatDate(invoice.periodStart)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Period End</p>
            <p className="font-semibold text-sm">{formatDate(invoice.periodEnd)}</p>
          </div>
        </div>

        <table className="w-full mb-6">
          <thead>
            <tr className="bg-primary text-white">
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase">Tracking #</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase">Date</th>
              <th className="text-left py-3 px-4 text-xs font-semibold uppercase">Description</th>
              <th className="text-right py-3 px-4 text-xs font-semibold uppercase">Amount</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length > 0 ? jobs.map((job) => (
              <tr key={job.id} className="border-b">
                <td className="py-3 px-4 font-mono text-xs">{job.trackingNumber}</td>
                <td className="py-3 px-4 text-gray-600 text-xs">{formatDate(job.createdAt)}</td>
                <td className="py-3 px-4 text-gray-600 text-xs">
                  Courier Service: {job.pickupPostcode} → {job.deliveryPostcode}
                </td>
                <td className="py-3 px-4 text-right font-medium text-sm">{formatPrice(job.totalPrice)}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={4} className="py-8 text-center text-gray-500">
                  No deliveries found for this invoice period
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="w-72">
            <div className="flex justify-between py-3 border-t-2 border-gray-800">
              <span className="font-bold text-lg">Total Due</span>
              <span className="font-bold text-lg text-primary">{formatPrice(invoice.total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t-2">
          <div className="bg-gray-50 p-4">
            <h4 className="font-semibold text-sm uppercase text-gray-800 mb-3">Payment Details</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Bank:</span>
                <span className="font-medium">{COMPANY_DETAILS.bankName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Account Name:</span>
                <span className="font-medium">{COMPANY_DETAILS.accountName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Sort Code:</span>
                <span className="font-medium">{COMPANY_DETAILS.sortCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Account Number:</span>
                <span className="font-medium">{COMPANY_DETAILS.accountNumber}</span>
              </div>
            </div>
            <p className="mt-4 text-xs text-gray-600">
              Please use invoice number <span className="font-bold">{invoice.invoiceNumber}</span> as your payment reference.
            </p>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-gray-400 leading-relaxed">
          <p>{COMPANY_DETAILS.name} | Registered in England & Wales | Company No: {COMPANY_DETAILS.companyNumber}</p>
          <p>Registered Office: {COMPANY_DETAILS.address}, {COMPANY_DETAILS.city}, {COMPANY_DETAILS.postcode}</p>
          <p className="mt-2">Thank you for your business</p>
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
