import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  CheckCircle,
  Clock,
  RefreshCw,
  Play,
  Eye,
  Send,
  CircleDollarSign,
  Building2,
  Calendar,
  Package,
} from "lucide-react";

function getAuthHeaders(): Record<string, string> {
  const session = localStorage.getItem("supabase_session");
  if (session) {
    try {
      const parsed = JSON.parse(session);
      const token = parsed?.access_token;
      if (token) return { Authorization: `Bearer ${token}` };
    } catch {}
  }
  return {};
}

interface ApiInvoice {
  id: number;
  invoice_number: string;
  api_client_id: number;
  company_name: string;
  billing_email: string;
  period_start: string;
  period_end: string;
  total_amount: string;
  job_count: number;
  status: "sent" | "paid" | "void";
  created_at: string;
  sent_at: string | null;
  paid_at: string | null;
  notes: string | null;
}

interface InvoiceItem {
  id: number;
  job_id: string;
  tracking_number: string;
  pickup_address: string;
  delivery_address: string;
  vehicle_type: string;
  scheduled_date: string;
  amount: string;
}

interface ApiInvoiceDetail extends ApiInvoice {
  items: InvoiceItem[];
}

function statusBadge(status: string) {
  if (status === "paid")
    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        <CheckCircle className="w-3 h-3 mr-1" />
        Paid
      </Badge>
    );
  if (status === "void")
    return (
      <Badge variant="secondary">
        Void
      </Badge>
    );
  return (
    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
      <Clock className="w-3 h-3 mr-1" />
      Sent
    </Badge>
  );
}

function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtPeriod(start: string, end: string) {
  const s = new Date(start).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
  const e = new Date(end).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return `${s} — ${e}`;
}

