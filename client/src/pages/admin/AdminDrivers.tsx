import { useState, useRef, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  AlertTriangle,
  Clock,
  Shield,
  Globe,
  CreditCard,
  Upload,
  ChevronsUpDown,
  Check,
  Trash2,
} from 'lucide-react';
import { cn, normalizeDocUrl } from '@/lib/utils';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { supabaseFunctions } from '@/lib/supabaseFunctions';
import { useRealtimeDrivers } from '@/hooks/useRealtimeDrivers';
import type { Driver, User, Document, DocumentStatus, VehicleType } from '@shared/schema';

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

const COUNTRIES = [
  "Afghan", "Albanian", "Algerian", "American", "Andorran", "Angolan", "Argentine", "Armenian", 
  "Australian", "Austrian", "Azerbaijani", "Bahamian", "Bahraini", "Bangladeshi", "Barbadian", 
  "Belarusian", "Belgian", "Belizean", "Beninese", "Bhutanese", "Bolivian", "Bosnian", "Brazilian", 
  "British", "Bruneian", "Bulgarian", "Burkinabe", "Burmese", "Burundian", "Cambodian", "Cameroonian", 
  "Canadian", "Cape Verdean", "Central African", "Chadian", "Chilean", "Chinese", "Colombian", 
  "Comorian", "Congolese", "Costa Rican", "Croatian", "Cuban", "Cypriot", "Czech", "Danish", 
  "Djiboutian", "Dominican", "Dutch", "Ecuadorian", "Egyptian", "Emirati", "English", "Eritrean", 
  "Estonian", "Ethiopian", "Fijian", "Filipino", "Finnish", "French", "Gabonese", "Gambian", 
  "Georgian", "German", "Ghanaian", "Greek", "Grenadian", "Guatemalan", "Guinean", "Guyanese", 
  "Haitian", "Honduran", "Hungarian", "Icelandic", "Indian", "Indonesian", "Iranian", "Iraqi", 
  "Irish", "Israeli", "Italian", "Ivorian", "Jamaican", "Japanese", "Jordanian", "Kazakh", 
  "Kenyan", "Kuwaiti", "Kyrgyz", "Laotian", "Latvian", "Lebanese", "Liberian", "Libyan", 
  "Lithuanian", "Luxembourgish", "Macedonian", "Malagasy", "Malawian", "Malaysian", "Maldivian", 
  "Malian", "Maltese", "Mauritanian", "Mauritian", "Mexican", "Moldovan", "Monegasque", "Mongolian", 
  "Montenegrin", "Moroccan", "Mozambican", "Namibian", "Nepalese", "New Zealand", "Nicaraguan", 
  "Nigerian", "North Korean", "Norwegian", "Omani", "Pakistani", "Panamanian", "Papua New Guinean", 
  "Paraguayan", "Peruvian", "Polish", "Portuguese", "Qatari", "Romanian", "Russian", "Rwandan", 
  "Saint Lucian", "Salvadoran", "Samoan", "Saudi", "Scottish", "Senegalese", "Serbian", "Sierra Leonean", 
  "Singaporean", "Slovak", "Slovenian", "Somali", "South African", "South Korean", "Spanish", 
  "Sri Lankan", "Sudanese", "Surinamese", "Swedish", "Swiss", "Syrian", "Taiwanese", "Tajik", 
  "Tanzanian", "Thai", "Togolese", "Trinidadian", "Tunisian", "Turkish", "Turkmen", "Ugandan", 
  "Ukrainian", "Uruguayan", "Uzbek", "Venezuelan", "Vietnamese", "Welsh", "Yemeni", "Zambian", "Zimbabwean"
];

