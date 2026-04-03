import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Plus,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Eye,
  ShieldCheck,
  ShieldOff,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

interface ApiClient {
  id: number;
  created_at: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  api_key_last4: string;
  is_active: boolean;
  allow_quote: boolean;
  allow_booking: boolean;
  allow_tracking: boolean;
  allow_cancel: boolean;
  allow_webhooks: boolean;
  notes?: string;
  last_used_at?: string;
  request_count: number;
}

interface CreateClientForm {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  allowQuote: boolean;
  allowBooking: boolean;
  allowTracking: boolean;
  allowCancel: boolean;
  allowWebhooks: boolean;
  notes: string;
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: label ? `${label} copied` : "Copied to clipboard" });
    });
  }

  return (
    <Button size="icon" variant="ghost" onClick={handleCopy} data-testid="button-copy-api-key">
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
  );
}

function PermissionBadge({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <Badge variant={allowed ? "default" : "secondary"} className="text-xs">
      {label}
    </Badge>
  );
}

export default function AdminApiClients() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyDialog, setNewKeyDialog] = useState<{ open: boolean; key: string; company: string }>({
    open: false,
    key: "",
    company: "",
  });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [confirmRegenId, setConfirmRegenId] = useState<number | null>(null);
  const [editClient, setEditClient] = useState<ApiClient | null>(null);

  const [form, setForm] = useState<CreateClientForm>({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    allowQuote: true,
    allowBooking: false,
    allowTracking: true,
    allowCancel: false,
    allowWebhooks: false,
    notes: "",
  });

  const { data: clients = [], isLoading } = useQuery<ApiClient[]>({
    queryKey: ["/api/admin/api-clients"],
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/admin/api-clients", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || json?.error || `Error ${res.status}`);
      console.log("[ApiClients] create response:", JSON.stringify(json));
      return json;
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/api-clients"] });
      setCreateOpen(false);
      setForm({ companyName: "", contactName: "", email: "", phone: "", allowQuote: true, allowBooking: false, allowTracking: true, allowCancel: false, allowWebhooks: false, notes: "" });
      const plainKey = data?.apiKey ?? "";
      console.log("[ApiClients] setting key in dialog:", plainKey);
      setNewKeyDialog({ open: true, key: plainKey, company: data?.company_name ?? "" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create client", description: err?.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/admin/api-clients/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/api-clients"] });
      setEditClient(null);
      toast({ title: "Client updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/api-clients/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/api-clients"] });
      setDeleteId(null);
      toast({ title: "Client deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err?.message, variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: async (id: number) => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(`/api/admin/api-clients/${id}/regenerate-key`, {
        method: "POST",
        headers: authHeaders,
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message || json?.error || `Error ${res.status}`);
      console.log("[ApiClients] regenerate response:", JSON.stringify(json));
      return { ...json, _clientId: id };
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/api-clients"] });
      setConfirmRegenId(null);
      const client = clients.find((c) => c.id === data._clientId);
      const plainKey = data?.apiKey ?? "";
      console.log("[ApiClients] regenerated key in dialog:", plainKey);
      setNewKeyDialog({ open: true, key: plainKey, company: client?.company_name ?? "" });
    },
    onError: (err: any) => {
      toast({ title: "Regeneration failed", description: err?.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/admin/api-clients/${id}`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/api-clients"] });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">API Clients</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage approved business API integrations and their access permissions.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} data-testid="button-create-api-client">
            <Plus className="h-4 w-4 mr-2" /> New API Client
          </Button>
        </div>

        {/* Client List */}
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading clients...</p>
        ) : clients.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No API clients yet. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {clients.map((client) => (
              <Card key={client.id} data-testid={`card-api-client-${client.id}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{client.company_name}</span>
                        <Badge variant={client.is_active ? "default" : "secondary"}>
                          {client.is_active ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {client.contact_name} · {client.email}
                        {client.phone ? ` · ${client.phone}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <PermissionBadge label="Quote" allowed={client.allow_quote} />
                        <PermissionBadge label="Booking" allowed={client.allow_booking} />
                        <PermissionBadge label="Tracking" allowed={client.allow_tracking} />
                        <PermissionBadge label="Cancel" allowed={client.allow_cancel} />
                        <PermissionBadge label="Webhooks" allowed={client.allow_webhooks} />
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>Key: <code className="font-mono">••••{client.api_key_last4}</code></span>
                        <span>{client.request_count.toLocaleString()} requests</span>
                        {client.last_used_at && (
                          <span>Last used: {format(new Date(client.last_used_at), "d MMM yyyy HH:mm")}</span>
                        )}
                        <span>Created: {format(new Date(client.created_at), "d MMM yyyy")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={client.is_active}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: client.id, isActive: checked })}
                        data-testid={`switch-client-active-${client.id}`}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" data-testid={`button-client-menu-${client.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditClient(client)}>
                            <Eye className="h-4 w-4 mr-2" /> Edit / View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setConfirmRegenId(client.id)}>
                            <RefreshCw className="h-4 w-4 mr-2" /> Regenerate Key
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteId(client.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create API Client</DialogTitle>
            <DialogDescription>
              A secure API key will be generated and shown once after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Company Name *</Label>
                <Input
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  placeholder="Acme Ltd"
                  data-testid="input-new-client-company"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Name *</Label>
                <Input
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  placeholder="Jane Smith"
                  data-testid="input-new-client-contact"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="jane@acme.co.uk"
                  data-testid="input-new-client-email"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+44 20..."
                  data-testid="input-new-client-phone"
                />
              </div>
            </div>
            <div className="space-y-3">
              <Label>Permissions</Label>
              {[
                { key: "allowQuote", label: "Quote API" },
                { key: "allowBooking", label: "Booking API" },
                { key: "allowTracking", label: "Tracking API" },
                { key: "allowCancel", label: "Cancel API" },
                { key: "allowWebhooks", label: "Webhooks" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <Label className="font-normal">{label}</Label>
                  <Switch
                    checked={(form as any)[key]}
                    onCheckedChange={(v) => setForm({ ...form, [key]: v })}
                    data-testid={`switch-perm-${key}`}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Internal Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notes visible to admins only..."
                rows={2}
                data-testid="textarea-new-client-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate({
                companyName: form.companyName,
                contactName: form.contactName,
                email: form.email,
                phone: form.phone || undefined,
                allowQuote: form.allowQuote,
                allowBooking: form.allowBooking,
                allowTracking: form.allowTracking,
                allowCancel: form.allowCancel,
                allowWebhooks: form.allowWebhooks,
                notes: form.notes || undefined,
              })}
              disabled={createMutation.isPending || !form.companyName || !form.contactName || !form.email}
              data-testid="button-confirm-create-client"
            >
              {createMutation.isPending ? "Creating..." : "Create Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Key Dialog */}
      <Dialog open={newKeyDialog.open} onOpenChange={(o) => setNewKeyDialog({ ...newKeyDialog, open: o })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>API Key Generated</DialogTitle>
            <DialogDescription>
              This key will only be shown <strong>once</strong>. Copy and store it securely before closing.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted p-4">
            <div className="flex items-start justify-between gap-2">
              {newKeyDialog.key ? (
                <code className="text-xs font-mono break-all select-all flex-1" data-testid="text-api-key-value">
                  {newKeyDialog.key}
                </code>
              ) : (
                <span className="text-xs text-destructive italic flex-1">
                  Key not received — please try regenerating.
                </span>
              )}
              <CopyButton value={newKeyDialog.key} label="API key" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Client: <strong>{newKeyDialog.company}</strong>. Never share this key publicly.
          </p>
          <DialogFooter>
            <Button onClick={() => setNewKeyDialog({ ...newKeyDialog, open: false })} data-testid="button-close-key-dialog">
              I've saved the key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editClient && (
        <Dialog open={!!editClient} onOpenChange={(o) => { if (!o) setEditClient(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit {editClient.company_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Company Name</Label>
                  <Input
                    value={editClient.company_name}
                    onChange={(e) => setEditClient({ ...editClient, company_name: e.target.value })}
                    data-testid="input-edit-company"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact Name</Label>
                  <Input
                    value={editClient.contact_name}
                    onChange={(e) => setEditClient({ ...editClient, contact_name: e.target.value })}
                    data-testid="input-edit-contact"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    value={editClient.email}
                    onChange={(e) => setEditClient({ ...editClient, email: e.target.value })}
                    data-testid="input-edit-email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input
                    value={editClient.phone || ""}
                    onChange={(e) => setEditClient({ ...editClient, phone: e.target.value })}
                    data-testid="input-edit-phone"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <Label>Permissions</Label>
                {[
                  { key: "allow_quote", label: "Quote API" },
                  { key: "allow_booking", label: "Booking API" },
                  { key: "allow_tracking", label: "Tracking API" },
                  { key: "allow_cancel", label: "Cancel API" },
                  { key: "allow_webhooks", label: "Webhooks" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <Label className="font-normal">{label}</Label>
                    <Switch
                      checked={(editClient as any)[key]}
                      onCheckedChange={(v) => setEditClient({ ...editClient, [key]: v })}
                      data-testid={`switch-edit-perm-${key}`}
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea
                  value={editClient.notes || ""}
                  onChange={(e) => setEditClient({ ...editClient, notes: e.target.value })}
                  rows={2}
                  data-testid="textarea-edit-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditClient(null)}>Cancel</Button>
              <Button
                onClick={() => updateMutation.mutate({
                  id: editClient.id,
                  companyName: editClient.company_name,
                  contactName: editClient.contact_name,
                  email: editClient.email,
                  phone: editClient.phone || null,
                  allowQuote: editClient.allow_quote,
                  allowBooking: editClient.allow_booking,
                  allowTracking: editClient.allow_tracking,
                  allowCancel: editClient.allow_cancel,
                  allowWebhooks: editClient.allow_webhooks,
                  notes: editClient.notes || null,
                })}
                disabled={updateMutation.isPending}
                data-testid="button-save-edit-client"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Regenerate Key Confirm */}
      <AlertDialog open={confirmRegenId !== null} onOpenChange={(o) => { if (!o) setConfirmRegenId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              The existing key will be invalidated immediately. Any system using it will stop working. A new key will be shown once — save it securely.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRegenId !== null && regenerateMutation.mutate(confirmRegenId)}
              disabled={regenerateMutation.isPending}
              data-testid="button-confirm-regen-key"
            >
              {regenerateMutation.isPending ? "Regenerating..." : "Regenerate Key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Client?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently revoke their API access. Any system using this key will immediately stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-client"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
