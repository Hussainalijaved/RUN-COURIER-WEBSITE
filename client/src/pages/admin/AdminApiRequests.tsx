import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
import { Trash2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";

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

  const [selected, setSelected] = useState<ApiIntegrationRequest | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: requests = [], isLoading } = useQuery<ApiIntegrationRequest[]>({
    queryKey: ["/api/admin/api-integration-requests"],
  });

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
                onClick={() => setSelected(req)}
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
      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="mb-6">
                <SheetTitle>{selected.company_name}</SheetTitle>
                <SheetDescription>Integration request details</SheetDescription>
              </SheetHeader>
              <div className="space-y-6">
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
