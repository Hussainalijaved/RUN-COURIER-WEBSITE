import { forwardRef } from 'react';
import { MapPin, Phone, User, Clock, Package } from 'lucide-react';
import runCourierLogo from '@assets/run_courier_logo.jpeg';
import type { Job } from '@shared/schema';

interface ShippingLabelProps {
  job: Job;
  driverName?: string;
}

export const ShippingLabel = forwardRef<HTMLDivElement, ShippingLabelProps>(
  ({ job, driverName }, ref) => {
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

    const generateBarcode = (trackingNumber: string) => {
      const bars = [];
      const code = trackingNumber.toUpperCase();
      const totalBars = Math.min(code.length * 3, 40);
      for (let i = 0; i < totalBars; i++) {
        const width = (i % 3 === 0) ? 2 : 1;
        const isBlack = i % 2 === 0;
        bars.push(
          <div
            key={i}
            style={{
              width: `${width}px`,
              height: '32px',
              backgroundColor: isBlack ? '#000' : '#fff',
              flexShrink: 0,
            }}
          />
        );
      }
      return bars;
    };

    const scheduledTime = formatTime(j.scheduledPickupTime);

    return (
      <div
        ref={ref}
        className="bg-white text-black"
        style={{
          width: '4in',
          height: '6in',
          padding: '12px 16px',
          fontFamily: 'Arial, sans-serif',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
        data-testid="shipping-label"
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* HEADER */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <img 
                src={runCourierLogo} 
                alt="Run Courier" 
                style={{
                  height: '36px',
                  width: '36px',
                  objectFit: 'contain',
                  borderRadius: '5px',
                  flexShrink: 0,
                  display: 'block',
                }}
              />
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#000', whiteSpace: 'nowrap' }}>RUN COURIER&#8482;</span>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '9px', color: '#444' }}>www.runcourier.co.uk</div>
              <div style={{ fontSize: '9px', color: '#444' }}>+44 20 4634 6100</div>
            </div>
          </div>

          {/* TRACKING ROW */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            {j.jobNumber && (
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: '7px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Job</div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace' }}>{j.jobNumber}</div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, overflow: 'hidden', margin: '0 8px' }}>
              <div style={{ display: 'flex', flexShrink: 0 }}>{generateBarcode(job.trackingNumber)}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '7px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</div>
              <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{formatDate(job.createdAt)}</div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '11px', fontWeight: 'bold', letterSpacing: '2px', marginBottom: '8px' }}>
            {job.trackingNumber}
          </div>

          {/* PICKUP */}
          <div style={{ border: '1px solid #000', borderRadius: '4px', padding: '8px', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <div style={{ backgroundColor: '#000', color: '#fff', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin style={{ width: '10px', height: '10px' }} />
              </div>
              <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#000' }}>From / Pickup</span>
              {scheduledTime && (
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', fontWeight: 'bold', color: '#007BFF' }}>
                  <Clock style={{ width: '10px', height: '10px' }} />
                  {scheduledTime}
                </span>
              )}
            </div>
            {j.pickupBuildingName && (
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#000', marginBottom: '1px' }}>{j.pickupBuildingName}</div>
            )}
            <div style={{ fontSize: '10px', fontWeight: '600', lineHeight: '1.3' }}>{job.pickupAddress}</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '2px' }}>{job.pickupPostcode}</div>
            {(j.pickupContactName || j.senderName) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px', fontSize: '9px' }}>
                <User style={{ width: '10px', height: '10px', flexShrink: 0 }} />
                <span style={{ fontWeight: '600' }}>{j.pickupContactName || j.senderName}</span>
                {(j.pickupContactPhone || j.senderPhone) && (
                  <>
                    <span style={{ color: '#aaa', margin: '0 1px' }}>|</span>
                    <Phone style={{ width: '10px', height: '10px', flexShrink: 0 }} />
                    <span>{j.pickupContactPhone || j.senderPhone}</span>
                  </>
                )}
              </div>
            )}
            {job.pickupInstructions && (
              <div style={{ fontSize: '8px', color: '#555', marginTop: '2px', fontStyle: 'italic' }}>{job.pickupInstructions}</div>
            )}
          </div>

          {/* DELIVERY */}
          <div style={{ border: '2px solid #000', borderRadius: '4px', padding: '8px', backgroundColor: '#f5f5f5', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
              <div style={{ backgroundColor: '#000', color: '#fff', borderRadius: '50%', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin style={{ width: '10px', height: '10px' }} />
              </div>
              <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#000' }}>To / Delivery</span>
            </div>
            {j.deliveryBuildingName && (
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#000', marginBottom: '1px' }}>{j.deliveryBuildingName}</div>
            )}
            <div style={{ fontSize: '10px', fontWeight: '600', lineHeight: '1.3' }}>{job.deliveryAddress}</div>
            <div style={{ fontSize: '17px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '2px' }}>{job.deliveryPostcode}</div>
            {job.recipientName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px', fontSize: '9px' }}>
                <User style={{ width: '10px', height: '10px', flexShrink: 0 }} />
                <span style={{ fontWeight: '600' }}>{job.recipientName}</span>
                {job.recipientPhone && (
                  <>
                    <span style={{ color: '#aaa', margin: '0 1px' }}>|</span>
                    <Phone style={{ width: '10px', height: '10px', flexShrink: 0 }} />
                    <span>{job.recipientPhone}</span>
                  </>
                )}
              </div>
            )}
            {job.deliveryInstructions && (
              <div style={{ fontSize: '8px', color: '#555', marginTop: '2px', fontStyle: 'italic' }}>{job.deliveryInstructions}</div>
            )}
          </div>

          {/* BOTTOM DETAILS */}
          <div style={{ borderTop: '2px solid #000', paddingTop: '6px', marginTop: '6px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: driverName ? '1fr 1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '4px', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '8px', color: '#555', fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Weight</div>
                <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{job.weight || '—'} kg</div>
              </div>
              <div>
                <div style={{ fontSize: '8px', color: '#555', fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Vehicle</div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'capitalize' }}>{job.vehicleType?.replace('_', ' ') || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: '8px', color: '#555', fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Type</div>
                <div style={{ fontSize: '11px', fontWeight: 'bold' }}>
                  {job.isMultiDrop ? 'Multi' : job.isReturnTrip ? 'Return' : 'Standard'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '8px', color: '#555', fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Distance</div>
                <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{j.distance || j.distanceMiles || '—'} mi</div>
              </div>
              {driverName && (
                <div>
                  <div style={{ fontSize: '8px', color: '#555', fontWeight: '600', textTransform: 'uppercase', marginBottom: '1px' }}>Driver</div>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driverName}</div>
                </div>
              )}
            </div>
            {j.parcelDescription && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9px', color: '#555', marginTop: '4px', borderTop: '1px dashed #ccc', paddingTop: '3px' }}>
                <Package style={{ width: '10px', height: '10px', flexShrink: 0 }} />
                <span style={{ fontWeight: '600' }}>Parcel:</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.parcelDescription}</span>
              </div>
            )}
          </div>

          {/* TAGLINE */}
          <div style={{ borderTop: '1px dashed #bbb', paddingTop: '3px', marginTop: '4px', textAlign: 'center' }}>
            <div style={{ fontSize: '7px', color: '#888' }}>
              Same Day Delivery | Tracked & Insured | www.runcourier.co.uk
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ShippingLabel.displayName = 'ShippingLabel';
