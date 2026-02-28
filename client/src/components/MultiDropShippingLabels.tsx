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
      const totalBars = Math.min(code.length * 3, 40);
      for (let i = 0; i < totalBars; i++) {
        const width = (i % 3 === 0) ? 2 : 1;
        const isBlack = i % 2 === 0;
        bars.push(
          <div
            key={i}
            style={{
              width: `${width}px`,
              height: '28px',
              backgroundColor: isBlack ? '#000' : '#fff',
              flexShrink: 0,
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
        className="bg-white text-black"
        style={{
          width: '4in',
          height: '6in',
          padding: '10px 14px',
          fontFamily: 'Arial, sans-serif',
          boxSizing: 'border-box',
          overflow: 'hidden',
          pageBreakAfter: index < labels.length - 1 ? 'always' : 'auto',
        }}
        data-testid={`shipping-label-stop-${label.stopNumber}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* HEADER */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '5px', marginBottom: '5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <img 
                src={runCourierLogo} 
                alt="Run Courier" 
                style={{
                  height: '32px',
                  width: '32px',
                  objectFit: 'contain',
                  borderRadius: '4px',
                  flexShrink: 0,
                  display: 'block',
                }}
              />
              <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#000', whiteSpace: 'nowrap' }}>RUN COURIER&#8482;</span>
            </div>
            <div 
              style={{ 
                backgroundColor: '#000', 
                color: '#fff', 
                padding: '3px 10px', 
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {label.stopNumber}/{label.totalStops}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '8px', color: '#444' }}>www.runcourier.co.uk</div>
              <div style={{ fontSize: '8px', color: '#444' }}>+44 20 4634 6100</div>
            </div>
          </div>

          {/* TRACKING ROW */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
            {j.jobNumber && (
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: '7px', color: '#888', textTransform: 'uppercase' }}>Job</div>
                <div style={{ fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}>{j.jobNumber}</div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, overflow: 'hidden', margin: '0 6px' }}>
              <div style={{ display: 'flex', flexShrink: 0 }}>{generateBarcode(job.trackingNumber, label.stopNumber)}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '7px', color: '#888', textTransform: 'uppercase' }}>Date</div>
              <div style={{ fontSize: '9px', fontWeight: 'bold' }}>{formatDate(job.createdAt)}</div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '9px', fontWeight: 'bold', letterSpacing: '1.5px', marginBottom: '6px' }}>
            {job.trackingNumber}-{label.stopNumber}
          </div>

          {/* FROM */}
          <div style={{ border: '1px solid #000', borderRadius: '4px', padding: '6px', marginBottom: '5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '3px' }}>
              <div style={{ backgroundColor: '#000', color: '#fff', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin style={{ width: '9px', height: '9px' }} />
              </div>
              <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#000' }}>
                {label.isPickup ? 'Pickup' : `From Stop ${label.stopNumber - 1}`}
              </span>
              {label.isPickup && scheduledTime && (
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '9px', fontWeight: 'bold', color: '#007BFF' }}>
                  <Clock style={{ width: '9px', height: '9px' }} />
                  {scheduledTime}
                </span>
              )}
            </div>
            {label.fromBuildingName && (
              <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#000', marginBottom: '1px' }}>{label.fromBuildingName}</div>
            )}
            <div style={{ fontSize: '9px', fontWeight: '600', lineHeight: '1.3' }}>{label.fromAddress}</div>
            <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '1px' }}>{label.fromPostcode}</div>
            {label.fromContactName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '2px', fontSize: '8px' }}>
                <User style={{ width: '9px', height: '9px', flexShrink: 0 }} />
                <span style={{ fontWeight: '600' }}>{label.fromContactName}</span>
                {label.fromContactPhone && (
                  <>
                    <span style={{ color: '#aaa' }}>|</span>
                    <Phone style={{ width: '9px', height: '9px', flexShrink: 0 }} />
                    <span>{label.fromContactPhone}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* TO */}
          <div style={{ border: '2px solid #000', borderRadius: '4px', padding: '6px', backgroundColor: '#f5f5f5', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '3px' }}>
              <div style={{ backgroundColor: '#000', color: '#fff', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin style={{ width: '9px', height: '9px' }} />
              </div>
              <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', color: '#000' }}>
                {label.isFinalDelivery ? 'Final Delivery' : `Deliver To Stop ${label.stopNumber}`}
              </span>
            </div>
            {label.toBuildingName && (
              <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#000', marginBottom: '1px' }}>{label.toBuildingName}</div>
            )}
            <div style={{ fontSize: '9px', fontWeight: '600', lineHeight: '1.3' }}>{label.toAddress}</div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '1px' }}>{label.toPostcode}</div>
            {label.recipientName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '2px', fontSize: '8px' }}>
                <User style={{ width: '9px', height: '9px', flexShrink: 0 }} />
                <span style={{ fontWeight: '600' }}>{label.recipientName}</span>
                {label.recipientPhone && (
                  <>
                    <span style={{ color: '#aaa' }}>|</span>
                    <Phone style={{ width: '9px', height: '9px', flexShrink: 0 }} />
                    <span>{label.recipientPhone}</span>
                  </>
                )}
              </div>
            )}
            {label.deliveryInstructions && (
              <div style={{ fontSize: '8px', color: '#555', marginTop: '2px', fontStyle: 'italic' }}>{label.deliveryInstructions}</div>
            )}
          </div>

          {/* BOTTOM DETAILS */}
          <div style={{ borderTop: '2px solid #000', paddingTop: '5px', marginTop: '5px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: driverName ? '1fr 1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '3px', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '7px', color: '#555', fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Weight</div>
                <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{job.weight || '—'} kg</div>
              </div>
              <div>
                <div style={{ fontSize: '7px', color: '#555', fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Vehicle</div>
                <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'capitalize' }}>{job.vehicleType?.replace('_', ' ') || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: '7px', color: '#555', fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Type</div>
                <div style={{ fontSize: '10px', fontWeight: 'bold' }}>Multi-Drop</div>
              </div>
              <div>
                <div style={{ fontSize: '7px', color: '#555', fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Distance</div>
                <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{j.distance || j.distanceMiles || '—'} mi</div>
              </div>
              {driverName && (
                <div>
                  <div style={{ fontSize: '7px', color: '#555', fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Driver</div>
                  <div style={{ fontSize: '9px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driverName}</div>
                </div>
              )}
            </div>
            {j.parcelDescription && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '8px', color: '#555', marginTop: '3px', borderTop: '1px dashed #ccc', paddingTop: '2px' }}>
                <Package style={{ width: '9px', height: '9px', flexShrink: 0 }} />
                <span style={{ fontWeight: '600' }}>Parcel:</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.parcelDescription}</span>
              </div>
            )}
          </div>

          {/* TAGLINE */}
          <div style={{ borderTop: '1px dashed #bbb', paddingTop: '2px', marginTop: '3px', textAlign: 'center' }}>
            <div style={{ fontSize: '7px', color: '#888' }}>
              Same Day Delivery | Tracked & Insured | www.runcourier.co.uk
            </div>
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
