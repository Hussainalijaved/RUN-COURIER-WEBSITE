import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Trash2, ExternalLink, CheckCircle, Loader2, Mail, AlertTriangle, Link2, CreditCard, Zap } from "lucide-react";
import { format } from "date-fns";
import { Link, useSearch } from "wouter";

interface ApiIntegrationRequest {
  id: number;
  created_at: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  website?: string;
  business_type?: string;
  platform_used?: string;
  monthly_volume?: string;
  integration_type: string;
  notes?: string;
  status: string;
  linked_api_client_id?: number | null;
  api_access_email_sent?: boolean;
  api_access_email_sent_at?: string | null;
}

interface ApproveResult {
  success: boolean;
  apiClient: { id: number; company_name: string; api_key_last4: string; payment_mode?: string; stripe_customer_id?: string | null };
  emailSent: boolean;
  message: string;
}

const STATUS_OPTIONS = [
  { value: "new", label: "New", variant: "default" as const },
  { value: "contacted", label: "Contacted", variant: "secondary" as const },
  { value: "in_progress", label: "In Progress", variant: "secondary" as const },
  { value: "approved", label: "Approved", variant: "default" as const },
  { value: "rejected", label: "Rejected", variant: "secondary" as const },
];

function statusVariant(status: string): "default" | "secondary" {
  return status === "new" || status === "approved" ? "default" : "secondary";
}

