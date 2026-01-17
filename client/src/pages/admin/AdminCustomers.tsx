import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  MoreHorizontal,
  Eye,
  Users,
  Loader2,
  Save,
  Phone,
  Mail,
  MapPin,
  Building,
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Calendar,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { User as UserType } from '@shared/schema';

export default function AdminCustomers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<UserType | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<UserType | null>(null);
  const [payLaterEnabled, setPayLaterEnabled] = useState(false);
  const [stripeCustomerId, setStripeCustomerId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const { data: customers, isLoading } = useQuery<UserType[]>({
    queryKey: ['/api/users', { role: 'customer' }],
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UserType> }) => {
      return apiRequest('PATCH', `/api/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({ title: 'Customer updated successfully' });
      setDetailsDialogOpen(false);
    },
    onError: () => {
      toast({ title: 'Failed to update customer', variant: 'destructive' });
    },
  });

  const openDeleteDialog = (customer: UserType) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    
    setIsDeleting(true);
    try {
      await apiRequest('DELETE', `/api/users/${customerToDelete.id}`);
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({ title: 'Customer deleted successfully' });
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    } catch (error) {
      toast({ title: 'Failed to delete customer', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCustomers = customers?.filter((customer) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      customer.fullName?.toLowerCase().includes(searchLower) ||
      customer.email?.toLowerCase().includes(searchLower) ||
      customer.phone?.toLowerCase().includes(searchLower) ||
      customer.companyName?.toLowerCase().includes(searchLower)
    );
  });

  const openCustomerDetails = (customer: UserType) => {
    setSelectedCustomer(customer);
    setPayLaterEnabled(customer.payLaterEnabled || false);
    setStripeCustomerId(customer.stripeCustomerId || '');
    setDetailsDialogOpen(true);
  };

  const handleSavePayLater = async () => {
    if (!selectedCustomer) return;
    
    setIsSaving(true);
    try {
      await updateCustomerMutation.mutateAsync({
        id: selectedCustomer.id,
        data: {
          payLaterEnabled,
          stripeCustomerId: stripeCustomerId || null,
        },
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Customers</h1>
            <p className="text-muted-foreground">Manage customer accounts and Pay Later settings</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              <Users className="h-3 w-3 mr-1" />
              {customers?.length || 0} customers
            </Badge>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search customers by name, email, phone, or company..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-customers"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </div>
            ) : filteredCustomers && filteredCustomers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Pay Later</TableHead>
                    <TableHead>Bookings</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id} data-testid={`row-customer-${customer.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {getInitials(customer.fullName || 'U')}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{customer.fullName || 'Unknown'}</p>
                            {customer.companyName && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Building className="h-3 w-3" />
                                {customer.companyName}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          <p className="flex items-center gap-1 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </p>
                          {customer.phone && (
                            <p className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {customer.phone}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={customer.userType === 'business' ? 'default' : 'secondary'}>
                          {customer.userType === 'business' ? (
                            <>
                              <Building className="h-3 w-3 mr-1" />
                              Business
                            </>
                          ) : (
                            <>
                              <User className="h-3 w-3 mr-1" />
                              Individual
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {customer.payLaterEnabled ? (
                          <Badge className="bg-green-500">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <XCircle className="h-3 w-3 mr-1" />
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{customer.completedBookingsCount || 0}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(customer.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-customer-menu-${customer.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openCustomerDetails(customer)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openCustomerDetails(customer)}>
                              <CreditCard className="h-4 w-4 mr-2" />
                              Manage Pay Later
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => openDeleteDialog(customer)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Customer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? 'No customers found matching your search' : 'No customers found'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Customer Details</DialogTitle>
              <DialogDescription>
                View and manage customer account settings
              </DialogDescription>
            </DialogHeader>

            {selectedCustomer && (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                      {getInitials(selectedCustomer.fullName || 'U')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-semibold">{selectedCustomer.fullName}</h3>
                    <p className="text-sm text-muted-foreground">{selectedCustomer.email}</p>
                    {selectedCustomer.userType === 'business' && (
                      <Badge className="mt-1">
                        <Building className="h-3 w-3 mr-1" />
                        Business Account
                      </Badge>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Phone</Label>
                    <p className="font-medium">{selectedCustomer.phone || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Postcode</Label>
                    <p className="font-medium">{selectedCustomer.postcode || '-'}</p>
                  </div>
                  {selectedCustomer.companyName && (
                    <>
                      <div>
                        <Label className="text-muted-foreground">Company Name</Label>
                        <p className="font-medium">{selectedCustomer.companyName}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Registration Number</Label>
                        <p className="font-medium">{selectedCustomer.registrationNumber || '-'}</p>
                      </div>
                    </>
                  )}
                  <div>
                    <Label className="text-muted-foreground">Completed Bookings</Label>
                    <p className="font-medium">{selectedCustomer.completedBookingsCount || 0}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Joined</Label>
                    <p className="font-medium">{formatDate(selectedCustomer.createdAt)}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-primary" />
                        Pay Later (Weekly Payment)
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Allow customer to book without immediate payment
                      </p>
                    </div>
                    <Switch
                      checked={payLaterEnabled}
                      onCheckedChange={setPayLaterEnabled}
                      data-testid="switch-pay-later"
                    />
                  </div>

                  {payLaterEnabled && (
                    <div className="space-y-2 bg-muted/50 rounded-lg p-4">
                      <Label htmlFor="stripeCustomerId">Stripe Customer ID</Label>
                      <Input
                        id="stripeCustomerId"
                        value={stripeCustomerId}
                        onChange={(e) => setStripeCustomerId(e.target.value)}
                        placeholder="cus_xxxxxxxxxxxxx"
                        data-testid="input-stripe-customer-id"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter the Stripe customer ID for invoicing. Customer will receive weekly invoices.
                      </p>
                    </div>
                  )}

                  {selectedCustomer.payLaterEnabled && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Pay Later is currently active</span>
                      </div>
                      {selectedCustomer.stripeCustomerId && (
                        <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                          Stripe ID: {selectedCustomer.stripeCustomerId}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSavePayLater} disabled={isSaving} data-testid="button-save-pay-later">
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Delete Customer
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to permanently delete this customer? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>

            {customerToDelete && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p><span className="font-medium">Name:</span> {customerToDelete.fullName}</p>
                <p><span className="font-medium">Email:</span> {customerToDelete.email}</p>
                {customerToDelete.companyName && (
                  <p><span className="font-medium">Company:</span> {customerToDelete.companyName}</p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setCustomerToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDeleteCustomer} 
                disabled={isDeleting}
                data-testid="button-confirm-delete-customer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Customer
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
