import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
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
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  FileText,
  Loader2,
  Send,
  Eye,
  Mail,
  Printer,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { queryClient } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { User as UserType, Job } from '@shared/schema';

const createInvoiceFormSchema = z.object({
  customerId: z.string().min(1, "Please select a customer or Manual Invoice"),
  periodStart: z.string().min(1, "Period start date is required"),
  periodEnd: z.string().min(1, "Period end date is required"),
  dueDate: z.string().min(1, "Due date is required"),
  notes: z.string().optional(),
  // Fields for manual invoice (customer entry)
  manualCustomerName: z.string().optional(),
  manualCustomerEmail: z.string().optional(),
  manualCompanyName: z.string().optional(),
  manualBusinessAddress: z.string().optional(),
  // Manual amount for invoices without jobs
  manualAmount: z.string().optional(),
  manualDescription: z.string().optional(),
});

type CreateInvoiceFormData = z.infer<typeof createInvoiceFormSchema>;

const formatPrice = (price: string | number | null | undefined) => {
  if (price === null || price === undefined) return '£0.00';
  const num = typeof price === 'string' ? parseFloat(price) : price;
  if (isNaN(num)) return '£0.00';
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

interface SentInvoice {
  id: string;
  invoiceNumber: string;
  customerEmail: string;
  customerName: string;
  total: number;
  sentAt: Date;
}

interface SavedInvoice {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_email: string;
  company_name: string | null;
  business_address: string | null;
  subtotal: string;
  vat: string;
  total: string;
  status: string;
  due_date: string;
  period_start: string;
  period_end: string;
  job_ids: string[] | null;
  notes: string | null;
  payment_token: string | null;
  job_details: string | null;
  created_at: string;
}

export default function AdminInvoices() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [sentInvoices, setSentInvoices] = useState<SentInvoice[]>([]);
  const [viewInvoice, setViewInvoice] = useState<SavedInvoice | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateInvoiceFormData>({
    resolver: zodResolver(createInvoiceFormSchema),
    defaultValues: {
      customerId: '',
      periodStart: '',
      periodEnd: '',
      dueDate: '',
      notes: '',
      manualCustomerName: '',
      manualCustomerEmail: '',
      manualCompanyName: '',
      manualBusinessAddress: '',
      manualAmount: '',
      manualDescription: '',
    },
  });

  const watchedCustomerId = form.watch('customerId');
  const isManualInvoice = watchedCustomerId === 'manual-invoice';

  const { data: customers, isLoading: customersLoading } = useQuery<UserType[]>({
    queryKey: ['/api/users'],
  });

  // Filter to customers only (exclude admins and drivers)
  const billableCustomers = customers?.filter(c => c.role === 'customer') || [];

  const { data: jobs } = useQuery<Job[]>({
    queryKey: ['/api/jobs'],
  });

  // Fetch saved invoices from database
  const { data: savedInvoices, isLoading: invoicesLoading, refetch: refetchInvoices } = useQuery<SavedInvoice[]>({
    queryKey: ['/api/invoices'],
  });

  const selectedCustomer = billableCustomers.find(c => c.id === watchedCustomerId);
  const isAdminJobs = watchedCustomerId === 'admin-jobs';

  // Filter jobs based on selection - either customer jobs or admin-created jobs (no customer)
  const customerJobs = jobs?.filter(job => {
    const isUnpaid = job.paymentStatus !== 'paid';
    const isDelivered = job.status === 'delivered';
    
    if (isAdminJobs) {
      // Show jobs created by admin (no customer ID) - include all unpaid jobs regardless of status
      return !job.customerId && isUnpaid;
    }
    // Show jobs for the selected customer (must be delivered and unpaid)
    return job.customerId === watchedCustomerId && isDelivered && isUnpaid;
  }) || [];

  const createInvoiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/invoices', data);
      return response.json();
    },
    onSuccess: (result: any, variables: any) => {
      const sentInvoice: SentInvoice = {
        id: result.id,
        invoiceNumber: result.invoiceNumber,
        customerEmail: result.customerEmail,
        customerName: variables.customerName,
        total: result.total,
        sentAt: new Date(),
      };
      setSentInvoices(prev => [sentInvoice, ...prev]);
      toast({ 
        title: 'Invoice sent successfully', 
        description: `Invoice ${result.invoiceNumber} sent to ${result.customerEmail}`
      });
      setCreateDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to send invoice', 
        description: error?.message || 'Please check your input and try again',
        variant: 'destructive' 
      });
    },
  });

  // Resend invoice mutation
  const resendInvoiceMutation = useMutation({
    mutationFn: async (invoice: SavedInvoice) => {
      const response = await apiRequest('POST', `/api/invoices/${invoice.id}/resend`);
      return response.json();
    },
    onSuccess: (result: any) => {
      toast({ 
        title: 'Invoice resent successfully', 
        description: `Invoice sent to ${result.customerEmail}`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to resend invoice', 
        description: error?.message || 'Please try again',
        variant: 'destructive' 
      });
    },
  });

  // Mark invoice as paid mutation
  const markPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await apiRequest('PATCH', `/api/invoices/${invoiceId}/status`, { status: 'paid' });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Invoice marked as paid' });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update invoice', 
        description: error?.message || 'Please try again',
        variant: 'destructive' 
      });
    },
  });

  // Print invoice function
  const printInvoice = (invoice: SavedInvoice) => {
    const jobDetails = invoice.job_details ? JSON.parse(invoice.job_details) : [];
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Please allow popups to print', variant: 'destructive' });
      return;
    }
    
    const jobsTable = jobDetails.length > 0 ? `
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Tracking</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Pickup</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Delivery</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Date</th>
            <th style="padding: 10px; text-align: right; border-bottom: 2px solid #dee2e6;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${jobDetails.map((job: any) => `
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">${job.trackingNumber || 'N/A'}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; word-wrap: break-word; max-width: 200px;">${job.pickupAddress || 'N/A'}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee; word-wrap: break-word; max-width: 200px;">${job.deliveryAddress || job.recipientName || 'N/A'}</td>
              <td style="padding: 10px; border-bottom: 1px solid #eee;">${job.scheduledDate || 'N/A'}</td>
              <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">£${typeof job.price === 'number' ? job.price.toFixed(2) : '0.00'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${invoice.invoice_number}</title>
        <style>
          @page {
            size: A4;
            margin: 20mm;
          }
          * {
            box-sizing: border-box;
          }
          html, body {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 20mm;
            font-family: Arial, sans-serif;
            color: #333;
            background: white;
          }
          .page-content {
            width: 100%;
            max-width: 170mm;
            margin: 0 auto;
          }
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .company { font-size: 24px; font-weight: bold; color: #007BFF; }
          .invoice-title { font-size: 28px; color: #333; text-align: right; }
          .invoice-number { color: #666; text-align: right; }
          .details { display: flex; justify-content: space-between; margin-bottom: 25px; }
          .bill-to, .invoice-info { width: 45%; }
          .label { color: #666; font-size: 11px; text-transform: uppercase; margin-bottom: 4px; }
          .value { font-size: 13px; margin-bottom: 12px; }
          .total-section { background: #f8f9fa; padding: 15px; margin-top: 20px; text-align: right; }
          .total { font-size: 20px; font-weight: bold; color: #007BFF; }
          .bank-details { margin-top: 20px; padding: 15px; background: #e8f4fd; border-radius: 8px; font-size: 13px; }
          .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 11px; }
          table { font-size: 12px; }
          @media print {
            html, body { width: 210mm; min-height: 297mm; margin: 0; padding: 15mm; }
            .page-content { max-width: 100%; }
          }
          @media screen {
            body { background: #f0f0f0; }
            .page-content { background: white; padding: 20mm; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          }
        </style>
      </head>
      <body>
        <div class="page-content">
          <div class="header">
            <div class="company">RUN COURIER</div>
            <div>
              <div class="invoice-title">INVOICE</div>
              <div class="invoice-number">${invoice.invoice_number}</div>
            </div>
          </div>
          <div class="details">
            <div class="bill-to">
              <div class="label">Bill To</div>
              <div class="value" style="font-weight: bold;">${invoice.customer_name}</div>
              ${invoice.company_name ? `<div class="value">${invoice.company_name}</div>` : ''}
              ${invoice.business_address ? `<div class="value">${invoice.business_address}</div>` : ''}
              <div class="value">${invoice.customer_email}</div>
            </div>
            <div class="invoice-info">
              <div class="label">Invoice Date</div>
              <div class="value">${formatDate(invoice.created_at)}</div>
              <div class="label">Due Date</div>
              <div class="value" style="color: #d9534f; font-weight: bold;">${formatDate(invoice.due_date)}</div>
              <div class="label">Period</div>
              <div class="value">${formatDate(invoice.period_start)} - ${formatDate(invoice.period_end)}</div>
            </div>
          </div>
          ${jobsTable}
          ${invoice.notes ? `<div style="background: #fff3cd; padding: 15px; margin: 20px 0; border-radius: 8px;"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}
          <div class="total-section">
            <div style="margin-bottom: 5px;">Subtotal: ${formatPrice(invoice.subtotal)}</div>
            <div style="margin-bottom: 10px;">VAT: ${formatPrice(invoice.vat)}</div>
            <div class="total">Total: ${formatPrice(invoice.total)}</div>
          </div>
          <div class="bank-details">
            <strong>Bank Transfer Details</strong><br>
            Account Name: RUN COURIER<br>
            Sort Code: 30-99-50<br>
            Account Number: 36113363<br>
            Reference: ${invoice.invoice_number}
          </div>
          <div class="footer">
            RUN COURIER | info@runcourier.co.uk | runcourier.co.uk
          </div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>;
      case 'pending':
      case 'expired':
      case 'overdue':
      default:
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Unpaid</Badge>;
    }
  };

  const resetForm = () => {
    form.reset();
    setSelectedJobIds([]);
  };

  const calculateTotals = () => {
    const selectedJobs = customerJobs.filter(job => selectedJobIds.includes(String(job.id)));
    const total = selectedJobs.reduce((sum, job) => {
      const price = job.totalPrice ? parseFloat(job.totalPrice) : 0;
      return sum + (isNaN(price) ? 0 : price);
    }, 0);
    return { subtotal: total, vat: 0, total };
  };

  const onSubmit = (formData: CreateInvoiceFormData) => {
    // For manual invoices, use the manual amount
    if (isManualInvoice) {
      if (!formData.manualCustomerName || !formData.manualCustomerEmail) {
        toast({ title: 'Please enter customer name and email', variant: 'destructive' });
        return;
      }
      
      const manualTotal = formData.manualAmount ? parseFloat(formData.manualAmount) : 0;
      if (manualTotal <= 0) {
        toast({ title: 'Please enter a valid amount', variant: 'destructive' });
        return;
      }

      createInvoiceMutation.mutate({
        customerId: 'manual-invoice',
        customerName: formData.manualCustomerName,
        customerEmail: formData.manualCustomerEmail,
        companyName: formData.manualCompanyName || null,
        businessAddress: formData.manualBusinessAddress || null,
        vatNumber: null,
        subtotal: manualTotal,
        vat: 0,
        total: manualTotal,
        dueDate: formData.dueDate,
        periodStart: formData.periodStart,
        periodEnd: formData.periodEnd,
        jobIds: [],
        notes: formData.manualDescription ? `${formData.manualDescription}\n\n${formData.notes || ''}`.trim() : formData.notes || null,
      });
      return;
    }

    // For job-based invoices
    if (selectedJobIds.length === 0) {
      toast({ title: 'Please select at least one job', variant: 'destructive' });
      return;
    }

    const { subtotal, vat, total } = calculateTotals();

    if (isAdminJobs) {
      // For admin jobs, use manually entered customer details
      if (!formData.manualCustomerName || !formData.manualCustomerEmail) {
        toast({ title: 'Please enter customer name and email', variant: 'destructive' });
        return;
      }

      createInvoiceMutation.mutate({
        customerId: 'admin-jobs',
        customerName: formData.manualCustomerName,
        customerEmail: formData.manualCustomerEmail,
        companyName: formData.manualCompanyName || null,
        businessAddress: formData.manualBusinessAddress || null,
        vatNumber: null,
        subtotal,
        vat,
        total,
        dueDate: formData.dueDate,
        periodStart: formData.periodStart,
        periodEnd: formData.periodEnd,
        jobIds: selectedJobIds,
        notes: formData.notes || null,
      });
    } else {
      // For regular customers
      if (!selectedCustomer) {
        toast({ title: 'Please select a customer', variant: 'destructive' });
        return;
      }

      createInvoiceMutation.mutate({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.fullName,
        customerEmail: selectedCustomer.email,
        companyName: selectedCustomer.companyName || null,
        businessAddress: selectedCustomer.businessAddress || null,
        vatNumber: null,
        subtotal,
        vat,
        total,
        dueDate: formData.dueDate,
        periodStart: formData.periodStart,
        periodEnd: formData.periodEnd,
        jobIds: selectedJobIds,
        notes: formData.notes || null,
      });
    }
  };

  const toggleJobSelection = (jobId: string | number) => {
    const id = String(jobId);
    setSelectedJobIds(prev => 
      prev.includes(id) 
        ? prev.filter(prevId => prevId !== id)
        : [...prev, id]
    );
  };

  const { subtotal, vat, total } = calculateTotals();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Invoices</h1>
            <p className="text-muted-foreground">Create and manage customer invoices</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-invoice">
            <Plus className="h-4 w-4 mr-2" />
            Create Invoice
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Recently Sent Invoices
            </CardTitle>
            <CardDescription>
              Invoices are sent directly via email. This shows invoices sent during this session.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sentInvoices.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No invoices sent yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Click "Create Invoice" to send an invoice directly to a customer's email
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sentInvoices.map((invoice, index) => {
                      const fullInvoice = savedInvoices?.find(s => s.id === invoice.id);
                      return (
                        <TableRow key={index} data-testid={`row-sent-invoice-${index}`}>
                          <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
                          <TableCell className="font-medium">{invoice.customerName}</TableCell>
                          <TableCell className="text-muted-foreground">{invoice.customerEmail}</TableCell>
                          <TableCell className="text-right font-medium">{formatPrice(invoice.total)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(invoice.sentAt).toLocaleTimeString('en-GB', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-recent-invoice-actions-${index}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem 
                                  onClick={() => { 
                                    if (fullInvoice) {
                                      setViewInvoice(fullInvoice); 
                                      setViewDialogOpen(true); 
                                    } else {
                                      refetchInvoices().then(() => {
                                        const refreshed = savedInvoices?.find(s => s.id === invoice.id);
                                        if (refreshed) {
                                          setViewInvoice(refreshed);
                                          setViewDialogOpen(true);
                                        }
                                      });
                                    }
                                  }}
                                  data-testid={`menu-view-recent-${index}`}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => {
                                    if (fullInvoice) {
                                      resendInvoiceMutation.mutate(fullInvoice);
                                    } else {
                                      toast({ title: 'Loading invoice...', description: 'Please try again in a moment' });
                                      refetchInvoices();
                                    }
                                  }}
                                  disabled={resendInvoiceMutation.isPending}
                                  data-testid={`menu-resend-recent-${index}`}
                                >
                                  <Mail className="h-4 w-4 mr-2" />
                                  Resend Email
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => {
                                    if (fullInvoice) {
                                      printInvoice(fullInvoice);
                                    } else {
                                      toast({ title: 'Loading invoice...', description: 'Please try again in a moment' });
                                      refetchInvoices();
                                    }
                                  }}
                                  data-testid={`menu-print-recent-${index}`}
                                >
                                  <Printer className="h-4 w-4 mr-2" />
                                  Print Invoice
                                </DropdownMenuItem>
                                {fullInvoice && fullInvoice.status !== 'paid' && (
                                  <DropdownMenuItem 
                                    onClick={() => markPaidMutation.mutate(invoice.id)}
                                    disabled={markPaidMutation.isPending}
                                    data-testid={`menu-mark-paid-recent-${index}`}
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Mark as Paid
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

        {/* Saved Invoices from Database */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Saved Invoices
                </CardTitle>
                <CardDescription>
                  All invoices stored in the database with full history
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchInvoices()} data-testid="button-refresh-invoices">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !savedInvoices || savedInvoices.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No invoices found</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Create an invoice to get started
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {savedInvoices.map((invoice) => (
                      <TableRow key={invoice.id} data-testid={`row-saved-invoice-${invoice.id}`}>
                        <TableCell className="font-mono">{invoice.invoice_number}</TableCell>
                        <TableCell className="font-medium">{invoice.customer_name}</TableCell>
                        <TableCell className="text-muted-foreground">{invoice.customer_email}</TableCell>
                        <TableCell className="text-right font-medium">{formatPrice(invoice.total)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(invoice.due_date)}</TableCell>
                        <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-invoice-actions-${invoice.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => { setViewInvoice(invoice); setViewDialogOpen(true); }}
                                data-testid={`menu-view-invoice-${invoice.id}`}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => resendInvoiceMutation.mutate(invoice)}
                                disabled={resendInvoiceMutation.isPending}
                                data-testid={`menu-resend-invoice-${invoice.id}`}
                              >
                                <Mail className="h-4 w-4 mr-2" />
                                Resend Email
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => printInvoice(invoice)}
                                data-testid={`menu-print-invoice-${invoice.id}`}
                              >
                                <Printer className="h-4 w-4 mr-2" />
                                Print Invoice
                              </DropdownMenuItem>
                              {invoice.status !== 'paid' && (
                                <DropdownMenuItem 
                                  onClick={() => markPaidMutation.mutate(invoice.id)}
                                  disabled={markPaidMutation.isPending}
                                  data-testid={`menu-mark-paid-${invoice.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  Mark as Paid
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

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
                    {viewInvoice.business_address && <p className="text-sm text-muted-foreground">{viewInvoice.business_address}</p>}
                    <p className="text-sm text-muted-foreground">{viewInvoice.customer_email}</p>
                  </div>
                  <div className="text-right">
                    <div className="mb-2">
                      <span className="text-sm text-muted-foreground">Status: </span>
                      {getStatusBadge(viewInvoice.status)}
                    </div>
                    <p className="text-sm"><span className="text-muted-foreground">Created:</span> {formatDate(viewInvoice.created_at)}</p>
                    <p className="text-sm"><span className="text-muted-foreground">Due:</span> {formatDate(viewInvoice.due_date)}</p>
                    <p className="text-sm"><span className="text-muted-foreground">Period:</span> {formatDate(viewInvoice.period_start)} - {formatDate(viewInvoice.period_end)}</p>
                  </div>
                </div>

                {viewInvoice.job_details && JSON.parse(viewInvoice.job_details).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Jobs Included</h4>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tracking</TableHead>
                            <TableHead>Pickup</TableHead>
                            <TableHead>Delivery</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {JSON.parse(viewInvoice.job_details).map((job: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-sm">{job.trackingNumber || 'N/A'}</TableCell>
                              <TableCell className="text-sm max-w-[200px] break-words">{job.pickupAddress || 'N/A'}</TableCell>
                              <TableCell className="text-sm max-w-[200px] break-words">{job.deliveryAddress || job.recipientName || 'N/A'}</TableCell>
                              <TableCell className="text-right font-medium">{formatPrice(job.price)}</TableCell>
                            </TableRow>
                          ))}
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
                    <span>{formatPrice(viewInvoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-muted-foreground">VAT</span>
                    <span>{formatPrice(viewInvoice.vat)}</span>
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
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => viewInvoice && printInvoice(viewInvoice)}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button variant="outline" onClick={() => viewInvoice && resendInvoiceMutation.mutate(viewInvoice)} disabled={resendInvoiceMutation.isPending}>
                <Mail className="h-4 w-4 mr-2" />
                Resend
              </Button>
              {viewInvoice?.status !== 'paid' && (
                <Button onClick={() => viewInvoice && markPaidMutation.mutate(viewInvoice.id)} disabled={markPaidMutation.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark Paid
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={createDialogOpen} onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Send Invoice</DialogTitle>
              <DialogDescription>
                Create and send an invoice directly to the customer's email
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer</FormLabel>
                      {customersLoading ? (
                        <Skeleton className="h-10 w-full" />
                      ) : (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-customer">
                              <SelectValue placeholder="Select a customer or Admin Jobs" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="manual-invoice">
                              Manual Invoice (Enter All Details)
                            </SelectItem>
                            <SelectItem value="admin-jobs">
                              Admin Jobs (Link to Existing Jobs)
                            </SelectItem>
                            {billableCustomers.length > 0 && (
                              <>
                                {billableCustomers.map((customer) => (
                                  <SelectItem key={customer.id} value={customer.id}>
                                    {customer.companyName || customer.fullName} ({customer.email})
                                  </SelectItem>
                                ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedCustomer && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Name</p>
                          <p className="font-medium">{selectedCustomer.fullName}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Email</p>
                          <p className="font-medium">{selectedCustomer.email}</p>
                        </div>
                        {selectedCustomer.companyName && (
                          <div>
                            <p className="text-muted-foreground">Company</p>
                            <p className="font-medium">{selectedCustomer.companyName}</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {(isAdminJobs || isManualInvoice) && (
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      <p className="text-sm text-muted-foreground">Enter customer details for this invoice:</p>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="manualCustomerName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Customer Name *</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Customer name" data-testid="input-manual-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="manualCustomerEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email *</FormLabel>
                              <FormControl>
                                <Input {...field} type="email" placeholder="customer@email.com" data-testid="input-manual-email" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="manualCompanyName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Company Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Company name (optional)" data-testid="input-manual-company" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="manualBusinessAddress"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Business Address</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Business address (optional)" data-testid="input-manual-address" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}

                {isManualInvoice && (
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      <p className="text-sm text-muted-foreground">Enter invoice amount and description:</p>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="manualAmount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Total Amount (£) *</FormLabel>
                              <FormControl>
                                <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" data-testid="input-manual-amount" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="manualDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description / Line Items</FormLabel>
                            <FormControl>
                              <Textarea {...field} placeholder="Enter invoice description or line items..." rows={3} data-testid="input-manual-description" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="periodStart"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Period Start</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-period-start" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="periodEnd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Period End</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-period-end" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-due-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {watchedCustomerId && !isManualInvoice && customerJobs.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Select Jobs to Include ({selectedJobIds.length} of {customerJobs.length} selected)</Label>
                      <div className="flex gap-2">
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => setSelectedJobIds(customerJobs.map(j => String(j.id)))}
                          data-testid="button-select-all-jobs"
                        >
                          Select All
                        </Button>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          onClick={() => setSelectedJobIds([])}
                          data-testid="button-deselect-all-jobs"
                        >
                          Deselect All
                        </Button>
                      </div>
                    </div>
                    <div className="border rounded-md max-h-64 overflow-y-auto">
                      {customerJobs.map((job) => {
                        const jobIdStr = String(job.id);
                        const isSelected = selectedJobIds.includes(jobIdStr);
                        return (
                          <div
                            key={job.id}
                            className={`flex items-center justify-between p-3 border-b last:border-b-0 cursor-pointer hover-elevate ${
                              isSelected ? 'bg-primary/10' : ''
                            }`}
                            onClick={() => toggleJobSelection(job.id)}
                            data-testid={`job-select-${job.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleJobSelection(job.id)}
                                className="h-4 w-4"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div>
                                <p className="font-mono text-sm">{job.trackingNumber}</p>
                                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                                  {job.pickupAddress || `${job.pickupPostcode} → ${job.deliveryPostcode}`}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(job.createdAt)} - {job.status}
                                </p>
                              </div>
                            </div>
                            <span className="font-medium">{formatPrice(job.totalPrice)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {watchedCustomerId && !isManualInvoice && customerJobs.length === 0 && (
                  <div className="text-center py-6 border rounded-md">
                    <p className="text-muted-foreground">
                      {isAdminJobs 
                        ? 'No unpaid admin jobs found' 
                        : 'No unpaid delivered jobs for this customer'}
                    </p>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Add any notes for this invoice..."
                          data-testid="input-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isManualInvoice && (
                  <Card>
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex justify-between font-bold text-lg">
                          <span>Total</span>
                          <span>{formatPrice(total)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={createInvoiceMutation.isPending || !watchedCustomerId || (!isManualInvoice && selectedJobIds.length === 0)}
                    data-testid="button-submit-invoice"
                  >
                    {createInvoiceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Invoice
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