export default function AdminApiInvoices() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailInvoice, setDetailInvoice] = useState<ApiInvoiceDetail | null>(null);
  const [confirmPaidId, setConfirmPaidId] = useState<number | null>(null);
  const [runConfirmOpen, setRunConfirmOpen] = useState(false);

  const { data: invoices = [], isLoading, refetch } = useQuery<ApiInvoice[]>({
    queryKey: ["/api/admin/api-invoices", statusFilter],
    queryFn: async () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/admin/api-invoices${params}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load invoices");
      return res.json();
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/api-invoices/${id}/mark-paid`, {
        method: "PATCH",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to mark as paid");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice marked as paid" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-invoices"] });
      setConfirmPaidId(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/api-invoices/${id}/resend`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to resend");
      }
      return res.json();
    },
    onSuccess: () => toast({ title: "Invoice email resent" }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const runNowMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/api-invoices/run-now", {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Invoice run failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Invoice run complete",
        description: `Invoiced: ${data.invoiced}, Skipped: ${data.skipped}${data.errors?.length ? `, Errors: ${data.errors.length}` : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-invoices"] });
      setRunConfirmOpen(false);
    },
    onError: (e: Error) => {
      toast({ title: "Run failed", description: e.message, variant: "destructive" });
      setRunConfirmOpen(false);
    },
  });

  const openDetail = async (inv: ApiInvoice) => {
    try {
      const res = await fetch(`/api/admin/api-invoices/${inv.id}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load");
      const detail: ApiInvoiceDetail = await res.json();
      setDetailInvoice(detail);
    } catch {
      toast({ title: "Failed to load invoice details", variant: "destructive" });
    }
  };

  const totalSent = invoices.filter((i) => i.status === "sent").length;
  const totalPaid = invoices.filter((i) => i.status === "paid").length;
  const outstandingAmount = invoices
    .filter((i) => i.status === "sent")
    .reduce((s, i) => s + parseFloat(i.total_amount || "0"), 0);
  const paidAmount = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + parseFloat(i.total_amount || "0"), 0);

  return (
    <DashboardLayout role="admin" title="API Invoices">
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-blue-100 dark:bg-blue-900/30">
                  <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Outstanding</p>
                  <p className="text-xl font-bold" data-testid="text-outstanding-count">{totalSent}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-orange-100 dark:bg-orange-900/30">
                  <CircleDollarSign className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Outstanding £</p>
                  <p className="text-xl font-bold" data-testid="text-outstanding-amount">£{outstandingAmount.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-green-100 dark:bg-green-900/30">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Paid</p>
                  <p className="text-xl font-bold" data-testid="text-paid-count">{totalPaid}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-green-100 dark:bg-green-900/30">
                  <CircleDollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Paid £</p>
                  <p className="text-xl font-bold" data-testid="text-paid-amount">£{paidAmount.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Outstanding</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="void">Void</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              data-testid="button-refresh-invoices"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          <Button
            onClick={() => setRunConfirmOpen(true)}
            disabled={runNowMutation.isPending}
            data-testid="button-run-invoicing-now"
          >
            <Play className="w-4 h-4 mr-2" />
            Run Invoicing Now
          </Button>
        </div>

        {/* Invoices table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4" />
              API Client Invoices
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">Loading invoices…</div>
            ) : invoices.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No invoices found</p>
                <p className="text-sm mt-1">
                  Invoices are generated automatically every Monday morning for pay-later API clients.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-center">Jobs</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                      <TableCell className="font-mono text-sm font-semibold">
                        {inv.invoice_number}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">{inv.company_name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{inv.billing_email}</p>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                          {fmtPeriod(inv.period_start, inv.period_end)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Package className="w-3.5 h-3.5 text-muted-foreground" />
                          {inv.job_count}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        £{parseFloat(inv.total_amount).toFixed(2)}
                      </TableCell>
                      <TableCell>{statusBadge(inv.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {fmt(inv.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDetail(inv)}
                            title="View details"
                            data-testid={`button-view-invoice-${inv.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => resendMutation.mutate(inv.id)}
                            disabled={resendMutation.isPending}
                            title="Resend email"
                            data-testid={`button-resend-invoice-${inv.id}`}
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                          {inv.status === "sent" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setConfirmPaidId(inv.id)}
                              title="Mark as paid"
                              data-testid={`button-mark-paid-${inv.id}`}
                            >
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Invoice detail dialog */}
      <Dialog open={!!detailInvoice} onOpenChange={(open) => { if (!open) setDetailInvoice(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono text-lg">
              {detailInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          {detailInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Company</span>
                    <span className="font-medium">{detailInvoice.company_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span>{detailInvoice.billing_email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Period</span>
                    <span>{fmtPeriod(detailInvoice.period_start, detailInvoice.period_end)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    {statusBadge(detailInvoice.status)}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sent</span>
                    <span>{fmt(detailInvoice.sent_at)}</span>
                  </div>
                  {detailInvoice.paid_at && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paid</span>
                      <span>{fmt(detailInvoice.paid_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-3">Delivery Breakdown ({detailInvoice.items?.length ?? 0} jobs)</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Pickup</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailInvoice.items ?? []).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-xs">{item.tracking_number}</TableCell>
                        <TableCell className="text-sm">{item.scheduled_date || "—"}</TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate">{item.pickup_address || "—"}</TableCell>
                        <TableCell className="text-sm max-w-[160px] truncate">{item.delivery_address || "—"}</TableCell>
                        <TableCell className="text-sm capitalize">{item.vehicle_type || "—"}</TableCell>
                        <TableCell className="text-right font-semibold">£{parseFloat(item.amount).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={5} className="text-right font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold text-base">
                        £{parseFloat(detailInvoice.total_amount).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => resendMutation.mutate(detailInvoice.id)}
                  disabled={resendMutation.isPending}
                  data-testid="button-dialog-resend"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Resend Email
                </Button>
                {detailInvoice.status === "sent" && (
                  <Button
                    onClick={() => {
                      setDetailInvoice(null);
                      setConfirmPaidId(detailInvoice.id);
                    }}
                    data-testid="button-dialog-mark-paid"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Mark as Paid
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm mark paid */}
      <AlertDialog open={confirmPaidId !== null} onOpenChange={(open) => { if (!open) setConfirmPaidId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Invoice as Paid?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the invoice as paid and record the payment date. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmPaidId !== null && markPaidMutation.mutate(confirmPaidId)}
              data-testid="button-confirm-mark-paid"
            >
              Confirm — Mark Paid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm manual run */}
      <AlertDialog open={runConfirmOpen} onOpenChange={setRunConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run Weekly Invoicing Now?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately process all unbilled pay-later API jobs, generate invoices, and email them to clients.
              This normally runs automatically every Monday at 9am. Only run manually if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => runNowMutation.mutate()}
              disabled={runNowMutation.isPending}
              data-testid="button-confirm-run-invoicing"
            >
              {runNowMutation.isPending ? "Running…" : "Run Invoicing"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
