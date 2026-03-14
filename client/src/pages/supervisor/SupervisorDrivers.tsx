import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Search, Eye, FileText, CheckCircle, Star, Truck, Users, UserCheck,
  Phone, Mail, MapPin, Car, Clock, Shield, Globe, ExternalLink,
} from 'lucide-react';
import { normalizeDocUrl } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { useRealtimeDrivers } from '@/hooks/useRealtimeDrivers';
import type { Driver, Document, VehicleType } from '@shared/schema';

interface SupabaseDriver {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  driverCode: string | null;
  vehicleType?: string;
  isAvailable?: boolean;
  isVerified?: boolean;
  createdAt: string;
}

export default function SupervisorDrivers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'available' | 'pending'>('all');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);

  useRealtimeDrivers();

  const { data: localDrivers, isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ['/api/drivers', { includeInactive: true }],
  });

  const { data: supabaseDrivers } = useQuery<SupabaseDriver[]>({
    queryKey: ['/api/supabase-drivers'],
    retry: false,
  });

  const drivers: Driver[] = useMemo(() => {
    if (supabaseDrivers && supabaseDrivers.length > 0) {
      return supabaseDrivers.map(sd => {
        const ld = localDrivers?.find(d => d.id === sd.id);
        return {
          id: sd.id,
          userId: sd.id,
          driverCode: sd.driverCode,
          fullName: sd.fullName || ld?.fullName || null,
          email: sd.email,
          phone: sd.phone || ld?.phone || null,
          postcode: ld?.postcode || null,
          address: ld?.address || null,
          nationality: ld?.nationality || null,
          isBritish: ld?.isBritish || null,
          nationalInsuranceNumber: ld?.nationalInsuranceNumber || null,
          rightToWorkShareCode: ld?.rightToWorkShareCode || null,
          dbsChecked: ld?.dbsChecked || null,
          dbsCertificateUrl: ld?.dbsCertificateUrl || null,
          dbsCheckDate: ld?.dbsCheckDate || null,
          vehicleType: sd.vehicleType as VehicleType || ld?.vehicleType || 'car',
          vehicleRegistration: ld?.vehicleRegistration || null,
          vehicleMake: ld?.vehicleMake || null,
          vehicleModel: ld?.vehicleModel || null,
          vehicleColor: ld?.vehicleColor || null,
          isAvailable: sd.isAvailable ?? ld?.isAvailable ?? false,
          isVerified: sd.isVerified ?? ld?.isVerified ?? false,
          currentLatitude: ld?.currentLatitude || null,
          currentLongitude: ld?.currentLongitude || null,
          lastLocationUpdate: ld?.lastLocationUpdate || null,
          rating: ld?.rating || '5.00',
          totalJobs: ld?.totalJobs || 0,
          profilePictureUrl: ld?.profilePictureUrl || null,
          isActive: ld?.isActive ?? true,
          deactivatedAt: ld?.deactivatedAt || null,
          createdAt: sd.createdAt ? new Date(sd.createdAt) : ld?.createdAt || new Date(),
        } as Driver;
      });
    }
    return localDrivers || [];
  }, [supabaseDrivers, localDrivers]);

  const { data: allJobs } = useQuery<any[]>({ queryKey: ['/api/jobs'] });

  const jobCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (allJobs) {
      for (const job of allJobs) {
        const did = job.driverId || job.driver_id;
        if (did) counts[did] = (counts[did] || 0) + 1;
      }
    }
    return counts;
  }, [allJobs]);

  const { data: documents } = useQuery<Document[]>({ queryKey: ['/api/documents'] });

  const { data: selectedDriverDocs, isLoading: docsLoading } = useQuery<Document[]>({
    queryKey: ['/api/documents', { driverId: selectedDriver?.id }],
    queryFn: async () => {
      if (!selectedDriver?.id) return [];
      const res = await fetch(`/api/documents?driverId=${selectedDriver.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedDriver?.id,
  });

  const getSbDriver = (id: string) => supabaseDrivers?.find(d => d.id === id);

  const getInfo = (driver: Driver) => {
    const sb = getSbDriver(driver.id) || getSbDriver(driver.userId);
    return {
      name: sb?.fullName || driver.fullName || 'Unknown',
      email: sb?.email || driver.email || '',
      phone: sb?.phone || driver.phone || '',
      driverCode: sb?.driverCode || driver.driverCode || null,
    };
  };

  const normalizeType = (type: string) => {
    const map: Record<string, string> = {
      driving_licence_front: 'driving_license', driving_licence_back: 'driving_license',
      drivingLicenceFront: 'driving_license', drivingLicenceBack: 'driving_license',
      driving_license: 'driving_license',
      hire_and_reward: 'hire_and_reward_insurance', hireAndReward: 'hire_and_reward_insurance',
      hire_and_reward_insurance: 'hire_and_reward_insurance',
      goods_in_transit: 'goods_in_transit_insurance', goodsInTransitInsurance: 'goods_in_transit_insurance',
      goods_in_transit_insurance: 'goods_in_transit_insurance',
      proof_of_identity: 'proof_of_identity', proof_of_address: 'proof_of_address',
      vehicle_photo_front: 'vehicle_photo_front', vehicle_photo_back: 'vehicle_photo_back',
      vehicle_photo_left: 'vehicle_photo_left', vehicle_photo_right: 'vehicle_photo_right',
      vehicle_photo_load_space: 'vehicle_photo_load_space',
    };
    return map[type] || type;
  };

  const getDriverDocs = (driverId: string) => {
    if (selectedDriver?.id === driverId && selectedDriverDocs?.length) return selectedDriverDocs;
    const existing = documents?.filter(d => d.driverId === driverId) || [];
    const sb = supabaseDrivers?.find(d => d.id === driverId) as any;
    const fallback: any[] = [];
    if (sb) {
      const colMap = [
        { col: 'driving_licence_front_url', type: 'drivingLicenceFront', label: 'Driving Licence (Front)' },
        { col: 'driving_licence_back_url', type: 'drivingLicenceBack', label: 'Driving Licence (Back)' },
        { col: 'goods_in_transit_insurance_url', type: 'goodsInTransitInsurance', label: 'Goods in Transit Insurance' },
        { col: 'hire_reward_insurance_url', type: 'hireAndReward', label: 'Hire & Reward Insurance' },
      ];
      for (const m of colMap) {
        const url = sb[m.col];
        if (url) fallback.push({ id: `${driverId}-${m.type}`, driverId, type: m.type, fileName: m.label,
          fileUrl: normalizeDocUrl(url), signedUrl: normalizeDocUrl(url), status: 'approved',
          uploadedAt: sb.created_at ? new Date(sb.created_at) : new Date() });
      }
    }
    if (existing.length > 0 && existing.length >= fallback.length) return existing;
    return fallback.length ? fallback : existing;
  };

  const getDocSummary = (driver: Driver) => {
    const docs = getDriverDocs(driver.id);
    const vt = driver.vehicleType || 'car';
    const required = ['driving_license', 'hire_and_reward_insurance', 'goods_in_transit_insurance',
      'proof_of_identity', 'proof_of_address',
      ...(['small_van', 'medium_van'].includes(vt)
        ? ['vehicle_photo_front', 'vehicle_photo_back', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_load_space']
        : ['vehicle_photo_front', 'vehicle_photo_back'])];
    let approved = 0, pending = 0, rejected = 0, missing = 0;
    for (const dt of required) {
      const doc = docs.find(d => normalizeType(d.type) === dt);
      if (!doc) missing++;
      else if (doc.status === 'approved') approved++;
      else if (doc.status === 'pending') pending++;
      else if (doc.status === 'rejected') rejected++;
    }
    return { total: required.length, approved, pending, rejected, missing,
      isComplete: approved === required.length, needsAttention: pending > 0 || rejected > 0 };
  };

  const formatDocType = (type: string) => {
    const labels: Record<string, string> = {
      drivingLicenceFront: 'Driving Licence (Front)', drivingLicenceBack: 'Driving Licence (Back)',
      driving_license: 'Driving Licence', hire_and_reward_insurance: 'Hire & Reward Insurance',
      hireAndReward: 'Hire & Reward Insurance', goods_in_transit_insurance: 'Goods in Transit Insurance',
      goodsInTransitInsurance: 'Goods in Transit Insurance', proof_of_identity: 'Proof of Identity',
      proof_of_address: 'Proof of Address', vehicle_photo_front: 'Vehicle Photo (Front)',
      vehicle_photo_back: 'Vehicle Photo (Back)', vehicle_photo_left: 'Vehicle Photo (Left)',
      vehicle_photo_right: 'Vehicle Photo (Right)', vehicle_photo_load_space: 'Vehicle Load Space',
      dbsCertificate: 'DBS Certificate', profilePicture: 'Profile Picture',
    };
    return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const filtered = useMemo(() => {
    let list = drivers;
    if (statusFilter === 'verified') list = list.filter(d => d.isVerified);
    else if (statusFilter === 'available') list = list.filter(d => d.isAvailable);
    else if (statusFilter === 'pending') list = list.filter(d => !d.isVerified);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(d => {
        const i = getInfo(d);
        return (i.name || '').toLowerCase().includes(q) ||
          (i.email || '').toLowerCase().includes(q) ||
          (i.driverCode || '').toLowerCase().includes(q) ||
          (d.vehicleRegistration || '').toLowerCase().includes(q);
      });
    }
    return list;
  }, [drivers, statusFilter, searchQuery, supabaseDrivers]);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Drivers</h1>
          <p className="text-sm text-muted-foreground mt-1">View all registered drivers</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Total Drivers', value: drivers.length, icon: <Users className="h-8 w-8 text-muted-foreground" />, filter: 'all' as const },
            { label: 'Verified', value: drivers.filter(d => d.isVerified).length, icon: <CheckCircle className="h-8 w-8 text-green-500" />, filter: 'verified' as const },
            { label: 'Available Now', value: drivers.filter(d => d.isAvailable).length, icon: <Truck className="h-8 w-8 text-blue-500" />, filter: 'available' as const },
            { label: 'Pending Verification', value: drivers.filter(d => !d.isVerified).length, icon: <UserCheck className="h-8 w-8 text-yellow-500" />, filter: 'pending' as const },
          ].map(card => (
            <Card key={card.label} className="cursor-pointer hover-elevate" onClick={() => setStatusFilter(card.filter)}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-2xl font-bold">{driversLoading ? '—' : card.value}</p>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                  </div>
                  {card.icon}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by Driver ID, name, email, or registration..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-drivers"
                />
              </div>
              {statusFilter !== 'all' && (
                <Badge variant="secondary" className="cursor-pointer self-start sm:self-center"
                  onClick={() => setStatusFilter('all')}>
                  {statusFilter === 'verified' && 'Verified'}
                  {statusFilter === 'available' && 'Available Now'}
                  {statusFilter === 'pending' && 'Pending Verification'}
                  {' '}({filtered.length}) <span className="ml-1.5 text-xs opacity-60">✕</span>
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {driversLoading ? (
              <div className="space-y-4">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : filtered.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver ID</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Registration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Jobs</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead className="w-[90px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(driver => {
                    const info = getInfo(driver);
                    const initials = info.name?.split(' ').map(n => n[0]).join('') || 'D';
                    const ds = getDocSummary(driver);
                    return (
                      <TableRow key={driver.id} data-testid={`row-driver-${driver.id}`}>
                        <TableCell>
                          {info.driverCode
                            ? <Badge className="bg-blue-600 text-white font-mono text-sm px-2">{info.driverCode}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback className="bg-primary text-primary-foreground">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium">{info.name}</div>
                              <div className="text-xs text-muted-foreground">{info.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="capitalize text-sm">{driver.vehicleType?.replace(/_/g, ' ') || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{driver.vehicleRegistration || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {driver.isVerified
                              ? <Badge className="bg-green-500 text-white text-xs">Verified</Badge>
                              : <Badge variant="secondary" className="text-xs">Unverified</Badge>}
                            {driver.isAvailable && <Badge className="bg-blue-500 text-white text-xs">Online</Badge>}
                            {driver.isActive === false && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                            <span className="text-sm">{driver.rating || '5.00'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{jobCounts[driver.id] ?? driver.totalJobs ?? 0}</span>
                        </TableCell>
                        <TableCell>
                          {ds.isComplete
                            ? <Badge className="bg-green-500 text-white text-xs">Complete</Badge>
                            : ds.needsAttention
                            ? <Badge variant="secondary" className="text-xs text-yellow-600">{ds.pending} pending</Badge>
                            : <Badge variant="secondary" className="text-xs">{ds.approved}/{ds.total}</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon"
                              onClick={() => { setSelectedDriver(driver); setProfileOpen(true); }}
                              data-testid={`button-view-profile-${driver.id}`} title="View profile">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon"
                              onClick={() => { setSelectedDriver(driver); setDocsOpen(true); }}
                              data-testid={`button-view-docs-${driver.id}`} title="View documents">
                              <FileText className="h-4 w-4" />
                            </Button>
                          </div>
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

        {/* Read-only Profile Dialog */}
        <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                {selectedDriver && getInfo(selectedDriver).driverCode && (
                  <Badge className="bg-blue-600 text-white font-mono text-lg px-3 py-1">
                    {getInfo(selectedDriver).driverCode}
                  </Badge>
                )}
                Driver Profile
              </DialogTitle>
              <DialogDescription>{selectedDriver && getInfo(selectedDriver).name}</DialogDescription>
            </DialogHeader>
            {selectedDriver && (() => {
              const info = getInfo(selectedDriver);
              return (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                        {info.name?.split(' ').map(n => n[0]).join('') || 'D'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="text-xl font-semibold">{info.name}</h3>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {selectedDriver.isVerified
                          ? <Badge className="bg-green-500 text-white">Verified</Badge>
                          : <Badge variant="secondary">Unverified</Badge>}
                        {selectedDriver.isAvailable && <Badge className="bg-blue-500 text-white">Online</Badge>}
                        {selectedDriver.isActive === false && <Badge variant="destructive">Inactive</Badge>}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid grid-cols-2 gap-6 text-sm">
                    <div className="space-y-4">
                      <h4 className="font-semibold">Contact</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>{info.email || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>{info.phone || '—'}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                          <span>{[selectedDriver.address, selectedDriver.postcode].filter(Boolean).join(', ') || '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-semibold">Vehicle</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="capitalize">{selectedDriver.vehicleType?.replace(/_/g, ' ') || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-mono">{selectedDriver.vehicleRegistration || '—'}</span>
                        </div>
                        {(selectedDriver.vehicleMake || selectedDriver.vehicleModel) && (
                          <div className="text-muted-foreground">
                            {[selectedDriver.vehicleMake, selectedDriver.vehicleModel, selectedDriver.vehicleColor].filter(Boolean).join(' ')}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-semibold">Compliance</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>{selectedDriver.isBritish ? 'British' : selectedDriver.nationality || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>DBS: {selectedDriver.dbsChecked
                            ? <span className="text-green-600 font-medium">Completed</span>
                            : <span className="text-muted-foreground">Not completed</span>}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-semibold">Performance</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />
                          <span>Rating: <strong>{selectedDriver.rating || '5.00'}</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>Jobs: <strong>{jobCounts[selectedDriver.id] ?? selectedDriver.totalJobs ?? 0}</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span>Joined: {selectedDriver.createdAt
                            ? new Date(selectedDriver.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Read-only Documents Dialog */}
        <Dialog open={docsOpen} onOpenChange={setDocsOpen}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                {selectedDriver && getInfo(selectedDriver).driverCode && (
                  <Badge className="bg-blue-600 text-white font-mono text-lg px-3 py-1">
                    {getInfo(selectedDriver).driverCode}
                  </Badge>
                )}
                Documents
              </DialogTitle>
              <DialogDescription>{selectedDriver && getInfo(selectedDriver).name}</DialogDescription>
            </DialogHeader>
            {selectedDriver && (
              <div className="space-y-3">
                {docsLoading ? (
                  <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
                ) : (() => {
                  const docs = getDriverDocs(selectedDriver.id);
                  if (!docs.length) return (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <FileText className="h-10 w-10 text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">No documents uploaded</p>
                    </div>
                  );
                  return docs.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between gap-4 p-3 rounded-md border">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{formatDocType(doc.type)}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {doc.status === 'approved' && <Badge className="bg-green-500 text-white text-xs">Approved</Badge>}
                        {doc.status === 'pending' && <Badge variant="secondary" className="text-xs text-yellow-600">Pending</Badge>}
                        {doc.status === 'rejected' && <Badge variant="destructive" className="text-xs">Rejected</Badge>}
                        {(doc.fileUrl || doc.signedUrl) && (
                          <Button variant="ghost" size="icon" asChild>
                            <a href={normalizeDocUrl(doc.signedUrl || doc.fileUrl)} target="_blank" rel="noopener noreferrer" title="View document">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
