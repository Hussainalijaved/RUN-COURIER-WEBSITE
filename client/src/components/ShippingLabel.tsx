import { forwardRef } from 'react';
import runCourierLogo from '@assets/run_courier_logo.jpeg';
import type { Job } from '@shared/schema';

interface ShippingLabelProps {
  job: Job;
  driverCode?: string | null;
}

export const ShippingLabel = forwardRef<HTMLDivElement, ShippingLabelProps>(
  ({ job, driverCode }, ref) => {
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

    const generateBarcode = (text: string) => {
      const bars = [];
      const len = Math.min(text.length * 2, 30);
      for (let i = 0; i < len; i++) {
        bars.push(
          <div
            key={i}
            style={{
              width: i % 3 === 0 ? '2px' : '1px',
              height: '30px',
              backgroundColor: i % 2 === 0 ? '#000' : '#fff',
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
        style={{
          width: '4in',
          height: '6in',
          padding: '8px 12px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          boxSizing: 'border-box',
          overflow: 'hidden',
          color: '#000',
          backgroundColor: '#fff',
        }}
        data-testid="shipping-label"
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* ── HEADER ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '5px', borderBottom: '2px solid #000', marginBottom: '5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <img src={runCourierLogo} alt="" style={{ width: '30px', height: '30px', borderRadius: '4px', display: 'block' }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', lineHeight: 1 }}>RUN COURIER</div>
                <div style={{ fontSize: '7px', color: '#666', lineHeight: 1.2 }}>runcourier.co.uk</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '8px', color: '#555', lineHeight: 1.4 }}>
              <div>{formatDate(job.createdAt)}</div>
              {scheduledTime && <div style={{ fontWeight: 'bold', color: '#000' }}>{scheduledTime}</div>}
            </div>
          </div>

          {/* ── BARCODE ── */}
          <div style={{ textAlign: 'center', marginBottom: '6px' }}>
            <div style={{ display: 'inline-flex' }}>{generateBarcode(job.trackingNumber)}</div>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 'bold', letterSpacing: '2px', marginTop: '2px' }}>{job.trackingNumber}</div>
            {j.jobNumber && (
              <div style={{ fontSize: '8px', color: '#666', marginTop: '1px' }}>Job: {j.jobNumber}</div>
            )}
          </div>

          {/* ── FROM ── */}
          <div style={{ border: '1px solid #333', borderRadius: '3px', padding: '6px 8px', marginBottom: '5px' }}>
            <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px', borderBottom: '1px solid #ddd', paddingBottom: '2px' }}>FROM</div>
            {j.pickupBuildingName && (
              <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '1px' }}>{j.pickupBuildingName}</div>
            )}
            <div style={{ fontSize: '10px', lineHeight: 1.3 }}>{job.pickupAddress}</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '2px' }}>{job.pickupPostcode}</div>
            {(j.pickupContactName || j.senderName) && (
              <div style={{ fontSize: '9px', color: '#333', marginTop: '2px' }}>
                {j.pickupContactName || j.senderName}
                {(j.pickupContactPhone || j.senderPhone) && (
                  <span style={{ color: '#888', marginLeft: '6px' }}>{j.pickupContactPhone || j.senderPhone}</span>
                )}
              </div>
            )}
          </div>

          {/* ── TO ── */}
          <div style={{ border: '2.5px solid #000', borderRadius: '3px', padding: '6px 8px', backgroundColor: '#f5f5f5', flex: 1 }}>
            <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px', borderBottom: '1px solid #ccc', paddingBottom: '2px' }}>DELIVER TO</div>
            {j.deliveryBuildingName && (
              <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '1px' }}>{j.deliveryBuildingName}</div>
            )}
            <div style={{ fontSize: '10px', lineHeight: 1.3 }}>{job.deliveryAddress}</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '2px' }}>{job.deliveryPostcode}</div>
            {job.recipientName && (
              <div style={{ fontSize: '9px', color: '#333', marginTop: '2px' }}>
                {job.recipientName}
                {job.recipientPhone && (
                  <span style={{ color: '#888', marginLeft: '6px' }}>{job.recipientPhone}</span>
                )}
              </div>
            )}
            {job.deliveryInstructions && (
              <div style={{ fontSize: '8px', color: '#555', marginTop: '3px', fontStyle: 'italic' }}>{job.deliveryInstructions}</div>
            )}
          </div>

          {/* ── FOOTER ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid #000', marginTop: '5px', paddingTop: '4px', fontSize: '9px', gap: '8px' }}>
            <span><b>{job.vehicleType?.replace('_', ' ')}</b></span>
            {job.weight && <span>{job.weight} kg</span>}
            <span>{j.distance || j.distanceMiles ? `${j.distance || j.distanceMiles} mi` : ''}</span>
            <span>{job.isMultiDrop ? 'Multi-drop' : job.isReturnTrip ? 'Return' : ''}</span>
            {driverCode && <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{driverCode}</span>}
            {j.parcelDescription && (
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px', fontSize: '8px', color: '#555' }}>{j.parcelDescription}</span>
            )}
          </div>

          <div style={{ textAlign: 'center', fontSize: '6px', color: '#aaa', marginTop: '3px' }}>
            Same Day Delivery &#8226; Tracked & Insured &#8226; runcourier.co.uk
          </div>
        </div>
      </div>
    );
  }
);

ShippingLabel.displayName = 'ShippingLabel';
