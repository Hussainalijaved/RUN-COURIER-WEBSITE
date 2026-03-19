import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  Plus,
  Search,
  Phone,
  Mail,
  Building2,
  StickyNote,
  Pencil,
  Trash2,
  User,
} from 'lucide-react';

interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
  company_name: string | null;
  notes: string | null;
  created_at: string;
}

interface ContactForm {
  name: string;
  phone: string;
  email: string;
  company_name: string;
  notes: string;
}

const emptyForm: ContactForm = {
  name: '',
  phone: '',
  email: '',
  company_name: '',
  notes: '',
};

export default function AdminContacts() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ['/api/contacts'],
  });

  const createMutation = useMutation({
    mutationFn: (data: ContactForm) => apiRequest('POST', '/api/contacts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      setShowDialog(false);
      setForm(emptyForm);
      toast({ title: 'Contact added', description: 'The contact has been saved.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to save contact.', variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ContactForm }) =>
      apiRequest('PUT', `/api/contacts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      setShowDialog(false);
      setEditContact(null);
      setForm(emptyForm);
      toast({ title: 'Contact updated', description: 'Changes have been saved.' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to update contact.', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      setDeleteId(null);
      toast({ title: 'Contact deleted' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to delete contact.', variant: 'destructive' }),
  });

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.company_name?.toLowerCase().includes(q) ?? false)
    );
  });

  function openNew() {
    setEditContact(null);
    setForm(emptyForm);
    setShowDialog(true);
  }

  function openEdit(c: Contact) {
    setEditContact(c);
    setForm({
      name: c.name,
      phone: c.phone,
      email: c.email,
      company_name: c.company_name || '',
      notes: c.notes || '',
    });
    setShowDialog(true);
  }

  function handleSubmit() {
    if (!form.name.trim() || !form.phone.trim() || !form.email.trim()) {
      toast({ title: 'Required fields', description: 'Name, phone and email are required.', variant: 'destructive' });
      return;
    }
    if (editContact) {
      updateMutation.mutate({ id: editContact.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Contacts</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Save names, phone numbers and emails for quick reference
            </p>
          </div>
          <Button data-testid="button-add-contact" onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="input-search-contacts"
            placeholder="Search by name, email, phone or company…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-2">
                  <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
                  <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <User className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="font-medium">
                {search ? 'No contacts match your search' : 'No contacts yet'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? 'Try a different search term.' : 'Click "Add Contact" to save your first contact.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <Card key={c.id} data-testid={`card-contact-${c.id}`} className="flex flex-col">
                <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base truncate" data-testid={`text-contact-name-${c.id}`}>
                      {c.name}
                    </CardTitle>
                    {c.company_name && (
                      <div className="flex items-center gap-1 mt-0.5 text-sm text-muted-foreground">
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span className="truncate">{c.company_name}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      data-testid={`button-edit-contact-${c.id}`}
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      data-testid={`button-delete-contact-${c.id}`}
                      onClick={() => setDeleteId(c.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5 flex-1">
                  <a
                    href={`tel:${c.phone}`}
                    className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                    data-testid={`link-phone-${c.id}`}
                  >
                    <Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <span>{c.phone}</span>
                  </a>
                  <a
                    href={`mailto:${c.email}`}
                    className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                    data-testid={`link-email-${c.id}`}
                  >
                    <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{c.email}</span>
                  </a>
                  {c.notes && (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground pt-1">
                      <StickyNote className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{c.notes}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && contacts.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { setShowDialog(false); setEditContact(null); setForm(emptyForm); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editContact ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Full Name <span className="text-destructive">*</span></Label>
              <Input
                id="c-name"
                data-testid="input-contact-name"
                placeholder="e.g. John Smith"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone Number <span className="text-destructive">*</span></Label>
              <Input
                id="c-phone"
                data-testid="input-contact-phone"
                type="tel"
                placeholder="e.g. 07700 900000"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email Address <span className="text-destructive">*</span></Label>
              <Input
                id="c-email"
                data-testid="input-contact-email"
                type="email"
                placeholder="e.g. john@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-company">Company Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                id="c-company"
                data-testid="input-contact-company"
                placeholder="e.g. Acme Ltd"
                value={form.company_name}
                onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-notes">Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="c-notes"
                data-testid="input-contact-notes"
                placeholder="Any additional info…"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); setEditContact(null); setForm(emptyForm); }}>
              Cancel
            </Button>
            <Button data-testid="button-save-contact" onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Saving…' : editContact ? 'Save Changes' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contact? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete-contact"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
