import { forwardRef } from 'react';
import { MapPin, Phone, User, Clock, Package } from 'lucide-react';
import runCourierLogo from '@assets/run_courier_logo.jpeg';
import type { Job } from '@shared/schema';

interface MultiDropStop {
  id: number;
  address: string;
  postcode: string;
  stopOrder: number;
  recipientName?: string;
  recipientPhone?: string;
  deliveryInstructions?: string;
  buildingName?: string;
}

interface MultiDropShippingLabelsProps {
  job: Job;
  stops: MultiDropStop[];
  driverName?: string;
}

interface LabelData {
  fromAddress: string;
  fromPostcode: string;
  fromBuildingName?: string;
  fromContactName?: string;
  fromContactPhone?: string;
  toAddress: string;
  toPostcode: string;
  toBuildingName?: string;
  recipientName?: string;
  recipientPhone?: string;
  deliveryInstructions?: string;
  stopNumber: number;
  totalStops: number;
  isPickup: boolean;
  isFinalDelivery: boolean;
}

export const MultiDropShippingLabels = forwardRef<HTMLDivElement, MultiDropShippingLabelsProps>(
  ({ job, stops, driverName }, ref) => {
    const j = job as any;

    const formatDate = (date: Date | string | null) => {
      if (!date) return new Date().toLocaleDateString('en-GB');
      return new Date(date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    };

    const formatTime = (date: Date | string | null) => {
      if (!date) return null;
      return new Date(date).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const generateBarcode = (trackingNumber: string, stopNum: number) => {
      const bars = [];
      const code = `${trackingNumber}-${stopNum}`.toUpperCase();
      for (let i = 0; i < code.length * 4; i++) {
        const width = (i % 3 === 0) ? 3 : (i % 2 === 0) ? 2 : 1;
        const isBlack = i % 2 === 0;
        bars.push(
          <div
            key={i}
            style={{
              width: `${width}px`,
              height: '30px',
              backgroundColor: isBlack ? '#000' : '#fff',
            }}
          />
        );
      }
      return bars;
    };

    const sortedStops = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
    const totalStops = sortedStops.length + 1;
    const scheduledTime = formatTime(j.scheduledPickupTime);

    const labels: LabelData[] = [];

    if (sortedStops.length > 0) {
      labels.push({
        fromAddress: job.pickupAddress,
        fromPostcode: job.pickupPostcode,
        fromBuildingName: j.pickupBuildingName,
        fromContactName: j.pickupContactName || j.senderName,
        fromContactPhone: j.pickupContactPhone || j.senderPhone,
        toAddress: sortedStops[0].address,
        toPostcode: sortedStops[0].postcode,
        toBuildingName: sortedStops[0].buildingName,
        recipientName: sortedStops[0].recipientName,
        recipientPhone: sortedStops[0].recipientPhone,
        deliveryInstructions: sortedStops[0].deliveryInstructions,
        stopNumber: 1,
        totalStops,
        isPickup: true,
        isFinalDelivery: false,
      });

      for (let i = 0; i < sortedStops.length - 1; i++) {
        labels.push({
          fromAddress: sortedStops[i].address,
          fromPostcode: sortedStops[i].postcode,
          fromBuildingName: sortedStops[i].buildingName,
          toAddress: sortedStops[i + 1].address,
          toPostcode: sortedStops[i + 1].postcode,
          toBuildingName: sortedStops[i + 1].buildingName,
          recipientName: sortedStops[i + 1].recipientName,
          recipientPhone: sortedStops[i + 1].recipientPhone,
          deliveryInstructions: sortedStops[i + 1].deliveryInstructions,
          stopNumber: i + 2,
          totalStops,
          isPickup: false,
          isFinalDelivery: false,
        });
      }

      labels.push({
        fromAddress: sortedStops[sortedStops.length - 1].address,
        fromPostcode: sortedStops[sortedStops.length - 1].postcode,
        fromBuildingName: sortedStops[sortedStops.length - 1].buildingName,
        toAddress: job.deliveryAddress,
        toPostcode: job.deliveryPostcode,
        toBuildingName: j.deliveryBuildingName,
        recipientName: job.recipientName || undefined,
        recipientPhone: job.recipientPhone || undefined,
        deliveryInstructions: job.deliveryInstructions || undefined,
        stopNumber: totalStops,
        totalStops,
        isPickup: false,
        isFinalDelivery: true,
      });
    } else {
      labels.push({
        fromAddress: job.pickupAddress,
        fromPostcode: job.pickupPostcode,
        fromBuildingName: j.pickupBuildingName,
        fromContactName: j.pickupContactName || j.senderName,
        fromContactPhone: j.pickupContactPhone || j.senderPhone,
        toAddress: job.deliveryAddress,
        toPostcode: job.deliveryPostcode,
        toBuildingName: j.deliveryBuildingName,
        recipientName: job.recipientName || undefined,
        recipientPhone: job.recipientPhone || undefined,
        deliveryInstructions: job.deliveryInstructions || undefined,
        stopNumber: 1,
        totalStops: 1,
        isPickup: true,
        isFinalDelivery: true,
      });
    }

    const renderLabel = (label: LabelData, index: number) => (
      <div
        key={index}
        className="bg-white text-black p-3"
        style={{
          width: '4in',
          height: '6in',
          fontFamily: 'Arial, sans-serif',
          boxSizing: 'border-box',
          pageBreakAfter: index < labels.length - 1 ? 'always' : 'auto',
        }}
        data-testid={`shipping-label-stop-${label.stopNumber}`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between border-b-2 border-black pb-1.5 mb-1.5">
            <div className="flex items-center gap-1.5">
              <img 
                src={runCourierLogo} 
                alt="Run Courier" 
                style={{
                  height: '36px',
                  width: 'auto',
                  objectFit: 'contain',
                  borderRadius: '5px',
                }}
              />
              <p style={{ fontSize: '11px', fontWeight: 'bold', margin: '0', color: '#000' }}>RUN COURIER&#8482;</p>
            </div>
            <div 
              style={{ 
                backgroundColor: '#000', 
                color: '#fff', 
                padding: '3px 10px', 
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
              }}
            >
              STOP {label.stopNumber}/{label.totalStops}
            </div>
            <div className="text-right">
              <p style={{ fontSize: '8px', color: '#444', margin: 0 }}>www.runcourier.co.uk</p>
              <p style={{ fontSize: '8px', color: '#444', margin: 0 }}>+44 20 4634 6100</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-1">
            {j.jobNumber && (
              <div>
                <span style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Job No.</span>
                <p className="font-mono text-xs font-bold" style={{ margin: '0' }}>{j.jobNumber}</p>
              </div>
            )}
            <div className="flex justify-center items-center flex-1">
              <div className="flex">{generateBarcode(job.trackingNumber, label.stopNumber)}</div>
            </div>
            <div className="text-right">
              <span style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</span>
              <p className="font-bold" style={{ fontSize: '10px', margin: 0 }}>{formatDate(job.createdAt)}</p>
            </div>
          </div>
          <p className="text-center font-mono font-bold tracking-widest mb-1" style={{ fontSize: '10px' }}>
            {job.trackingNumber}-{label.stopNumber}
          </p>

          <div className="flex-1 space-y-1.5">
            <div className="border border-black rounded p-2">
              <div className="flex items-center gap-1 mb-1">
                <div className="bg-black text-white rounded-full p-0.5">
                  <MapPin className="h-2.5 w-2.5" />
                </div>
                <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#000' }}>
                  {label.isPickup ? 'Pickup' : `From Stop ${label.stopNumber - 1}`}
                </span>
                {label.isPickup && scheduledTime && (
                  <span className="ml-auto flex items-center gap-0.5" style={{ fontSize: '9px', fontWeight: 'bold', color: '#007BFF' }}>
                    <Clock className="h-2.5 w-2.5" />
                    {scheduledTime}
                  </span>
                )}
              </div>
              {label.fromBuildingName && (
                <p style={{ fontSize: '11px', fontWeight: 'bold', margin: '0 0 1px', color: '#000' }}>{label.fromBuildingName}</p>
              )}
              <p style={{ fontSize: '10px', fontWeight: '600', lineHeight: '1.2', margin: 0 }}>{label.fromAddress}</p>
              <p className="font-bold font-mono" style={{ fontSize: '14px', margin: '2px 0 0' }}>{label.fromPostcode}</p>
              {label.fromContactName && (
                <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: '9px' }}>
                  <User className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="font-semibold">{label.fromContactName}</span>
                  {label.fromContactPhone && (
                    <>
                      <span style={{ color: '#999' }}>|</span>
                      <Phone className="h-2.5 w-2.5 flex-shrink-0" />
                      <span>{label.fromContactPhone}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="border-2 border-black rounded p-2" style={{ backgroundColor: '#f3f4f6' }}>
              <div className="flex items-center gap-1 mb-1">
                <div className="bg-black text-white rounded-full p-0.5">
                  <MapPin className="h-2.5 w-2.5" />
                </div>
                <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#000' }}>
                  {label.isFinalDelivery ? 'Final Delivery' : `Deliver To Stop ${label.stopNumber}`}
                </span>
              </div>
              {label.toBuildingName && (
                <p style={{ fontSize: '11px', fontWeight: 'bold', margin: '0 0 1px', color: '#000' }}>{label.toBuildingName}</p>
              )}
              <p style={{ fontSize: '10px', fontWeight: '600', lineHeight: '1.2', margin: 0 }}>{label.toAddress}</p>
              <p className="font-bold font-mono" style={{ fontSize: '17px', margin: '2px 0 0' }}>{label.toPostcode}</p>
              {label.recipientName && (
                <div className="flex items-center gap-1 mt-0.5" style={{ fontSize: '9px' }}>
                  <User className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="font-semibold">{label.recipientName}</span>
                  {label.recipientPhone && (
                    <>
                      <span style={{ color: '#999' }}>|</span>
                      <Phone className="h-2.5 w-2.5 flex-shrink-0" />
                      <span>{label.recipientPhone}</span>
                    </>
                  )}
                </div>
              )}
              {label.deliveryInstructions && (
                <p style={{ fontSize: '8px', color: '#555', marginTop: '2px', fontStyle: 'italic' }}>{label.deliveryInstructions}</p>
              )}
            </div>
          </div>

          <div className="border-t border-black pt-1.5 mt-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '2px', textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: '7px', color: '#666', margin: 0 }}>Weight</p>
              <p style={{ fontSize: '9px', fontWeight: 'bold', margin: 0 }}>{job.weight || '—'} kg</p>
            </div>
            <div>
              <p style={{ fontSize: '7px', color: '#666', margin: 0 }}>Vehicle</p>
              <p style={{ fontSize: '9px', fontWeight: 'bold', margin: 0, textTransform: 'capitalize' }}>{job.vehicleType?.replace('_', ' ') || '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: '7px', color: '#666', margin: 0 }}>Type</p>
              <p style={{ fontSize: '9px', fontWeight: 'bold', margin: 0 }}>Multi-Drop</p>
            </div>
            <div>
              <p style={{ fontSize: '7px', color: '#666', margin: 0 }}>Distance</p>
              <p style={{ fontSize: '9px', fontWeight: 'bold', margin: 0 }}>{j.distance || j.distanceMiles || '—'} mi</p>
            </div>
            {driverName && (
              <div>
                <p style={{ fontSize: '7px', color: '#666', margin: 0 }}>Driver</p>
                <p style={{ fontSize: '9px', fontWeight: 'bold', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driverName}</p>
              </div>
            )}
          </div>

          {j.parcelDescription && (
            <div className="border-t border-dashed border-gray-400 pt-0.5 mt-0.5">
              <div className="flex items-center gap-1" style={{ fontSize: '8px', color: '#555' }}>
                <Package className="h-2.5 w-2.5 flex-shrink-0" />
                <span className="font-semibold">Parcel:</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.parcelDescription}</span>
              </div>
            </div>
          )}

          <div className="border-t border-dashed border-gray-400 pt-0.5 mt-0.5 text-center">
            <p style={{ fontSize: '7px', color: '#666', margin: 0 }}>
              Same Day Delivery | Tracked & Insured | www.runcourier.co.uk
            </p>
          </div>
        </div>
      </div>
    );

    return (
      <div ref={ref} data-testid="multi-drop-shipping-labels">
        {labels.map((label, index) => renderLabel(label, index))}
      </div>
    );
  }
);

MultiDropShippingLabels.displayName = 'MultiDropShippingLabels';
