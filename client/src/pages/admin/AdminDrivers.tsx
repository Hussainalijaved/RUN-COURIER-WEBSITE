import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  FileText,
  CheckCircle,
  XCircle,
  Star,
  Truck,
  Users,
  UserCheck,
  Loader2,
  Edit3,
  Save,
  Phone,
  Mail,
  MapPin,
  Car,
  Calendar,
  ExternalLink,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { Driver, User, Document, DocumentStatus } from '@shared/schema';

interface SupabaseDriver {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  driverCode: string | null;
  createdAt: string;
}

export default function AdminDrivers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [documentsDialogOpen, setDocumentsDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editVehicleType, setEditVehicleType] = useState('');
  const [editVehicleReg, setEditVehicleReg] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const { toast } = useToast();

  const { data: drivers, isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
  });

  const { data: supabaseDrivers } = useQuery<SupabaseDriver[]>({
    queryKey: ['/api/supabase-drivers'],
  });

  const { data: documents } = useQuery<Document[]>({
    queryKey: ['/api/documents'],
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users', { role: 'driver' }],
  });

  const verifyDriverMutation = useMutation({
    mutationFn: async ({ id, isVerified }: { id: string; isVerified: boolean }) => {
      return apiRequest('PATCH', `/api/drivers/${id}/verify`, { isVerified });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drivers'] });
      toast({ title: 'Driver status updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update driver', variant: 'destructive' });
    },
  });

  const updateDriverMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Driver> }) => {
      return apiRequest('PATCH', `/api/drivers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drivers'] });
      toast({ title: 'Driver updated successfully' });
      setEditMode(false);
    },
    onError: () => {
      toast({ title: 'Failed to update driver', variant: 'destructive' });
    },
  });

  const reviewDocumentMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: DocumentStatus; notes?: string }) => {
      return apiRequest('PATCH', `/api/documents/${id}/review`, { 
        status, 
        reviewedBy: 'admin',
        reviewNotes: notes 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      toast({ title: 'Document reviewed' });
      setReviewNotes('');
    },
    onError: () => {
      toast({ title: 'Failed to review document', variant: 'destructive' });
    },
  });

  const getDriverUser = (userId: string) => {
    return users?.find((u) => u.id === userId);
  };

  const getSupabaseDriver = (driverId: string) => {
    return supabaseDrivers?.find((d) => d.id === driverId);
  };

  const getDriverDocuments = (driverId: string) => {
    return documents?.filter((d) => d.driverId === driverId) || [];
  };

  const getDriverInfo = (driver: Driver) => {
    const supabase = getSupabaseDriver(driver.id) || getSupabaseDriver(driver.userId);
    const user = getDriverUser(driver.userId);
    return {
      name: supabase?.fullName || driver.fullName || user?.fullName || 'Unknown',
      email: supabase?.email || driver.email || user?.email || '',
      phone: supabase?.phone || driver.phone || user?.phone || '',
      driverCode: supabase?.driverCode || driver.driverCode || null,
    };
  };

  const openProfileDialog = (driver: Driver) => {
    const info = getDriverInfo(driver);
    setSelectedDriver(driver);
    setEditVehicleType(driver.vehicleType);
    setEditVehicleReg(driver.vehicleRegistration || '');
    setEditPhone(info.phone || '');
    setEditMode(false);
    setProfileDialogOpen(true);
  };

  const openDocumentsDialog = (driver: Driver) => {
    setSelectedDriver(driver);
    setDocumentsDialogOpen(true);
  };

  const handleSaveProfile = () => {
    if (!selectedDriver) return;
    updateDriverMutation.mutate({
      id: selectedDriver.id,
      data: {
        vehicleType: editVehicleType as Driver['vehicleType'],
        vehicleRegistration: editVehicleReg,
        phone: editPhone,
      },
    });
  };

  const filteredDrivers = drivers?.filter((driver) => {
    const info = getDriverInfo(driver);
    const searchLower = searchQuery.toLowerCase();
    return (
      info.driverCode?.toLowerCase().includes(searchLower) ||
      driver.vehicleRegistration?.toLowerCase().includes(searchLower) ||
      info.name?.toLowerCase().includes(searchLower) ||
      info.email?.toLowerCase().includes(searchLower)
    );
  }) || [];

  const totalDrivers = drivers?.length || 0;
  const verifiedDrivers = drivers?.filter((d) => d.isVerified).length || 0;
  const availableDrivers = drivers?.filter((d) => d.isAvailable).length || 0;
  const pendingDrivers = drivers?.filter((d) => !d.isVerified).length || 0;

  const formatDate = (date: Date | string | null) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getDocStatusBadge = (status: DocumentStatus) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-500 text-white">Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500 text-white">Rejected</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  const getDocTypeName = (type: string) => {
    const names: Record<string, string> = {
      id_passport: 'ID / Passport',
      driving_licence: 'Driving Licence',
      right_to_work: 'Right to Work',
      vehicle_photo: 'Vehicle Photo',
      insurance: 'Insurance',
      goods_in_transit: 'Goods in Transit',
      hire_reward: 'Hire & Reward',
    };
    return names[type] || type;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Drivers Management</h1>
          <p className="text-muted-foreground">Manage and verify driver accounts</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card data-testid="stat-total-drivers">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  {driversLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold">{totalDrivers}</div>
                  )}
                  <p className="text-sm text-muted-foreground">Total Drivers</p>
                </div>
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-verified-drivers">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  {driversLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold text-green-500">{verifiedDrivers}</div>
                  )}
                  <p className="text-sm text-muted-foreground">Verified</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-available-drivers">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  {driversLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold text-blue-500">{availableDrivers}</div>
                  )}
                  <p className="text-sm text-muted-foreground">Available Now</p>
                </div>
                <Truck className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-pending-drivers">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  {driversLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <div className="text-2xl font-bold text-yellow-500">{pendingDrivers}</div>
                  )}
                  <p className="text-sm text-muted-foreground">Pending Verification</p>
                </div>
                <UserCheck className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by code, name, email, or registration..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-drivers"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {driversLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredDrivers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Registration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Jobs</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDrivers.map((driver) => {
                    const info = getDriverInfo(driver);
                    const initials = info.name?.split(' ').map((n) => n[0]).join('') || 'D';
                    const docCount = getDriverDocuments(driver.id).length;
                    const pendingDocs = getDriverDocuments(driver.id).filter(d => d.status === 'pending').length;
                    return (
                      <TableRow key={driver.id} data-testid={`row-driver-${driver.id}`}>
                        <TableCell>
                          {info.driverCode ? (
                            <Badge className="bg-blue-600 text-white font-mono text-sm px-2">{info.driverCode}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback className="bg-primary text-primary-foreground">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{info.name}</div>
                              <div className="text-xs text-muted-foreground">{info.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-muted-foreground" />
                            <span className="capitalize">{driver.vehicleType?.replace('_', ' ')}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{driver.vehicleRegistration || '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {driver.isVerified ? (
                              <Badge className="bg-green-500 text-white w-fit" data-testid={`badge-verified-${driver.id}`}>Verified</Badge>
                            ) : (
                              <Badge variant="secondary" className="w-fit" data-testid={`badge-unverified-${driver.id}`}>Unverified</Badge>
                            )}
                            {driver.isAvailable && (
                              <Badge className="bg-blue-500 text-white w-fit" data-testid={`badge-available-${driver.id}`}>Online</Badge>
                            )}
                            {pendingDocs > 0 && (
                              <Badge variant="outline" className="text-yellow-600 border-yellow-600 w-fit">
                                {pendingDocs} doc pending
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {driver.rating && parseFloat(driver.rating) > 0 ? (
                            <div className="flex items-center gap-1">
                              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              <span>{parseFloat(driver.rating).toFixed(1)}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{driver.totalJobs || 0}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-driver-actions-${driver.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => openProfileDialog(driver)}
                                data-testid={`menu-view-${driver.id}`}
                              >
                                <Eye className="mr-2 h-4 w-4" />
                                View Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => openDocumentsDialog(driver)}
                                data-testid={`menu-documents-${driver.id}`}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                View Documents
                                {pendingDocs > 0 && (
                                  <Badge variant="secondary" className="ml-2 text-xs">{pendingDocs}</Badge>
                                )}
                              </DropdownMenuItem>
                              {!driver.isVerified ? (
                                <DropdownMenuItem
                                  className="text-green-600"
                                  onClick={() => verifyDriverMutation.mutate({ id: driver.id, isVerified: true })}
                                  disabled={verifyDriverMutation.isPending}
                                  data-testid={`menu-verify-${driver.id}`}
                                >
                                  {verifyDriverMutation.isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                  )}
                                  Approve Driver
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => verifyDriverMutation.mutate({ id: driver.id, isVerified: false })}
                                  disabled={verifyDriverMutation.isPending}
                                  data-testid={`menu-revoke-${driver.id}`}
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Revoke Verification
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
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No drivers found</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Profile Dialog */}
        <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                {selectedDriver && getDriverInfo(selectedDriver).driverCode && (
                  <Badge className="bg-blue-600 text-white font-mono text-lg px-3 py-1">
                    {getDriverInfo(selectedDriver).driverCode}
                  </Badge>
                )}
                Driver Profile
              </DialogTitle>
              <DialogDescription>
                {selectedDriver && getDriverInfo(selectedDriver).name}
              </DialogDescription>
            </DialogHeader>
            {selectedDriver && (
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                      {getDriverInfo(selectedDriver).name?.split(' ').map((n) => n[0]).join('') || 'D'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold">{getDriverInfo(selectedDriver).name}</h3>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedDriver.isVerified ? (
                        <Badge className="bg-green-500 text-white">Verified</Badge>
                      ) : (
                        <Badge variant="secondary">Unverified</Badge>
                      )}
                      {selectedDriver.isAvailable && (
                        <Badge className="bg-blue-500 text-white">Online</Badge>
                      )}
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setEditMode(!editMode)}
                  >
                    <Edit3 className="h-4 w-4 mr-2" />
                    {editMode ? 'Cancel' : 'Edit'}
                  </Button>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-semibold">Contact Information</h4>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{getDriverInfo(selectedDriver).email || '—'}</span>
                      </div>
                      {editMode ? (
                        <div className="space-y-2">
                          <Label>Phone</Label>
                          <Input
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            placeholder="Phone number"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{getDriverInfo(selectedDriver).phone || '—'}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedDriver.address || selectedDriver.postcode || '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-semibold">Vehicle Information</h4>
                    <div className="space-y-3">
                      {editMode ? (
                        <>
                          <div className="space-y-2">
                            <Label>Vehicle Type</Label>
                            <Select value={editVehicleType} onValueChange={setEditVehicleType}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="motorbike">Motorbike</SelectItem>
                                <SelectItem value="car">Car</SelectItem>
                                <SelectItem value="small_van">Small Van</SelectItem>
                                <SelectItem value="medium_van">Medium Van</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Registration</Label>
                            <Input
                              value={editVehicleReg}
                              onChange={(e) => setEditVehicleReg(e.target.value.toUpperCase())}
                              placeholder="AB12 XYZ"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <Car className="h-4 w-4 text-muted-foreground" />
                            <span className="capitalize">{selectedDriver.vehicleType?.replace('_', ' ')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-muted-foreground" />
                            <span className="font-mono">{selectedDriver.vehicleRegistration || '—'}</span>
                          </div>
                          {selectedDriver.vehicleMake && (
                            <div className="text-sm text-muted-foreground">
                              {selectedDriver.vehicleMake} {selectedDriver.vehicleModel} ({selectedDriver.vehicleColor})
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold">{selectedDriver.totalJobs || 0}</div>
                    <p className="text-sm text-muted-foreground">Total Jobs</p>
                  </div>
                  <div>
                    <div className="text-2xl font-bold flex items-center justify-center gap-1">
                      <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                      {selectedDriver.rating ? parseFloat(selectedDriver.rating).toFixed(1) : '—'}
                    </div>
                    <p className="text-sm text-muted-foreground">Rating</p>
                  </div>
                  <div>
                    <div className="text-2xl font-bold">
                      {formatDate(selectedDriver.createdAt)}
                    </div>
                    <p className="text-sm text-muted-foreground">Member Since</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              {editMode ? (
                <>
                  <Button variant="outline" onClick={() => setEditMode(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveProfile} disabled={updateDriverMutation.isPending}>
                    {updateDriverMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                </>
              ) : (
                <div className="flex gap-2">
                  {!selectedDriver?.isVerified ? (
                    <Button 
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        if (selectedDriver) {
                          verifyDriverMutation.mutate({ id: selectedDriver.id, isVerified: true });
                          setProfileDialogOpen(false);
                        }
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve Driver
                    </Button>
                  ) : (
                    <Button 
                      variant="destructive"
                      onClick={() => {
                        if (selectedDriver) {
                          verifyDriverMutation.mutate({ id: selectedDriver.id, isVerified: false });
                          setProfileDialogOpen(false);
                        }
                      }}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Revoke Verification
                    </Button>
                  )}
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Documents Dialog */}
        <Dialog open={documentsDialogOpen} onOpenChange={setDocumentsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <FileText className="h-5 w-5" />
                Driver Documents
              </DialogTitle>
              <DialogDescription>
                {selectedDriver && (
                  <>
                    {getDriverInfo(selectedDriver).driverCode && (
                      <Badge className="bg-blue-600 text-white font-mono mr-2">
                        {getDriverInfo(selectedDriver).driverCode}
                      </Badge>
                    )}
                    {getDriverInfo(selectedDriver).name}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            {selectedDriver && (
              <div className="space-y-4">
                {getDriverDocuments(selectedDriver.id).length > 0 ? (
                  getDriverDocuments(selectedDriver.id).map((doc) => (
                    <Card key={doc.id} className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold">{getDocTypeName(doc.type)}</h4>
                            {getDocStatusBadge(doc.status)}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{doc.fileName}</p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Uploaded: {formatDate(doc.uploadedAt)}
                            </div>
                            {doc.expiryDate && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Expires: {formatDate(doc.expiryDate)}
                              </div>
                            )}
                          </div>
                          {doc.reviewNotes && (
                            <div className="mt-2 p-2 bg-muted rounded text-sm">
                              <strong>Review Notes:</strong> {doc.reviewNotes}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(doc.fileUrl, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          {doc.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => reviewDocumentMutation.mutate({ 
                                  id: doc.id, 
                                  status: 'approved',
                                  notes: reviewNotes 
                                })}
                                disabled={reviewDocumentMutation.isPending}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => reviewDocumentMutation.mutate({ 
                                  id: doc.id, 
                                  status: 'rejected',
                                  notes: reviewNotes 
                                })}
                                disabled={reviewDocumentMutation.isPending}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-2">No documents uploaded yet</p>
                    <p className="text-sm text-muted-foreground">
                      Documents will appear here when the driver uploads them
                    </p>
                  </div>
                )}

                {getDriverDocuments(selectedDriver.id).some(d => d.status === 'pending') && (
                  <div className="space-y-2">
                    <Label>Review Notes (optional)</Label>
                    <Textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Add notes for approval/rejection..."
                      rows={2}
                    />
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