export default function AdminApiRequests() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const search = useSearch();

  const [selected, setSelected] = useState<ApiIntegrationRequest | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(null);
  const [pendingPaymentMode, setPendingPaymentMode] = useState<"instant" | "pay_later">("instant");

  const { data: requests = [], isLoading } = useQuery<ApiIntegrationRequest[]>({
    queryKey: ["/api/admin/api-integration-requests"],
  });

  // Auto-open request from ?id= deep link (e.g. from email notification)
  useEffect(() => {
    if (!requests.length) return;
    const params = new URLSearchParams(search);
    const idParam = params.get("id");
    if (!idParam) return;
    const targetId = parseInt(idParam, 10);
    if (isNaN(targetId)) return;
    const match = requests.find((r) => r.id === targetId);
    if (match && (!selected || selected.id !== targetId)) {
      setSelected(match);
    }
  }, [requests, search]);

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/admin/api-integration-requests/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/api-integration-requests"] });
      toast({ title: "Status updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, paymentMode }: { id: number; paymentMode: "instant" | "pay_later" }) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/admin/api-integration-requests/${id}/approve`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ paymentMode }),
      });
      const json = await res.json();
      if (!res.ok) throw json;
      return json as ApproveResult;
    },
    onSuccess: (result, { id }) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/api-integration-requests"] });
      setApproveResult(result);
      setSelected((prev) => prev && prev.id === id
        ? { ...prev, status: "approved", linked_api_client_id: result.apiClient.id, api_access_email_sent: result.emailSent }
        : prev
      );
    },
    onError: (err: any) => {
      const msg = err?.message || "Approval failed. Please try again.";
      if (err?.error === "already_approved") {
        toast({ title: "Already approved", description: "This request already has an API client linked.", variant: "destructive" });
      } else {
        toast({ title: "Approval failed", description: msg, variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/api-integration-requests/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/api-integration-requests"] });
      setDeleteId(null);
      toast({ title: "Request deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">API Integration Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Businesses that have requested API access via the <Link href="/api-integration-request" className="underline">integration request form</Link>.
          </p>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading requests...</p>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No integration requests yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <Card
                key={req.id}
                className="hover-elevate cursor-pointer"
                onClick={() => { setApproveResult(null); setSelected(req); setPendingPaymentMode("instant"); }}
                data-testid={`card-api-request-${req.id}`}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{req.company_name}</span>
                        <Badge variant={statusVariant(req.status)} className="capitalize text-xs">
                          {req.status.replace("_", " ")}
                        </Badge>
                        {req.linked_api_client_id && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Link2 className="h-3 w-3" /> Client #{req.linked_api_client_id}
                          </Badge>
                        )}
                        {req.api_access_email_sent && (
                          <Badge variant="outline" className="text-xs gap-1 text-green-600 border-green-200">
                            <Mail className="h-3 w-3" /> Email sent
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {req.contact_name} · {req.email}
                        {req.phone ? ` · ${req.phone}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {req.integration_type.split(",").map((t) => (
                          <Badge key={t.trim()} variant="outline" className="text-xs">
                            {t.trim()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={req.status}
                        onValueChange={(status) => updateStatusMutation.mutate({ id: req.id, status })}
                      >
                        <SelectTrigger className="w-36 text-xs" data-testid={`select-status-${req.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteId(req.id)}
                        data-testid={`button-delete-request-${req.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Submitted {format(new Date(req.created_at), "d MMM yyyy HH:mm")}
                    {req.monthly_volume ? ` · ${req.monthly_volume} deliveries/month` : ""}
                    {req.business_type ? ` · ${req.business_type}` : ""}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setApproveResult(null); setPendingPaymentMode("instant"); } }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="mb-6">
                <SheetTitle>{selected.company_name}</SheetTitle>
                <SheetDescription>Integration request details</SheetDescription>
              </SheetHeader>
              <div className="space-y-6">

                {/* Approval success banner */}
                {approveResult && (
                  <div className={`rounded-md border p-4 text-sm space-y-1.5 ${approveResult.emailSent ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800" : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"}`}>
                    <div className="flex items-center gap-2 font-semibold">
                      {approveResult.emailSent
                        ? <CheckCircle className="h-4 w-4 text-green-600" />
                        : <AlertTriangle className="h-4 w-4 text-amber-600" />
                      }
                      {approveResult.emailSent ? "Approved & Email Sent" : "Approved — Email Failed"}
                    </div>
                    <p className="text-muted-foreground">{approveResult.message}</p>
                    {approveResult.apiClient && (
                      <p className="text-muted-foreground">
                        API Client #{approveResult.apiClient.id} created · key ending in{" "}
                        <span className="font-mono font-semibold">…{approveResult.apiClient.api_key_last4}</span>
                        {" · "}{approveResult.apiClient.payment_mode === "pay_later" ? "Pay Later" : "Instant Pay"}
                      </p>
                    )}
                    {approveResult.apiClient?.stripe_customer_id && (
                      <p className="text-muted-foreground flex items-center gap-1.5">
                        <CreditCard className="h-3.5 w-3.5 text-violet-500" />
                        Stripe customer created:{" "}
                        <span className="font-mono text-xs">{approveResult.apiClient.stripe_customer_id}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Already linked client info */}
                {!approveResult && selected.linked_api_client_id && (
                  <div className="rounded-md border bg-muted/40 p-4 text-sm space-y-2">
                    <div className="flex items-center gap-2 font-semibold">
                      <Link2 className="h-4 w-4 text-primary" />
                      Linked API Client
                    </div>
                    <p className="text-muted-foreground">
                      API Client #{selected.linked_api_client_id} was created automatically when this request was approved.
                    </p>
                    {selected.api_access_email_sent && (
                      <p className="text-muted-foreground flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-green-600" />
                        Access email sent{selected.api_access_email_sent_at
                          ? ` on ${format(new Date(selected.api_access_email_sent_at), "d MMM yyyy 'at' HH:mm")}`
                          : ""}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{selected.contact_name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Email</span>
                      <a href={`mailto:${selected.email}`} className="underline">{selected.email}</a>
                    </div>
                    {selected.phone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{selected.phone}</span></div>}
                    {selected.website && (
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-muted-foreground">Website</span>
                        <a href={selected.website} target="_blank" rel="noopener noreferrer" className="underline flex items-center gap-1 max-w-[200px] truncate">
                          {selected.website} <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Integration Details</h3>
                  <div className="space-y-2 text-sm">
                    {selected.business_type && <div className="flex justify-between"><span className="text-muted-foreground">Business Type</span><span>{selected.business_type}</span></div>}
                    {selected.platform_used && <div className="flex justify-between"><span className="text-muted-foreground">Platform</span><span>{selected.platform_used}</span></div>}
                    {selected.monthly_volume && <div className="flex justify-between"><span className="text-muted-foreground">Monthly Volume</span><span>{selected.monthly_volume}</span></div>}
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-muted-foreground shrink-0">Types Requested</span>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {selected.integration_type.split(",").map((t) => (
                          <Badge key={t.trim()} variant="outline" className="text-xs">{t.trim()}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {selected.notes && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notes</h3>
                    <p className="text-sm text-muted-foreground rounded-md bg-muted p-3">{selected.notes}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Status</h3>
                  <Select
                    value={selected.status}
                    onValueChange={(status) => {
                      updateStatusMutation.mutate({ id: selected.id, status });
                      setSelected({ ...selected, status });
                    }}
                  >
                    <SelectTrigger data-testid="select-detail-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Payment mode + approve — only show when not yet approved */}
                {!selected.linked_api_client_id && selected.status !== "rejected" && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payment Mode</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={pendingPaymentMode === "instant" ? "default" : "outline"}
                          className="flex-1 gap-1.5"
                          onClick={() => setPendingPaymentMode("instant")}
                          data-testid="button-payment-mode-instant"
                        >
                          <Zap className="h-3.5 w-3.5" /> Instant Pay
                        </Button>
                        <Button
                          size="sm"
                          variant={pendingPaymentMode === "pay_later" ? "default" : "outline"}
                          className="flex-1 gap-1.5"
                          onClick={() => setPendingPaymentMode("pay_later")}
                          data-testid="button-payment-mode-pay-later"
                        >
                          <CreditCard className="h-3.5 w-3.5" /> Pay Later
                        </Button>
                      </div>
                      {pendingPaymentMode === "pay_later" && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          A Stripe customer will be created automatically for invoicing.
                        </p>
                      )}
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => approveMutation.mutate({ id: selected.id, paymentMode: pendingPaymentMode })}
                      disabled={approveMutation.isPending}
                      data-testid="button-approve-request"
                    >
                      {approveMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Approving...</>
                      ) : (
                        <><CheckCircle className="h-4 w-4 mr-2" /> Approve & Send API Access</>
                      )}
                    </Button>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Submitted {format(new Date(selected.created_at), "d MMM yyyy 'at' HH:mm")}
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Request?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the integration request. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-request"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
