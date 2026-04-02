import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { RefreshCw, Trash2, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";

interface ApiLog {
  id: number;
  created_at: string;
  api_client_id?: number;
  client_name?: string;
  endpoint: string;
  method: string;
  status_code: number;
  success: boolean;
  error_message?: string;
  booking_reference?: string;
  ip_address?: string;
}

export default function AdminApiLogs() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [filters, setFilters] = useState({ endpoint: "", status: "all", dateFrom: "", dateTo: "" });
  const [appliedFilters, setAppliedFilters] = useState({ endpoint: "", status: "all", dateFrom: "", dateTo: "" });
  const [clearConfirm, setClearConfirm] = useState(false);

  // Build query params
  const params = new URLSearchParams();
  if (appliedFilters.endpoint) params.set("endpoint", appliedFilters.endpoint);
  if (appliedFilters.status !== "all") params.set("status", appliedFilters.status);
  if (appliedFilters.dateFrom) params.set("dateFrom", appliedFilters.dateFrom);
  if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);
  params.set("limit", "200");

  const queryKey = [`/api/admin/api-logs?${params.toString()}`];

  const { data: logs = [], isLoading, refetch } = useQuery<ApiLog[]>({
    queryKey,
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/api-logs"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/api-logs"] });
      setClearConfirm(false);
      toast({ title: "Old logs cleared (logs older than 30 days)" });
    },
    onError: (err: any) => {
      toast({ title: "Clear failed", description: err?.message, variant: "destructive" });
    },
  });

  function applyFilters() {
    setAppliedFilters({ ...filters });
  }

  function resetFilters() {
    const empty = { endpoint: "", status: "all", dateFrom: "", dateTo: "" };
    setFilters(empty);
    setAppliedFilters(empty);
  }

  function statusCodeColor(code: number): string {
    if (code < 300) return "text-green-600 dark:text-green-400";
    if (code < 500) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">API Logs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Per-request audit trail for all partner API calls. Showing up to 200 most recent.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-refresh-logs">
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => setClearConfirm(true)} data-testid="button-clear-old-logs">
              <Trash2 className="h-4 w-4 mr-2" /> Clear Old Logs
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-md border bg-card p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Endpoint</Label>
              <Input
                value={filters.endpoint}
                onChange={(e) => setFilters({ ...filters, endpoint: e.target.value })}
                placeholder="/api/v1/quote"
                data-testid="input-filter-endpoint"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                <SelectTrigger data-testid="select-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failure">Failure</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                data-testid="input-filter-date-from"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                data-testid="input-filter-date-to"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={applyFilters} data-testid="button-apply-filters">Apply Filters</Button>
            <Button size="sm" variant="ghost" onClick={resetFilters} data-testid="button-reset-filters">Reset</Button>
          </div>
        </div>

        {/* Stats summary */}
        {logs.length > 0 && (
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <span>{logs.length} entries</span>
            <span className="text-green-600 dark:text-green-400">
              {logs.filter((l) => l.success).length} successful
            </span>
            <span className="text-red-600 dark:text-red-400">
              {logs.filter((l) => !l.success).length} failed
            </span>
          </div>
        )}

        {/* Logs table */}
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading logs...</p>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No log entries match your filters.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Time</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Client</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Method</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Endpoint</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Status</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Result</th>
                    <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Booking Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log) => (
                    <tr key={log.id} className="bg-background hover-elevate" data-testid={`row-api-log-${log.id}`}>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "d MMM HH:mm:ss")}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.client_name || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={log.method === "POST" ? "default" : "secondary"} className="font-mono text-xs">
                          {log.method}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs max-w-[200px] truncate" title={log.endpoint}>
                        {log.endpoint}
                      </td>
                      <td className={`px-4 py-3 font-mono text-xs font-semibold ${statusCodeColor(log.status_code)}`}>
                        {log.status_code}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {log.success ? (
                            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                          )}
                          {log.error_message && (
                            <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={log.error_message}>
                              {log.error_message}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {log.booking_reference || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Clear Confirm */}
      <AlertDialog open={clearConfirm} onOpenChange={setClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Old Logs?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete API logs older than 30 days. Recent logs will be kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-clear-logs"
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
