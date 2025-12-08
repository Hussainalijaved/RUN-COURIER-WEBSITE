import { Link, useSearch } from 'wouter';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Package,
  Clock,
  CheckCircle,
  MapPin,
  ArrowLeft,
  Truck,
  User,
  FileText,
  Camera,
  Signature,
  Receipt,
  Calendar,
  Phone,
  Image,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import type { Job, Driver } from '@shared/schema';
import { useState } from 'react';

const formatPrice = (price: string | number | null | undefined) => {
  if (price === null || price === undefined) return '£0.00';
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return `£${num.toFixed(2)}`;
};

const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (date: Date | string | null | undefined) => {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatVehicleType = (type: string | null | undefined) => {
  if (!type) return 'Unknown';
  const types: Record<string, string> = {
    'motorbike': 'Motorbike',
    'car': 'Car',
    'small_van': 'Small Van',
    'medium_van': 'Medium Van',
  };
  return types[type] || type;
};

interface OrderWithDriver extends Job {
  driver?: Driver;
}

function PODSection({ job }: { job: Job }) {
  const hasPODPhoto = job.podPhotoUrl && job.podPhotoUrl.length > 0;
  const hasPODSignature = job.podSignatureUrl && job.podSignatureUrl.length > 0;
  const hasDeliveryInstructions = job.deliveryInstructions && job.deliveryInstructions.length > 0;

  if (!hasPODPhoto && !hasPODSignature && !hasDeliveryInstructions) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No proof of delivery available for this order</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasPODPhoto && (
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Camera className="h-4 w-4 text-green-600" />
            Delivery Photo
          </h4>
          <Dialog>
            <DialogTrigger asChild>
              <div 
                className="relative cursor-pointer rounded-lg overflow-hidden border hover:border-primary transition-colors group"
                data-testid="pod-photo-container"
              >
                <img 
                  src={job.podPhotoUrl || ''} 
                  alt="Proof of delivery" 
                  className="w-full h-48 object-cover"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <ExternalLink className="h-8 w-8 text-white" />
                </div>
              </div>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Delivery Photo
                </DialogTitle>
              </DialogHeader>
              <img 
                src={job.podPhotoUrl || ''} 
                alt="Proof of delivery" 
                className="w-full rounded-lg"
                data-testid="pod-photo-full"
              />
            </DialogContent>
          </Dialog>
        </div>
      )}

      {hasPODSignature && (
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Signature className="h-4 w-4 text-blue-600" />
            Customer Signature
          </h4>
          <Dialog>
            <DialogTrigger asChild>
              <div 
                className="relative cursor-pointer rounded-lg overflow-hidden border bg-white hover:border-primary transition-colors group p-4"
                data-testid="pod-signature-container"
              >
                <img 
                  src={job.podSignatureUrl || ''} 
                  alt="Customer signature" 
                  className="w-full h-24 object-contain"
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <ExternalLink className="h-6 w-6 text-black/60" />
                </div>
              </div>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Signature className="h-5 w-5" />
                  Customer Signature
                </DialogTitle>
              </DialogHeader>
              <div className="bg-white rounded-lg p-4 border">
                <img 
                  src={job.podSignatureUrl || ''} 
                  alt="Customer signature" 
                  className="w-full"
                  data-testid="pod-signature-full"
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {hasDeliveryInstructions && (
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-orange-600" />
            Delivery Notes
          </h4>
          <div className="bg-muted/50 rounded-lg p-3 text-sm" data-testid="pod-notes">
            {job.deliveryInstructions}
          </div>
        </div>
      )}
    </div>
  );
}

function PriceBreakdown({ job }: { job: Job }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Base Charge</span>
        <span>{formatPrice(job.basePrice)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">Distance Charge</span>
        <span>{formatPrice(job.distancePrice)}</span>
      </div>
      {parseFloat(job.weightSurcharge?.toString() || '0') > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Weight Surcharge ({job.weight}kg)</span>
          <span>{formatPrice(job.weightSurcharge)}</span>
        </div>
      )}
      {parseFloat(job.centralLondonCharge?.toString() || '0') > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Central London Charge</span>
          <span>{formatPrice(job.centralLondonCharge)}</span>
        </div>
      )}
      {parseFloat(job.multiDropCharge?.toString() || '0') > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Multi-Drop Charge</span>
          <span>{formatPrice(job.multiDropCharge)}</span>
        </div>
      )}
      {parseFloat(job.returnTripCharge?.toString() || '0') > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Return Trip</span>
          <span>{formatPrice(job.returnTripCharge)}</span>
        </div>
      )}
      {parseFloat(job.waitingTimeCharge?.toString() || '0') > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Waiting Time</span>
          <span>{formatPrice(job.waitingTimeCharge)}</span>
        </div>
      )}
      <Separator />
      <div className="flex justify-between font-bold text-base">
        <span>Total</span>
        <span className="text-primary">{formatPrice(job.totalPrice)}</span>
      </div>
    </div>
  );
}