export default function AdminDrivers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [documentsDialogOpen, setDocumentsDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editVehicleType, setEditVehicleType] = useState('');
  const [editVehicleReg, setEditVehicleReg] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNationality, setEditNationality] = useState('');
  const [editIsBritish, setEditIsBritish] = useState(true);
  const [editNationalInsurance, setEditNationalInsurance] = useState('');
  const [editRightToWorkShareCode, setEditRightToWorkShareCode] = useState('');
  const [editDbsChecked, setEditDbsChecked] = useState(false);
  const [editDbsCertificateUrl, setEditDbsCertificateUrl] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPostcode, setEditPostcode] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [nationalitySearch, setNationalitySearch] = useState('');
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [uploadingDbs, setUploadingDbs] = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [driverToDeactivate, setDriverToDeactivate] = useState<Driver | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState<Driver | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  const dbsFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useRealtimeDrivers();

  const { data: localDrivers, isLoading: localDriversLoading } = useQuery<Driver[]>({
    queryKey: ['/api/drivers', { includeInactive: showInactive }],
  });

  const { data: supabaseDrivers, isLoading: supabaseDriversLoading, isError: supabaseDriversError } = useQuery<SupabaseDriver[]>({
    queryKey: ['/api/supabase-drivers'],
    retry: false, // Don't retry if Supabase endpoint fails
  });

  // Merge drivers: Use local PostgreSQL drivers as base, enrich with Supabase data if available
  // Falls back to local drivers only when Supabase is unavailable
  const drivers: Driver[] = useMemo(() => {
    // If we have Supabase drivers, use them as source of truth merged with local data
    if (supabaseDrivers && supabaseDrivers.length > 0) {
      return supabaseDrivers.map(sd => {
        const localDriver = localDrivers?.find(d => d.id === sd.id);
        return {
          id: sd.id,
          userId: sd.id,
          driverCode: sd.driverCode,
          fullName: sd.fullName || localDriver?.fullName || null,
          email: sd.email,
          phone: sd.phone || localDriver?.phone || null,
          postcode: localDriver?.postcode || null,
          address: localDriver?.address || null,
          nationality: localDriver?.nationality || null,
          isBritish: localDriver?.isBritish || null,
          nationalInsuranceNumber: localDriver?.nationalInsuranceNumber || null,
          rightToWorkShareCode: localDriver?.rightToWorkShareCode || null,
          dbsChecked: localDriver?.dbsChecked || null,
          dbsCertificateUrl: localDriver?.dbsCertificateUrl || null,
          dbsCheckDate: localDriver?.dbsCheckDate || null,
          vehicleType: sd.vehicleType as VehicleType || localDriver?.vehicleType || 'car',
          vehicleRegistration: localDriver?.vehicleRegistration || null,
          vehicleMake: localDriver?.vehicleMake || null,
          vehicleModel: localDriver?.vehicleModel || null,
          vehicleColor: localDriver?.vehicleColor || null,
          isAvailable: sd.isAvailable ?? localDriver?.isAvailable ?? false,
          isVerified: sd.isVerified ?? localDriver?.isVerified ?? false,
          currentLatitude: localDriver?.currentLatitude || null,
          currentLongitude: localDriver?.currentLongitude || null,
          lastLocationUpdate: localDriver?.lastLocationUpdate || null,
          rating: localDriver?.rating || '5.00',
          totalJobs: localDriver?.totalJobs || 0,
          profilePictureUrl: localDriver?.profilePictureUrl || null,
          isActive: localDriver?.isActive ?? true,
          deactivatedAt: localDriver?.deactivatedAt || null,
          createdAt: sd.createdAt ? new Date(sd.createdAt) : localDriver?.createdAt || new Date(),
        } as Driver;
      });
    }
    // Fallback: Use local PostgreSQL drivers when Supabase is unavailable
    return localDrivers || [];
  }, [supabaseDrivers, localDrivers]);

  const driversLoading = localDriversLoading;

  const { data: allJobs } = useQuery<any[]>({
    queryKey: ['/api/jobs'],
  });

  const driverJobCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (allJobs) {
      for (const job of allJobs) {
        const did = job.driverId || job.driver_id;
        if (did) {
          counts[did] = (counts[did] || 0) + 1;
        }
      }
    }
    return counts;
  }, [allJobs]);

  const { data: documents } = useQuery<Document[]>({
    queryKey: ['/api/documents'],
  });

  const { data: selectedDriverDocs } = useQuery<Document[]>({
    queryKey: ['/api/documents', { driverId: selectedDriver?.id }],
    queryFn: async () => {
      if (!selectedDriver?.id) return [];
      const res = await fetch(`/api/documents?driverId=${selectedDriver.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedDriver?.id && documentsDialogOpen,
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users', { role: 'driver' }],
  });

  const verifyDriverMutation = useMutation({
    mutationFn: async ({ id, isVerified }: { id: string; isVerified: boolean }) => {
      // Use backend API for driver verification - more reliable than Edge Functions
      const response = await apiRequest('PATCH', `/api/drivers/${id}/verify`, { 
        isVerified, 
        bypassDocumentCheck: true 
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update driver');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drivers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supabase-drivers'] });
      // Also invalidate Supabase queries used by dashboard
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
      toast({ title: 'Driver status updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Failed to update driver', variant: 'destructive' });
    },
  });

  const updateDriverMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Driver> }) => {
      // Use backend API for driver updates - more reliable than Edge Functions
      const response = await apiRequest('PATCH', `/api/drivers/${id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update driver');
      }
      return response.json();
    },
    onSuccess: (updatedDriver: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/drivers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supabase-drivers'] });
      // Also invalidate Supabase queries used by dashboard
      queryClient.invalidateQueries({ queryKey: ['supabase', 'drivers'] });
      if (selectedDriver && updatedDriver) {
        setSelectedDriver({ ...selectedDriver, ...updatedDriver });
      }
      toast({ title: 'Driver updated successfully' });
      setEditMode(false);
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Failed to update driver', variant: 'destructive' });
    },
  });

  const deactivateDriverMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/drivers/${id}/deactivate`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to deactivate driver');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === '/api/drivers' });
      toast({ title: 'Driver deactivated successfully' });
      setDeactivateDialogOpen(false);
      setDriverToDeactivate(null);
      setProfileDialogOpen(false);
      setSelectedDriver(null);
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Failed to deactivate driver', variant: 'destructive' });
    },
  });

  const reactivateDriverMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('POST', `/api/drivers/${id}/reactivate`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reactivate driver');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === '/api/drivers' });
      toast({ title: 'Driver reactivated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Failed to reactivate driver', variant: 'destructive' });
    },
  });

  const deleteDriverMutation = useMutation({
    mutationFn: async (id: string) => {
      // Use backend API for driver deletion
      const response = await apiRequest('DELETE', `/api/drivers/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete driver');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === '/api/drivers' });
      toast({ title: 'Driver deleted permanently' });
      setDeleteDialogOpen(false);
      setDriverToDelete(null);
      setProfileDialogOpen(false);
      setSelectedDriver(null);
    },
    onError: (error: Error) => {
      toast({ title: error.message || 'Failed to delete driver', variant: 'destructive' });
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
      queryClient.invalidateQueries({ queryKey: ['/api/drivers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/driver-applications'] });
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
    if (selectedDriver?.id === driverId && selectedDriverDocs && selectedDriverDocs.length > 0) {
      return selectedDriverDocs;
    }

    const existingDocs = documents?.filter((d) => d.driverId === driverId) || [];
    if (existingDocs.length > 0) return existingDocs;

    const sbDriver = supabaseDrivers?.find((d: any) => d.id === driverId);
    if (!sbDriver) return [];
    const raw = sbDriver as any;
    const fallbackDocs: any[] = [];
    const colMap = [
      { col: 'driving_licence_front_url', type: 'drivingLicenceFront', label: 'Driving Licence (Front)' },
      { col: 'driving_licence_back_url', type: 'drivingLicenceBack', label: 'Driving Licence (Back)' },
      { col: 'dbs_certificate_url', type: 'dbsCertificate', label: 'DBS Certificate' },
      { col: 'goods_in_transit_insurance_url', type: 'goodsInTransitInsurance', label: 'Goods in Transit Insurance' },
      { col: 'hire_reward_insurance_url', type: 'hireAndReward', label: 'Hire & Reward Insurance' },
      { col: 'profile_picture_url', type: 'profilePicture', label: 'Profile Picture' },
    ];
    for (const m of colMap) {
      const url = raw[m.col];
      if (url) {
        fallbackDocs.push({
          id: `${driverId}-${m.type}`,
          driverId,
          type: m.type,
          fileName: m.label,
          fileUrl: normalizeDocUrl(url),
          status: 'approved',
          uploadedAt: raw.created_at ? new Date(raw.created_at) : new Date(),
          expiryDate: null,
          reviewedBy: null,
          reviewNotes: null,
        });
      }
    }
    return fallbackDocs;
  };

  const normalizeDocType = (type: string): string => {
    const typeMap: Record<string, string> = {
      'driving_license': 'driving_license',
      'driving_licence_front': 'driving_license',
      'driving_licence_back': 'driving_license',
      'driving_license_front': 'driving_license',
      'driving_license_back': 'driving_license',
      'drivingLicenceFront': 'driving_license',
      'drivingLicenceBack': 'driving_license',
      'hire_and_reward_insurance': 'hire_and_reward_insurance',
      'hire_and_reward': 'hire_and_reward_insurance',
      'hireAndReward': 'hire_and_reward_insurance',
      'goods_in_transit_insurance': 'goods_in_transit_insurance',
      'goods_in_transit': 'goods_in_transit_insurance',
      'goodsInTransitInsurance': 'goods_in_transit_insurance',
      'proof_of_identity': 'proof_of_identity',
      'proof_of_address': 'proof_of_address',
      'vehicle_photo_front': 'vehicle_photo_front',
      'vehicle_photos_front': 'vehicle_photo_front',
      'vehicle_photo_back': 'vehicle_photo_back',
      'vehicle_photos_back': 'vehicle_photo_back',
      'vehicle_photo_left': 'vehicle_photo_left',
      'vehicle_photos_left': 'vehicle_photo_left',
      'vehicle_photo_right': 'vehicle_photo_right',
      'vehicle_photos_right': 'vehicle_photo_right',
      'vehicle_photo_load_space': 'vehicle_photo_load_space',
      'vehicle_photos_load space': 'vehicle_photo_load_space',
      'vehicle_photos_load_space': 'vehicle_photo_load_space',
    };
    return typeMap[type] || type;
  };

  const getDocumentStatusSummary = (driver: Driver) => {
    const driverDocs = getDriverDocuments(driver.id);
    const vehicleType = driver.vehicleType || 'car';
    
    const baseRequiredDocs = [
      'driving_license',
      'hire_and_reward_insurance',
      'goods_in_transit_insurance',
      'proof_of_identity',
      'proof_of_address',
    ];
    
    const vehiclePhotoRequirements: Record<string, string[]> = {
      'motorbike': ['vehicle_photo_front', 'vehicle_photo_back'],
      'car': ['vehicle_photo_front', 'vehicle_photo_back'],
      'small_van': ['vehicle_photo_front', 'vehicle_photo_back', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_load_space'],
      'medium_van': ['vehicle_photo_front', 'vehicle_photo_back', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_load_space'],
    };
    
    const requiredPhotos = vehiclePhotoRequirements[vehicleType] || ['vehicle_photo_front', 'vehicle_photo_back'];
    const allRequiredDocs = [...baseRequiredDocs, ...requiredPhotos];
    
    let approved = 0;
    let pending = 0;
    let rejected = 0;
    let missing = 0;
    
    for (const docType of allRequiredDocs) {
      const doc = driverDocs.find(d => normalizeDocType(d.type) === docType);
      if (!doc) {
        missing++;
      } else if (doc.status === 'approved') {
        approved++;
      } else if (doc.status === 'pending') {
        pending++;
      } else if (doc.status === 'rejected') {
        rejected++;
      }
    }
    
    return {
      total: allRequiredDocs.length,
      approved,
      pending,
      rejected,
      missing,
      isComplete: approved === allRequiredDocs.length,
      needsAttention: pending > 0 || rejected > 0,
    };
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
    setEditNationality(driver.nationality || '');
    setEditIsBritish(driver.isBritish ?? true);
    setEditNationalInsurance(driver.nationalInsuranceNumber || '');
    setEditRightToWorkShareCode(driver.rightToWorkShareCode || '');
    setEditDbsChecked(driver.dbsChecked ?? false);
    setEditDbsCertificateUrl(driver.dbsCertificateUrl || '');
    setEditAddress(driver.address || '');
    setEditPostcode(driver.postcode || '');
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
        nationality: editNationality,
        isBritish: editIsBritish,
        nationalInsuranceNumber: editNationalInsurance,
        rightToWorkShareCode: editRightToWorkShareCode,
        dbsChecked: editDbsChecked,
        dbsCertificateUrl: editDbsCertificateUrl,
        address: editAddress,
        postcode: editPostcode,
      },
    });
  };

  const handleDbsFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedDriver) return;

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: 'File too large',
        description: 'Please upload a file smaller than 10MB',
        variant: 'destructive',
      });
      return;
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF or image file (JPG, PNG)',
        variant: 'destructive',
      });
      return;
    }

    setUploadingDbs(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('driverId', selectedDriver.id);
      formData.append('documentType', 'dbs_certificate');

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      setEditDbsCertificateUrl(data.fileUrl);
      toast({
        title: 'DBS certificate uploaded',
        description: 'File uploaded successfully',
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: 'Failed to upload DBS certificate. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setUploadingDbs(false);
      if (dbsFileInputRef.current) {
        dbsFileInputRef.current.value = '';
      }
    }
  };

  const filteredCountries = COUNTRIES.filter((country) =>
    country.toLowerCase().includes(nationalitySearch.toLowerCase())
  );

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
      driving_license: 'Driving Licence',
      driving_licence_front: 'Driving Licence (Front)',
      driving_licence_back: 'Driving Licence (Back)',
      driving_license_front: 'Driving Licence (Front)',
      driving_license_back: 'Driving Licence (Back)',
      drivingLicenceFront: 'Driving Licence (Front)',
      drivingLicenceBack: 'Driving Licence (Back)',
      right_to_work: 'Right to Work',
      share_code: 'Right to Work Share Code',
      vehicle_photo: 'Vehicle Photo',
      vehicle_photo_front: 'Vehicle Photo (Front)',
      vehicle_photo_back: 'Vehicle Photo (Back)',
      vehicle_photo_left: 'Vehicle Photo (Left)',
      vehicle_photo_right: 'Vehicle Photo (Right)',
      vehicle_photo_load_space: 'Vehicle Photo (Load Space)',
      vehicle_photos_front: 'Vehicle Photo (Front)',
      vehicle_photos_back: 'Vehicle Photo (Back)',
      vehicle_photos_left: 'Vehicle Photo (Left)',
      vehicle_photos_right: 'Vehicle Photo (Right)',
      vehicle_photos_load: 'Vehicle Photo (Load Space)',
      insurance: 'Insurance',
      goods_in_transit: 'Goods in Transit Insurance',
      goods_in_transit_insurance: 'Goods in Transit Insurance',
      goodsInTransitInsurance: 'Goods in Transit Insurance',
      hire_reward: 'Hire & Reward Insurance',
      hire_and_reward: 'Hire & Reward Insurance',
      hire_and_reward_insurance: 'Hire & Reward Insurance',
      hireAndReward: 'Hire & Reward Insurance',
      proof_of_identity: 'Proof of Identity',
      proof_of_address: 'Proof of Address',
      profile_picture: 'Profile Picture',
      profilePicture: 'Profile Picture',
      dbs_certificate: 'DBS Certificate',
      dbsCertificate: 'DBS Certificate',
    };
    return names[type] || type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const getDocumentViewUrl = (doc: any) => {
    if (doc.fileUrl?.startsWith('text:')) return null;
    return `/api/documents/${doc.id}/view`;
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
                  placeholder="Search by Driver ID, name, email, or registration..."
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
                    <TableHead>Driver ID</TableHead>
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
                    const docStatus = getDocumentStatusSummary(driver);
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
                            {driver.isActive === false && (
                              <Badge variant="outline" className="text-orange-600 border-orange-600 w-fit" data-testid={`badge-deactivated-${driver.id}`}>Deactivated</Badge>
                            )}
                            {driver.isAvailable && driver.isActive !== false && (
                              <Badge className="bg-blue-500 text-white w-fit" data-testid={`badge-available-${driver.id}`}>Online</Badge>
                            )}
                            {docStatus.isComplete ? (
                              <Badge className="bg-green-100 text-green-700 border-green-300 w-fit" data-testid={`badge-docs-complete-${driver.id}`}>
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Docs Complete
                              </Badge>
                            ) : (
                              <>
                                {docStatus.pending > 0 && (
                                  <Badge variant="outline" className="text-yellow-600 border-yellow-600 w-fit" data-testid={`badge-docs-pending-${driver.id}`}>
                                    <Clock className="mr-1 h-3 w-3" />
                                    {docStatus.pending} pending review
                                  </Badge>
                                )}
                                {docStatus.rejected > 0 && (
                                  <Badge variant="outline" className="text-red-600 border-red-600 w-fit" data-testid={`badge-docs-rejected-${driver.id}`}>
                                    <XCircle className="mr-1 h-3 w-3" />
                                    {docStatus.rejected} rejected
                                  </Badge>
                                )}
                                {docStatus.missing > 0 && (
                                  <Badge variant="outline" className="text-gray-500 border-gray-400 w-fit" data-testid={`badge-docs-missing-${driver.id}`}>
                                    <AlertTriangle className="mr-1 h-3 w-3" />
                                    {docStatus.missing} missing
                                  </Badge>
                                )}
                              </>
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
                        <TableCell>{driverJobCounts[driver.id] ?? driver.totalJobs ?? 0}</TableCell>
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
                                {docStatus.pending > 0 && (
                                  <Badge variant="secondary" className="ml-2 text-xs">{docStatus.pending}</Badge>
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
                              {driver.isActive !== false ? (
                                <DropdownMenuItem
                                  className="text-orange-600"
                                  onClick={() => {
                                    setDriverToDeactivate(driver);
                                    setDeactivateDialogOpen(true);
                                  }}
                                  data-testid={`menu-deactivate-${driver.id}`}
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Deactivate Driver
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  className="text-green-600"
                                  onClick={() => reactivateDriverMutation.mutate(driver.id)}
                                  disabled={reactivateDriverMutation.isPending}
                                  data-testid={`menu-reactivate-${driver.id}`}
                                >
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Reactivate Driver
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setDriverToDelete(driver);
                                  setDeleteDialogOpen(true);
                                }}
                                data-testid={`menu-delete-${driver.id}`}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Driver
                              </DropdownMenuItem>
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                          <PhoneInput
                            value={editPhone}
                            onChange={setEditPhone}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span>{getDriverInfo(selectedDriver).phone || '—'}</span>
                        </div>
                      )}
                      {editMode ? (
                        <>
                          <div className="space-y-2">
                            <Label>Address</Label>
                            <Input
                              value={editAddress}
                              onChange={(e) => setEditAddress(e.target.value)}
                              placeholder="Full address"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Postcode</Label>
                            <Input
                              value={editPostcode}
                              onChange={(e) => setEditPostcode(e.target.value.toUpperCase())}
                              placeholder="SW1A 1AA"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>{selectedDriver.address || selectedDriver.postcode || '—'}</span>
                        </div>
                      )}
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

                {/* Verification & Compliance Section */}
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Verification & Compliance
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-6">
                    {/* DBS Check Section */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">DBS Check Status</Label>
                      {editMode ? (
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="dbs-checked"
                              checked={editDbsChecked}
                              onCheckedChange={(checked) => setEditDbsChecked(checked === true)}
                            />
                            <label htmlFor="dbs-checked" className="text-sm font-medium leading-none cursor-pointer">
                              DBS Check Verified
                            </label>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">DBS Certificate</Label>
                            <div className="flex items-center gap-2">
                              <input
                                ref={dbsFileInputRef}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={handleDbsFileUpload}
                                className="hidden"
                                data-testid="input-dbs-file"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => dbsFileInputRef.current?.click()}
                                disabled={uploadingDbs}
                                data-testid="button-upload-dbs"
                              >
                                {uploadingDbs ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Upload className="h-4 w-4 mr-2" />
                                )}
                                {uploadingDbs ? 'Uploading...' : 'Upload Certificate'}
                              </Button>
                              {editDbsCertificateUrl && (
                                <a 
                                  href={editDbsCertificateUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  View uploaded
                                </a>
                              )}
                            </div>
                            {editDbsCertificateUrl && (
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {editDbsCertificateUrl.split('/').pop()}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            {selectedDriver.dbsChecked ? (
                              <Badge className="bg-green-500 text-white">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                DBS Verified
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Not Verified
                              </Badge>
                            )}
                          </div>
                          {selectedDriver.dbsCertificateUrl && (
                            <a 
                              href={selectedDriver.dbsCertificateUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-sm text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View Certificate
                            </a>
                          )}
                          {selectedDriver.dbsCheckDate && (
                            <p className="text-xs text-muted-foreground">
                              Verified: {formatDate(selectedDriver.dbsCheckDate)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right to Work Section */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Right to Work (UK)</Label>
                      {editMode ? (
                        <div className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="is-british"
                              checked={editIsBritish}
                              onCheckedChange={(checked) => setEditIsBritish(checked === true)}
                            />
                            <label htmlFor="is-british" className="text-sm font-medium leading-none cursor-pointer">
                              British Citizen
                            </label>
                          </div>
                          {!editIsBritish && (
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Share Code (gov.uk)</Label>
                              <Input
                                value={editRightToWorkShareCode}
                                onChange={(e) => setEditRightToWorkShareCode(e.target.value.toUpperCase())}
                                placeholder="ABC123XYZ"
                                maxLength={9}
                                className="text-sm font-mono"
                                data-testid="input-share-code"
                              />
                            </div>
                          )}
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Nationality</Label>
                            <Popover open={nationalityOpen} onOpenChange={setNationalityOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={nationalityOpen}
                                  className="w-full justify-between text-sm font-normal"
                                  data-testid="button-nationality-select"
                                >
                                  {editNationality || "Select nationality..."}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[200px] p-0" align="start">
                                <div className="p-2">
                                  <Input
                                    placeholder="Search nationality..."
                                    value={nationalitySearch}
                                    onChange={(e) => setNationalitySearch(e.target.value)}
                                    className="h-8 text-sm"
                                    data-testid="input-nationality-search"
                                  />
                                </div>
                                <ScrollArea className="h-[200px]">
                                  <div className="p-1">
                                    {filteredCountries.length === 0 ? (
                                      <p className="text-sm text-muted-foreground text-center py-2">
                                        No nationality found
                                      </p>
                                    ) : (
                                      filteredCountries.map((country) => (
                                        <Button
                                          key={country}
                                          variant="ghost"
                                          className={cn(
                                            "w-full justify-start text-sm font-normal h-8",
                                            editNationality === country && "bg-accent"
                                          )}
                                          onClick={() => {
                                            setEditNationality(country);
                                            setNationalityOpen(false);
                                            setNationalitySearch('');
                                          }}
                                          data-testid={`option-nationality-${country.toLowerCase().replace(/\s+/g, '-')}`}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              editNationality === country ? "opacity-100" : "opacity-0"
                                            )}
                                          />
                                          {country}
                                        </Button>
                                      ))
                                    )}
                                  </div>
                                </ScrollArea>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            <span>{selectedDriver.nationality || 'Not specified'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {selectedDriver.isBritish ? (
                              <Badge className="bg-blue-500 text-white">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                British Citizen
                              </Badge>
                            ) : (
                              <>
                                <Badge variant="outline">Non-British</Badge>
                                {selectedDriver.rightToWorkShareCode && (
                                  <Badge className="bg-green-500 text-white font-mono">
                                    Code: {selectedDriver.rightToWorkShareCode}
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                          {!selectedDriver.isBritish && !selectedDriver.rightToWorkShareCode && (
                            <p className="text-xs text-amber-600 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Share code not provided
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* National Insurance */}
                  <div className="pt-2">
                    {editMode ? (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">National Insurance Number</Label>
                        <Input
                          value={editNationalInsurance}
                          onChange={(e) => setEditNationalInsurance(e.target.value.toUpperCase())}
                          placeholder="AB123456C"
                          maxLength={9}
                          className="max-w-xs font-mono"
                        />
                      </div>
                    ) : (
                      selectedDriver.nationalInsuranceNumber && (
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">NI: <span className="font-mono">{selectedDriver.nationalInsuranceNumber}</span></span>
                        </div>
                      )
                    )}
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold" data-testid="text-driver-total-jobs">{driverJobCounts[selectedDriver.id] ?? selectedDriver.totalJobs ?? 0}</div>
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
                <div className="flex justify-between w-full">
                  {selectedDriver?.isActive !== false ? (
                    <Button 
                      variant="outline"
                      className="text-orange-600 border-orange-600 hover:bg-orange-50"
                      onClick={() => {
                        if (selectedDriver) {
                          setDriverToDeactivate(selectedDriver);
                          setDeactivateDialogOpen(true);
                        }
                      }}
                      data-testid="button-deactivate-driver"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Deactivate Driver
                    </Button>
                  ) : (
                    <Button 
                      variant="outline"
                      className="text-green-600 border-green-600 hover:bg-green-50"
                      onClick={() => {
                        if (selectedDriver) {
                          reactivateDriverMutation.mutate(selectedDriver.id);
                          setProfileDialogOpen(false);
                        }
                      }}
                      disabled={reactivateDriverMutation.isPending}
                      data-testid="button-reactivate-driver"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Reactivate Driver
                    </Button>
                  )}
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
              <DialogDescription asChild>
                <div className="flex items-center gap-2">
                  {selectedDriver && (
                    <>
                      {getDriverInfo(selectedDriver).driverCode && (
                        <Badge className="bg-blue-600 text-white font-mono">
                          {getDriverInfo(selectedDriver).driverCode}
                        </Badge>
                      )}
                      <span>{getDriverInfo(selectedDriver).name}</span>
                    </>
                  )}
                </div>
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
                          {getDocumentViewUrl(doc) ? (
                            <a
                              href={getDocumentViewUrl(doc)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`link-view-doc-${doc.id}`}
                            >
                              <Button variant="outline" size="sm" type="button">
                                <ExternalLink className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </a>
                          ) : (
                            <Button variant="outline" size="sm" disabled>
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View
                            </Button>
                          )}
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

        {/* Deactivate Confirmation Dialog */}
        <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-orange-600">
                <AlertTriangle className="h-5 w-5" />
                Deactivate Driver
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to deactivate this driver? They will no longer receive jobs or be able to log in.
              </DialogDescription>
            </DialogHeader>
            {driverToDeactivate && (
              <div className="py-4">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getDriverInfo(driverToDeactivate).name?.split(' ').map((n) => n[0]).join('') || 'D'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{getDriverInfo(driverToDeactivate).name}</p>
                    <p className="text-sm text-muted-foreground">{getDriverInfo(driverToDeactivate).email}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-3">
                  This will deactivate the driver account. Their job history will be preserved and you can reactivate them later.
                </p>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setDeactivateDialogOpen(false);
                  setDriverToDeactivate(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => {
                  if (driverToDeactivate) {
                    deactivateDriverMutation.mutate(driverToDeactivate.id);
                  }
                }}
                disabled={deactivateDriverMutation.isPending}
                data-testid="button-confirm-deactivate"
              >
                {deactivateDriverMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2" />
                )}
                Deactivate Driver
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                Delete Driver Permanently
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to permanently delete this driver? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            {driverToDelete && (
              <div className="py-4">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {getDriverInfo(driverToDelete).name?.split(' ').map((n) => n[0]).join('') || 'D'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{getDriverInfo(driverToDelete).name}</p>
                    <p className="text-sm text-muted-foreground">{getDriverInfo(driverToDelete).email}</p>
                  </div>
                </div>
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400 font-semibold">
                    PERMANENT DELETION WARNING
                  </p>
                  <ul className="text-sm text-red-600 dark:text-red-400 mt-2 space-y-1 list-disc pl-4">
                    <li>Driver will be removed from ALL systems</li>
                    <li>Login account will be deleted permanently</li>
                    <li>Driver will NOT be able to sign in again</li>
                    <li>This action CANNOT be undone</li>
                  </ul>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setDriverToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => {
                  if (driverToDelete) {
                    deleteDriverMutation.mutate(driverToDelete.id);
                  }
                }}
                disabled={deleteDriverMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteDriverMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete Permanently
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
