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
      for (let i = 0; i < code.length * 5; i++) {
        const width = (i % 3 === 0) ? 3 : (i % 2 === 0) ? 2 : 1;
        const isBlack = i % 2 === 0;
        bars.push(
          <div
            key={i}
            style={{
              width: `${width}px`,
              height: '35px',
              backgroundColor: isBlack ? '#000' : '#fff',
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
        className="bg-white text-black p-3"
        style={{
          width: '4in',
          height: '6in',
          fontFamily: 'Arial, sans-serif',
          boxSizing: 'border-box',
        }}
        data-testid="shipping-label"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between border-b-2 border-black pb-1.5 mb-1.5">
            <div className="flex items-center gap-2">
              <img 
                src={runCourierLogo} 
                alt="Run Courier" 
                style={{
                  height: '40px',
                  width: 'auto',
                  objectFit: 'contain',
                  borderRadius: '6px',
                }}
              />
              <div style={{ lineHeight: '1', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0', color: '#000' }}>RUN COURIER&#8482;</p>
              </div>
            </div>
            <div className="text-right">
              <p style={{ fontSize: '9px', color: '#444', margin: 0 }}>www.runcourier.co.uk</p>
              <p style={{ fontSize: '9px', color: '#444', margin: 0 }}>+44 20 4634 6100</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-1">
            {j.jobNumber && (
              <div>
                <span style={{ fontSize: '8px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Job No.</span>
                <p className="font-mono text-sm font-bold" style={{ margin: '0' }}>{j.jobNumber}</p>
              </div>
            )}
            <div className="flex justify-center items-center flex-1">
              <div className="flex">{generateBarcode(job.trackingNumber)}</div>
            </div>
            <div className="text-right">
              <span style={{ fontSize: '8px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</span>
              <p className="font-bold text-xs" style={{ margin: 0 }}>{formatDate(job.createdAt)}</p>
            </div>
          </div>
          <p className="text-center font-mono text-xs font-bold tracking-widest mb-1.5">
            {job.trackingNumber}
          </p>

          <div className="flex-1 space-y-1.5">
            <div className="border border-black rounded p-2">
              <div className="flex items-center gap-1 mb-1">
                <div className="bg-black text-white rounded-full p-0.5">
                  <MapPin className="h-2.5 w-2.5" />
                </div>
                <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#000' }}>From / Pickup</span>
                {scheduledTime && (
                  <span className="ml-auto flex items-center gap-0.5" style={{ fontSize: '10px', fontWeight: 'bold', color: '#007BFF' }}>
                    <Clock className="h-2.5 w-2.5" />
                    {scheduledTime}
                  </span>
                )}
              </div>
              {j.pickupBuildingName && (
                <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 1px', color: '#000' }}>{j.pickupBuildingName}</p>
              )}
              <p style={{ fontSize: '11px', fontWeight: '600', lineHeight: '1.2', margin: 0 }}>{job.pickupAddress}</p>
              <p className="font-bold font-mono" style={{ fontSize: '15px', margin: '2px 0 0' }}>{job.pickupPostcode}</p>
              {(j.pickupContactName || j.senderName) && (
                <div className="flex items-center gap-1 mt-1" style={{ fontSize: '10px' }}>
                  <User className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="font-semibold">{j.pickupContactName || j.senderName}</span>
                  {(j.pickupContactPhone || j.senderPhone) && (
                    <>
                      <span style={{ color: '#999' }}>|</span>
                      <Phone className="h-2.5 w-2.5 flex-shrink-0" />
                      <span>{j.pickupContactPhone || j.senderPhone}</span>
                    </>
                  )}
                </div>
              )}
              {job.pickupInstructions && (
                <p style={{ fontSize: '9px', color: '#555', marginTop: '2px', fontStyle: 'italic' }}>{job.pickupInstructions}</p>
              )}
            </div>

            <div className="border-2 border-black rounded p-2" style={{ backgroundColor: '#f3f4f6' }}>
              <div className="flex items-center gap-1 mb-1">
                <div className="bg-black text-white rounded-full p-0.5">
                  <MapPin className="h-2.5 w-2.5" />
                </div>
                <span style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#000' }}>To / Delivery</span>
              </div>
              {j.deliveryBuildingName && (
                <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 1px', color: '#000' }}>{j.deliveryBuildingName}</p>
              )}
              <p style={{ fontSize: '11px', fontWeight: '600', lineHeight: '1.2', margin: 0 }}>{job.deliveryAddress}</p>
              <p className="font-bold font-mono" style={{ fontSize: '18px', margin: '2px 0 0' }}>{job.deliveryPostcode}</p>
              {job.recipientName && (
                <div className="flex items-center gap-1 mt-1" style={{ fontSize: '10px' }}>
                  <User className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="font-semibold">{job.recipientName}</span>
                  {job.recipientPhone && (
                    <>
                      <span style={{ color: '#999' }}>|</span>
                      <Phone className="h-2.5 w-2.5 flex-shrink-0" />
                      <span>{job.recipientPhone}</span>
                    </>
                  )}
                </div>
              )}
              {job.deliveryInstructions && (
                <p style={{ fontSize: '9px', color: '#555', marginTop: '2px', fontStyle: 'italic' }}>{job.deliveryInstructions}</p>
              )}
            </div>
          </div>

          <div className="border-t border-black pt-1.5 mt-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '2px', textAlign: 'center' }}>
            <div>
              <p style={{ fontSize: '8px', color: '#666', margin: 0 }}>Weight</p>
              <p style={{ fontSize: '10px', fontWeight: 'bold', margin: 0 }}>{job.weight || '—'} kg</p>
            </div>
            <div>
              <p style={{ fontSize: '8px', color: '#666', margin: 0 }}>Vehicle</p>
              <p style={{ fontSize: '10px', fontWeight: 'bold', margin: 0, textTransform: 'capitalize' }}>{job.vehicleType?.replace('_', ' ') || '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: '8px', color: '#666', margin: 0 }}>Type</p>
              <p style={{ fontSize: '10px', fontWeight: 'bold', margin: 0 }}>
                {job.isMultiDrop ? 'Multi' : job.isReturnTrip ? 'Return' : 'Standard'}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '8px', color: '#666', margin: 0 }}>Distance</p>
              <p style={{ fontSize: '10px', fontWeight: 'bold', margin: 0 }}>{j.distance || j.distanceMiles || '—'} mi</p>
            </div>
            {driverName && (
              <div>
                <p style={{ fontSize: '8px', color: '#666', margin: 0 }}>Driver</p>
                <p style={{ fontSize: '10px', fontWeight: 'bold', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driverName}</p>
              </div>
            )}
          </div>

          {j.parcelDescription && (
            <div className="border-t border-dashed border-gray-400 pt-1 mt-0.5">
              <div className="flex items-center gap-1" style={{ fontSize: '9px', color: '#555' }}>
                <Package className="h-2.5 w-2.5 flex-shrink-0" />
                <span className="font-semibold">Parcel:</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.parcelDescription}</span>
              </div>
            </div>
          )}

          <div className="border-t border-dashed border-gray-400 pt-1 mt-0.5 text-center">
            <p style={{ fontSize: '8px', color: '#666', margin: 0 }}>
              Same Day Delivery | Tracked & Insured | www.runcourier.co.uk
            </p>
          </div>
        </div>
      </div>
    );
  }
);

ShippingLabel.displayName = 'ShippingLabel';
