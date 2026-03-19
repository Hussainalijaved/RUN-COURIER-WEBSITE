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
  Download,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Pencil,
  Trash2,
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
import { PostcodeAutocomplete } from '@/components/PostcodeAutocomplete';

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
  manualPostcode: z.string().optional(),
  // Manual amount for invoices without jobs
  manualAmount: z.string().optional(),
  manualDescription: z.string().optional(),
});

type CreateInvoiceFormData = z.infer<typeof createInvoiceFormSchema>;

const editInvoiceFormSchema = z.object({
  customer_name: z.string().min(1, "Customer name is required"),
  customer_email: z.string().email("Valid email required"),
  company_name: z.string().optional(),
  business_address: z.string().optional(),
  subtotal: z.string().min(1, "Subtotal is required"),
  vat: z.string().optional(),
  due_date: z.string().min(1, "Due date is required"),
  period_start: z.string().min(1, "Period start is required"),
  period_end: z.string().min(1, "Period end is required"),
  notes: z.string().optional(),
  status: z.string().optional(),
});

type EditInvoiceFormData = z.infer<typeof editInvoiceFormSchema>;

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
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [sentInvoices, setSentInvoices] = useState<SentInvoice[]>([]);
  const [viewInvoice, setViewInvoice] = useState<SavedInvoice | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState<SavedInvoice | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteInvoice, setDeleteInvoice] = useState<SavedInvoice | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkSendDialogOpen, setBulkSendDialogOpen] = useState(false);
  const [overrideEmail, setOverrideEmail] = useState('');
  const [sendEmailDialogOpen, setSendEmailDialogOpen] = useState(false);
  const [sendEmailInvoice, setSendEmailInvoice] = useState<SavedInvoice | null>(null);
  const [sendEmailAddress, setSendEmailAddress] = useState('');
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
      manualPostcode: '',
      manualAmount: '',
      manualDescription: '',
    },
  });

  const watchedCustomerId = form.watch('customerId');
  const isManualInvoice = watchedCustomerId === 'manual-invoice';

  const editForm = useForm<EditInvoiceFormData>({
    resolver: zodResolver(editInvoiceFormSchema),
    defaultValues: {
      customer_name: '',
      customer_email: '',
      company_name: '',
      business_address: '',
      subtotal: '',
      vat: '',
      due_date: '',
      period_start: '',
      period_end: '',
      notes: '',
      status: '',
    },
  });

  const openEditDialog = (invoice: SavedInvoice) => {
    setEditInvoice(invoice);
    editForm.reset({
      customer_name: invoice.customer_name || '',
      customer_email: invoice.customer_email || '',
      company_name: invoice.company_name || '',
      business_address: invoice.business_address || '',
      subtotal: invoice.subtotal || '',
      vat: invoice.vat || '0',
      due_date: invoice.due_date ? new Date(invoice.due_date).toISOString().split('T')[0] : '',
      period_start: invoice.period_start ? new Date(invoice.period_start).toISOString().split('T')[0] : '',
      period_end: invoice.period_end ? new Date(invoice.period_end).toISOString().split('T')[0] : '',
      notes: invoice.notes || '',
      status: invoice.status || 'pending',
    });
    setEditDialogOpen(true);
  };

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
    mutationFn: async ({ invoice, overrideEmail }: { invoice: SavedInvoice; overrideEmail?: string }) => {
      const response = await apiRequest('POST', `/api/invoices/${invoice.id}/resend`, 
        overrideEmail ? { overrideEmail } : undefined
      );
      return response.json();
    },
    onSuccess: (result: any) => {
      toast({ 
        title: 'Invoice sent successfully', 
        description: `Invoice sent to ${result.customerEmail}`
      });
      setSendEmailDialogOpen(false);
      setSendEmailInvoice(null);
      setSendEmailAddress('');
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to send invoice', 
        description: error?.message || 'Please try again',
        variant: 'destructive' 
      });
    },
  });

  const openSendEmailDialog = (invoice: SavedInvoice) => {
    setSendEmailInvoice(invoice);
    setSendEmailAddress(invoice.customer_email || '');
    setSendEmailDialogOpen(true);
  };

  const handleSendEmail = () => {
    if (!sendEmailInvoice) return;
    const emailToUse = sendEmailAddress.trim();
    if (!emailToUse || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToUse)) {
      toast({ title: 'Please enter a valid email address', variant: 'destructive' });
      return;
    }
    const isOverride = emailToUse !== sendEmailInvoice.customer_email;
    resendInvoiceMutation.mutate({ 
      invoice: sendEmailInvoice, 
      overrideEmail: isOverride ? emailToUse : undefined 
    });
  };

  // Bulk send invoices mutation
  const bulkSendInvoicesMutation = useMutation({
    mutationFn: async ({ invoiceIds, overrideEmail }: { invoiceIds: string[]; overrideEmail?: string }) => {
      const response = await apiRequest('POST', '/api/invoices/bulk-send', { 
        invoiceIds,
        overrideEmail: overrideEmail || undefined
      });
      return response.json();
    },
    onSuccess: (result: any) => {
      toast({ 
        title: 'Invoices sent', 
        description: result.message
      });
      setSelectedInvoiceIds([]);
      setBulkSendDialogOpen(false);
      setOverrideEmail('');
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to send invoices', 
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

  // Edit invoice mutation
  const editInvoiceMutation = useMutation({
    mutationFn: async (data: EditInvoiceFormData & { invoiceId: string }) => {
      const { invoiceId, ...updateData } = data;
      const subtotal = parseFloat(updateData.subtotal);
      const vat = parseFloat(updateData.vat || '0');
      const total = subtotal + vat;
      
      const response = await apiRequest('PATCH', `/api/invoices/${invoiceId}`, {
        customer_name: updateData.customer_name,
        customer_email: updateData.customer_email,
        company_name: updateData.company_name || null,
        business_address: updateData.business_address || null,
        subtotal: String(subtotal),
        vat: String(vat),
        amount: total,
        due_date: updateData.due_date,
        period_start: updateData.period_start,
        period_end: updateData.period_end,
        notes: updateData.notes || null,
        status: updateData.status,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Invoice updated successfully' });
      setEditDialogOpen(false);
      setEditInvoice(null);
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

  const onEditSubmit = (data: EditInvoiceFormData) => {
    if (!editInvoice) return;
    editInvoiceMutation.mutate({ ...data, invoiceId: editInvoice.id });
  };

  // Delete invoice mutation
  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      const response = await apiRequest('DELETE', `/api/invoices/${invoiceId}`);
      return response.json();
    },
    onSuccess: (result: any) => {
      toast({ title: 'Invoice deleted', description: result?.message || 'Invoice has been deleted successfully' });
      setDeleteDialogOpen(false);
      setDeleteInvoice(null);
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to delete invoice', 
        description: error?.message || 'Please try again',
        variant: 'destructive' 
      });
    },
  });

  const handleDeleteInvoice = (invoice: SavedInvoice) => {
    setDeleteInvoice(invoice);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteInvoice = () => {
    if (deleteInvoice) {
      deleteInvoiceMutation.mutate(deleteInvoice.id);
    }
  };

  // Print invoice function
  const printInvoice = (invoice: SavedInvoice) => {
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
            <div class="status ${statusClass}">${invoice.status.toUpperCase()}</div>
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
            <p>${invoice.customer_email}</p>
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
            <div class="totals-row"><span>Subtotal</span><span>${formatPrice(invoice.subtotal)}</span></div>
            <div class="totals-row"><span>VAT</span><span>${formatPrice(invoice.vat)}</span></div>
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
          Run Courier | +44 20 4634 6100 | info@runcourier.co.uk | www.runcourier.co.uk<br>
          112 Bridgwater Road, Ruislip, HA4 6LW, London, United Kingdom<br>
          Thank you for your business
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const downloadInvoicePdf = async (invoice: SavedInvoice) => {
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const jobDetails = invoice.job_details ? JSON.parse(invoice.job_details) : [];
    const pageWidth = 210;
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const checkPageBreak = (needed: number) => {
      if (y + needed > 280) {
        doc.addPage();
        y = margin;
      }
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
    doc.text(invoice.invoice_number, pageWidth - margin, y + 14, { align: 'right' });
    const statusLabel = invoice.status.toUpperCase();
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const statusColor = invoice.status === 'paid' ? [21, 87, 36] : invoice.status === 'overdue' ? [114, 28, 36] : [133, 100, 4];
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
    doc.text(invoice.customer_name || '', margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    if (invoice.company_name) {
      doc.text(invoice.company_name, margin, y);
      y += 5;
    }
    if (invoice.business_address) {
      const addrLines = doc.splitTextToSize(invoice.business_address, contentWidth / 2 - 5);
      doc.text(addrLines, margin, y);
      y += addrLines.length * 4.5;
    }
    doc.setTextColor(80, 80, 80);
    doc.text(invoice.customer_email || '', margin, y);

    let detailY = y - (invoice.company_name ? 10 : 5) - (invoice.business_address ? 5 : 0);
    const detailX = pageWidth / 2 + 10;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.setFont('helvetica', 'normal');
    doc.text('Invoice Date', detailX, detailY);
    detailY += 4;
    doc.setFontSize(10);
    doc.setTextColor(17, 17, 17);
    doc.text(formatDate(invoice.created_at), detailX, detailY);
    detailY += 7;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Due Date', detailX, detailY);
    detailY += 4;
    doc.setFontSize(10);
    doc.setTextColor(200, 50, 50);
    doc.setFont('helvetica', 'bold');
    doc.text(formatDate(invoice.due_date), detailX, detailY);
    detailY += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Period', detailX, detailY);
    detailY += 4;
    doc.setFontSize(10);
    doc.setTextColor(17, 17, 17);
    doc.text(`${formatDate(invoice.period_start)} - ${formatDate(invoice.period_end)}`, detailX, detailY);

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

    if (invoice.notes) {
      checkPageBreak(20);
      y += 5;
      doc.setFillColor(255, 243, 205);
      const noteLines = doc.splitTextToSize(invoice.notes, contentWidth - 10);
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
    doc.text(formatPrice(invoice.subtotal), pageWidth - margin - 5, y + 8, { align: 'right' });
    doc.setTextColor(80, 80, 80);
    doc.text('VAT:', pageWidth - margin - 50, y + 15);
    doc.setTextColor(17, 17, 17);
    doc.text(formatPrice(invoice.vat), pageWidth - margin - 5, y + 15, { align: 'right' });
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 123, 255);
    doc.text('Total:', pageWidth - margin - 50, y + 25);
    doc.text(formatPrice(invoice.total), pageWidth - margin - 5, y + 25, { align: 'right' });
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
    doc.text(`Account Name: RUN COURIER`, margin + 5, y + 13);
    doc.text(`Sort Code: 30-99-50`, margin + 5, y + 18);
    doc.text(`Account Number: 36113363`, margin + 80, y + 13);
    doc.text(`Reference: ${invoice.invoice_number}`, margin + 80, y + 18);
    y += 35;

    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.text('Run Courier | 112 Bridgwater Road, Ruislip, HA4 6LW, London | info@runcourier.co.uk | runcourier.co.uk', pageWidth / 2, 290, { align: 'center' });

    doc.save(`${invoice.invoice_number}.pdf`);
    toast({ title: 'PDF downloaded', description: `${invoice.invoice_number}.pdf saved` });
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

  const buildBusinessAddress = (address?: string, postcode?: string) => {
    const addr = address?.trim() || '';
    const pc = postcode?.trim() || '';
    if (!addr && !pc) return null;
    if (!addr) return pc;
    if (!pc) return addr;
    if (addr.toUpperCase().includes(pc.toUpperCase())) return addr;
    return `${addr}, ${pc}`;
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
        businessAddress: buildBusinessAddress(formData.manualBusinessAddress, formData.manualPostcode),
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
        businessAddress: buildBusinessAddress(formData.manualBusinessAddress, formData.manualPostcode),
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
                                      openEditDialog(fullInvoice);
                                    } else {
                                      refetchInvoices().then(() => {
                                        const refreshed = savedInvoices?.find(s => s.id === invoice.id);
                                        if (refreshed) {
                                          openEditDialog(refreshed);
                                        }
                                      });
                                    }
                                  }}
                                  data-testid={`menu-edit-recent-${index}`}
                                >
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => {
                                    if (fullInvoice) {
                                      openSendEmailDialog(fullInvoice);
                                    } else {
                                      toast({ title: 'Loading invoice...', description: 'Please try again in a moment' });
                                      refetchInvoices();
                                    }
                                  }}
                                  data-testid={`menu-resend-recent-${index}`}
                                >
                                  <Mail className="h-4 w-4 mr-2" />
                                  Send Email
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
                                <DropdownMenuItem 
                                  onClick={() => {
                                    if (fullInvoice) {
                                      downloadInvoicePdf(fullInvoice);
                                    } else {
                                      toast({ title: 'Loading invoice...', description: 'Please try again in a moment' });
                                      refetchInvoices();
                                    }
                                  }}
                                  data-testid={`menu-download-recent-${index}`}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  Download PDF
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
                                {fullInvoice && (
                                  <DropdownMenuItem 
                                    onClick={() => handleDeleteInvoice(fullInvoice)}
                                    className="text-destructive focus:text-destructive"
                                    data-testid={`menu-delete-recent-${index}`}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Invoice
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
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Saved Invoices
                </CardTitle>
                <CardDescription>
                  All invoices stored in the database with full history
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {selectedInvoiceIds.length > 0 && (
                  <Button 
                    size="sm" 
                    onClick={() => setBulkSendDialogOpen(true)}
                    disabled={bulkSendInvoicesMutation.isPending}
                    data-testid="button-bulk-send-invoices"
                  >
                    {bulkSendInvoicesMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send {selectedInvoiceIds.length} Selected
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => refetchInvoices()} data-testid="button-refresh-invoices">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
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
                      <TableHead className="w-12">
                        <Checkbox
                          checked={savedInvoices.length > 0 && selectedInvoiceIds.length === savedInvoices.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedInvoiceIds(savedInvoices.map(inv => inv.id));
                            } else {
                              setSelectedInvoiceIds([]);
                            }
                          }}
                          data-testid="checkbox-select-all-invoices"
                        />
                      </TableHead>
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
                        <TableCell>
                          <Checkbox
                            checked={selectedInvoiceIds.includes(invoice.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedInvoiceIds(prev => [...prev, invoice.id]);
                              } else {
                                setSelectedInvoiceIds(prev => prev.filter(id => id !== invoice.id));
                              }
                            }}
                            data-testid={`checkbox-invoice-${invoice.id}`}
                          />
                        </TableCell>
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
                                onClick={() => openEditDialog(invoice)}
                                data-testid={`menu-edit-invoice-${invoice.id}`}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => openSendEmailDialog(invoice)}
                                data-testid={`menu-resend-invoice-${invoice.id}`}
                              >
                                <Mail className="h-4 w-4 mr-2" />
                                Send Email
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => printInvoice(invoice)}
                                data-testid={`menu-print-invoice-${invoice.id}`}
                              >
                                <Printer className="h-4 w-4 mr-2" />
                                Print Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => downloadInvoicePdf(invoice)}
                                data-testid={`menu-download-invoice-${invoice.id}`}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download PDF
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
                              <DropdownMenuItem 
                                onClick={() => handleDeleteInvoice(invoice)}
                                className="text-destructive focus:text-destructive"
                                data-testid={`menu-delete-invoice-${invoice.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Invoice
                              </DropdownMenuItem>
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

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Invoice</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this invoice? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {deleteInvoice && (
              <div className="py-4 space-y-2">
                <p><span className="font-medium">Invoice:</span> {deleteInvoice.invoice_number}</p>
                <p><span className="font-medium">Customer:</span> {deleteInvoice.customer_name}</p>
                <p><span className="font-medium">Amount:</span> {formatPrice(deleteInvoice.total)}</p>
                <p><span className="font-medium">Status:</span> {deleteInvoice.status}</p>
              </div>
            )}
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setDeleteDialogOpen(false)}
                data-testid="button-cancel-delete-invoice"
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmDeleteInvoice}
                disabled={deleteInvoiceMutation.isPending}
                data-testid="button-confirm-delete-invoice"
              >
                {deleteInvoiceMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Invoice
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                                <TableCell className="font-mono text-sm">{job.jobNumber || job.trackingNumber || 'N/A'}</TableCell>
                                <TableCell className="text-sm max-w-[300px] break-words">
                                  {isMultiDrop ? (
                                    <div>
                                      <div className="font-medium mb-1">Same-Day Delivery &mdash; {job.multiDropStops.length} drop-offs</div>
                                      <div className="text-xs text-muted-foreground mb-1">Collected from: {job.pickupAddress || 'N/A'}</div>
                                      {job.multiDropStops.map((stop: any, stopIdx: number) => (
                                        <div key={stopIdx} className="text-xs text-muted-foreground pl-3 py-0.5 border-l-2 border-primary/30">
                                          Stop {stop.stopOrder || stopIdx + 1}: {stop.address || stop.postcode}
                                          {stop.recipientName && <span className="ml-1">&mdash; {stop.recipientName}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="font-medium mb-0.5">Same-Day Delivery</div>
                                      <div className="text-xs text-muted-foreground">{job.pickupAddress || 'N/A'} &rarr; {job.deliveryAddress || job.recipientName || 'N/A'}</div>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatPrice(job.price)}</TableCell>
                              </TableRow>
                              {job.waitingTimeCharge > 0 && (
                                <TableRow key={`${idx}-wt`}>
                                  <TableCell />
                                  <TableCell className="text-xs text-muted-foreground italic">
                                    Waiting time charge{job.waitingTimeMinutes > 0 ? ` (${job.waitingTimeMinutes} min)` : ''}
                                  </TableCell>
                                  <TableCell className="text-right text-xs text-muted-foreground">{formatPrice(job.waitingTimeCharge)}</TableCell>
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
              <Button variant="outline" onClick={() => viewInvoice && downloadInvoicePdf(viewInvoice)} data-testid="button-download-pdf">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              <Button variant="outline" onClick={() => viewInvoice && printInvoice(viewInvoice)}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button variant="outline" onClick={() => viewInvoice && openSendEmailDialog(viewInvoice)}>
                <Mail className="h-4 w-4 mr-2" />
                Send Email
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

        {/* Edit Invoice Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditInvoice(null);
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Invoice</DialogTitle>
              <DialogDescription>
                {editInvoice?.invoice_number} (Invoice number cannot be changed)
              </DialogDescription>
            </DialogHeader>

            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="customer_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-customer-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="customer_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Email</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} data-testid="input-edit-customer-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="company_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name (Optional)</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-edit-company-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-status">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                            <SelectItem value="overdue">Overdue</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={editForm.control}
                  name="business_address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Address (Optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} data-testid="input-edit-business-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="subtotal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subtotal (£)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} data-testid="input-edit-subtotal" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="vat"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>VAT (£)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} data-testid="input-edit-vat" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={editForm.control}
                    name="due_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Due Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-edit-due-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="period_start"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Period Start</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-edit-period-start" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="period_end"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Period End</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-edit-period-end" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={editForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes (Optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} data-testid="input-edit-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter className="gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={editInvoiceMutation.isPending} data-testid="button-save-invoice">
                    {editInvoiceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Save Changes
                  </Button>
                </DialogFooter>
              </form>
            </Form>
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
                          name="manualPostcode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Postcode</FormLabel>
                              <FormControl>
                                <PostcodeAutocomplete
                                  value={field.value || ''}
                                  onChange={(postcode, fullAddress) => {
                                    field.onChange(postcode);
                                    if (fullAddress) {
                                      form.setValue('manualBusinessAddress', fullAddress);
                                    }
                                  }}
                                  placeholder="Enter postcode"
                                  data-testid="input-manual-postcode"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="manualBusinessAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Business Address</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Business address (auto-filled from postcode or enter manually)" data-testid="input-manual-address" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
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
                                <p className="font-mono text-sm">{(job as any).jobNumber || job.trackingNumber}</p>
                                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                                  {job.pickupAddress || `${job.pickupPostcode} → ${job.deliveryPostcode}`}
                                </p>
                                {(job as any).isMultiDrop && (job as any).multiDropStops?.length > 0 && (
                                  <p className="text-xs text-primary font-medium">
                                    Multi-drop: {(job as any).multiDropStops.length} stops
                                  </p>
                                )}
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

        {/* Bulk Send Confirmation Dialog */}
        <Dialog 
          open={bulkSendDialogOpen} 
          onOpenChange={(open) => {
            setBulkSendDialogOpen(open);
            if (!open) setOverrideEmail('');
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Send {selectedInvoiceIds.length} Invoice{selectedInvoiceIds.length !== 1 ? 's' : ''}</DialogTitle>
              <DialogDescription>
                You can optionally send all selected invoices to a different email address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="override-email">Send to different email (optional)</Label>
                <Input
                  id="override-email"
                  type="email"
                  placeholder="Leave empty to use original emails"
                  value={overrideEmail}
                  onChange={(e) => setOverrideEmail(e.target.value)}
                  data-testid="input-override-email"
                />
                {overrideEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(overrideEmail.trim()) && (
                  <p className="text-sm text-destructive">Please enter a valid email address</p>
                )}
                <p className="text-sm text-muted-foreground">
                  If provided, all {selectedInvoiceIds.length} invoice{selectedInvoiceIds.length !== 1 ? 's' : ''} will be sent to this email instead of the original customer emails.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setBulkSendDialogOpen(false);
                  setOverrideEmail('');
                }}
                disabled={bulkSendInvoicesMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => bulkSendInvoicesMutation.mutate({ 
                  invoiceIds: selectedInvoiceIds, 
                  overrideEmail: overrideEmail.trim() || undefined 
                })}
                disabled={bulkSendInvoicesMutation.isPending || (overrideEmail.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(overrideEmail.trim()))}
                data-testid="button-confirm-bulk-send"
              >
                {bulkSendInvoicesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Invoice{selectedInvoiceIds.length !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Send Email Dialog */}
        <Dialog 
          open={sendEmailDialogOpen} 
          onOpenChange={(open) => {
            setSendEmailDialogOpen(open);
            if (!open) {
              setSendEmailInvoice(null);
              setSendEmailAddress('');
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Send Invoice</DialogTitle>
              <DialogDescription>
                {sendEmailInvoice?.invoice_number} - Send this invoice to any email address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="send-email-address">Email Address</Label>
                <Input
                  id="send-email-address"
                  type="email"
                  placeholder="Enter email address"
                  value={sendEmailAddress}
                  onChange={(e) => setSendEmailAddress(e.target.value)}
                  data-testid="input-send-email-address"
                />
                {sendEmailAddress.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendEmailAddress.trim()) && (
                  <p className="text-sm text-destructive">Please enter a valid email address</p>
                )}
                {sendEmailInvoice && sendEmailAddress.trim() !== sendEmailInvoice.customer_email && sendEmailAddress.trim() && (
                  <p className="text-sm text-muted-foreground">
                    Original email: {sendEmailInvoice.customer_email}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setSendEmailDialogOpen(false);
                  setSendEmailInvoice(null);
                  setSendEmailAddress('');
                }}
                disabled={resendInvoiceMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSendEmail}
                disabled={resendInvoiceMutation.isPending || !sendEmailAddress.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sendEmailAddress.trim())}
                data-testid="button-confirm-send-email"
              >
                {resendInvoiceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