function DeliveredOrderCard({ job, driver }: { job: Job; driver?: Driver }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="overflow-hidden" data-testid={`card-order-${job.id}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-green-600" />
              Order #{job.trackingNumber}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <Calendar className="h-4 w-4" />
              Delivered on {formatDateTime(job.deliveredAt || job.actualDeliveryTime)}
            </CardDescription>
          </div>
          <Badge className="bg-green-500 text-white self-start" data-testid={`badge-delivered-${job.id}`}>
            <CheckCircle className="h-3 w-3 mr-1" />
            Delivered
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Pickup</p>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium" data-testid={`text-pickup-${job.id}`}>{job.pickupAddress}</p>
                  <p className="text-xs text-muted-foreground">{job.pickupPostcode}</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Delivery</p>
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium" data-testid={`text-delivery-${job.id}`}>{job.deliveryAddress}</p>
                  <p className="text-xs text-muted-foreground">{job.deliveryPostcode}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Driver</p>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium" data-testid={`text-driver-${job.id}`}>
                    {driver?.fullName || 'Driver Assigned'}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Truck className="h-3 w-3" />
                    {formatVehicleType(job.vehicleType)}
                    {driver?.vehicleRegistration && (
                      <span className="ml-1">({driver.vehicleRegistration})</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Amount Paid</p>
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-green-600" />
                <p className="text-lg font-bold text-primary" data-testid={`text-price-${job.id}`}>
                  {formatPrice(job.totalPrice)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="details" className="border-0">
            <AccordionTrigger 
              className="text-sm py-2 hover:no-underline"
              data-testid={`button-expand-${job.id}`}
            >
              <span className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4" />
                View Full Details & Proof of Delivery
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-primary" />
                      Price Breakdown
                    </h4>
                    <div className="bg-muted/30 rounded-lg p-4">
                      <PriceBreakdown job={job} />
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      Timeline
                    </h4>
                    <div className="bg-muted/30 rounded-lg p-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Order Created</span>
                        <span>{formatDateTime(job.createdAt)}</span>
                      </div>
                      {job.actualPickupTime && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Collected</span>
                          <span>{formatDateTime(job.actualPickupTime)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium">
                        <span className="text-green-600">Delivered</span>
                        <span>{formatDateTime(job.deliveredAt || job.actualDeliveryTime)}</span>
                      </div>
                    </div>
                  </div>

                  {(job.recipientName || job.recipientPhone) && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <User className="h-4 w-4 text-orange-600" />
                        Recipient
                      </h4>
                      <div className="bg-muted/30 rounded-lg p-4 space-y-1 text-sm">
                        {job.recipientName && (
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span data-testid={`text-recipient-${job.id}`}>{job.recipientName}</span>
                          </div>
                        )}
                        {job.recipientPhone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span>{job.recipientPhone}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Image className="h-4 w-4 text-green-600" />
                    Proof of Delivery
                  </h4>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <PODSection job={job} />
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

export default function DeliveredOrders() {
  const { user } = useAuth();

  const { data: jobs, isLoading: jobsLoading } = useQuery<Job[]>({
    queryKey: ['/api/jobs', { customerId: user?.id }],
    enabled: !!user?.id,
  });

  const deliveredJobs = jobs?.filter(j => j.status === 'delivered') || [];

  const driverIds = Array.from(new Set(deliveredJobs.map(j => j.driverId).filter(Boolean)));
  
  const { data: drivers } = useQuery<Driver[]>({
    queryKey: ['/api/drivers'],
    enabled: driverIds.length > 0,
  });

  const getDriverForJob = (driverId: string | null): Driver | undefined => {
    if (!driverId || !drivers) return undefined;
    return drivers.find(d => d.id === driverId);
  };

  const sortedDeliveredJobs = [...deliveredJobs].sort((a, b) => {
    const dateA = a.deliveredAt || a.actualDeliveryTime || a.createdAt;
    const dateB = b.deliveredAt || b.actualDeliveryTime || b.createdAt;
    return new Date(dateB || 0).getTime() - new Date(dateA || 0).getTime();
  });

  return (
    <DashboardLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <Link href="/customer">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
                <CheckCircle className="h-6 w-6 text-green-600" />
                Delivered Orders
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                View all your completed deliveries with proof of delivery
              </p>
            </div>
          </div>
          <Badge variant="outline" className="self-start text-green-600 border-green-500">
            {sortedDeliveredJobs.length} {sortedDeliveredJobs.length === 1 ? 'Order' : 'Orders'}
          </Badge>
        </div>

        {jobsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : sortedDeliveredJobs.length > 0 ? (
          <div className="space-y-4">
            {sortedDeliveredJobs.map((job) => (
              <DeliveredOrderCard 
                key={job.id} 
                job={job} 
                driver={getDriverForJob(job.driverId)}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Delivered Orders Yet</h3>
              <p className="text-muted-foreground mb-4 max-w-sm">
                Once your orders are delivered, you'll see them here with full details and proof of delivery.
              </p>
              <Link href="/book">
                <Button data-testid="button-book-delivery">
                  Book a Delivery
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
