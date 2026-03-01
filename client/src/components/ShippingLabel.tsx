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
      const len = Math.min(text.length * 2 + 8, 40);
      for (let i = 0; i < len; i++) {
        bars.push(
          <div
            key={i}
            style={{
              width: i % 3 === 0 ? '2.5px' : '1px',
              height: '40px',
              backgroundColor: i % 2 === 0 ? '#000' : '#fff',
            }}
          />
        );
      }
      return bars;
    };

    const scheduledTime = formatTime(j.scheduledPickupTime);
    const b = '1.5px solid #000';

    return (
      <div
        ref={ref}
        style={{
          width: '4in',
          height: '6in',
          fontFamily: 'Arial, Helvetica, sans-serif',
          boxSizing: 'border-box',
          overflow: 'hidden',
          color: '#000',
          backgroundColor: '#fff',
          border: '2px solid #000',
        }}
        data-testid="shipping-label"
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* ═══ ROW 1: HEADER ═══ */}
          <div style={{ display: 'flex', borderBottom: b }}>
            <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
              <img src={runCourierLogo} alt="" style={{ width: '28px', height: '28px', borderRadius: '3px' }} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.5px', lineHeight: 1 }}>RUN COURIER</div>
                <div style={{ fontSize: '7px', color: '#555' }}>runcourier.co.uk | 020 4634 6100</div>
              </div>
            </div>
            <div style={{ borderLeft: b, padding: '6px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: '70px' }}>
              <div style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</div>
              <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{formatDate(job.createdAt)}</div>
            </div>
            {j.jobNumber && (
              <div style={{ borderLeft: b, padding: '6px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: '55px' }}>
                <div style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Job #</div>
                <div style={{ fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}>{j.jobNumber}</div>
              </div>
            )}
          </div>

          {/* ═══ ROW 2: BARCODE ═══ */}
          <div style={{ borderBottom: b, padding: '6px 0', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex' }}>{generateBarcode(job.trackingNumber)}</div>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 'bold', letterSpacing: '3px', marginTop: '2px' }}>{job.trackingNumber}</div>
          </div>

          {/* ═══ ROW 3: FROM (PICKUP) ═══ */}
          <div style={{ borderBottom: b, display: 'flex' }}>
            <div style={{ backgroundColor: '#000', color: '#fff', padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)', fontSize: '9px', fontWeight: 'bold', letterSpacing: '2px', minWidth: '20px' }}>
              FROM
            </div>
            <div style={{ padding: '6px 10px', flex: 1 }}>
              {j.pickupBuildingName && (
                <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '1px' }}>{j.pickupBuildingName}</div>
              )}
              <div style={{ fontSize: '10px', lineHeight: 1.3 }}>{job.pickupAddress}</div>
              <div style={{ fontSize: '15px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '2px', letterSpacing: '1px' }}>{job.pickupPostcode}</div>
              {(j.pickupContactName || j.senderName) && (
                <div style={{ fontSize: '9px', marginTop: '3px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: '600' }}>{j.pickupContactName || j.senderName}</span>
                  {(j.pickupContactPhone || j.senderPhone) && (
                    <span style={{ color: '#555' }}>{j.pickupContactPhone || j.senderPhone}</span>
                  )}
                </div>
              )}
              {scheduledTime && (
                <div style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '2px' }}>Collect by: {scheduledTime}</div>
              )}
              {job.pickupInstructions && (
                <div style={{ fontSize: '8px', color: '#555', fontStyle: 'italic', marginTop: '2px' }}>{job.pickupInstructions}</div>
              )}
            </div>
          </div>

          {/* ═══ ROW 4: TO (DELIVERY) — largest section ═══ */}
          <div style={{ borderBottom: b, display: 'flex', flex: 1 }}>
            <div style={{ backgroundColor: '#000', color: '#fff', padding: '0 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)', fontSize: '10px', fontWeight: 'bold', letterSpacing: '2px', minWidth: '22px' }}>
              TO
            </div>
            <div style={{ padding: '8px 10px', flex: 1, backgroundColor: '#fafafa' }}>
              {j.deliveryBuildingName && (
                <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '1px' }}>{j.deliveryBuildingName}</div>
              )}
              <div style={{ fontSize: '11px', lineHeight: 1.3 }}>{job.deliveryAddress}</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '3px', letterSpacing: '2px' }}>{job.deliveryPostcode}</div>
              {job.recipientName && (
                <div style={{ fontSize: '10px', marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: '600' }}>{job.recipientName}</span>
                  {job.recipientPhone && (
                    <span style={{ color: '#555' }}>{job.recipientPhone}</span>
                  )}
                </div>
              )}
              {job.deliveryInstructions && (
                <div style={{ fontSize: '9px', color: '#444', fontStyle: 'italic', marginTop: '3px' }}>{job.deliveryInstructions}</div>
              )}
            </div>
          </div>

          {/* ═══ ROW 5: DETAILS GRID ═══ */}
          <div style={{ display: 'flex', borderBottom: b }}>
            <div style={{ flex: 1, padding: '4px 6px', textAlign: 'center', borderRight: b }}>
              <div style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vehicle</div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'capitalize' }}>{job.vehicleType?.replace('_', ' ') || '—'}</div>
            </div>
            <div style={{ flex: 1, padding: '4px 6px', textAlign: 'center', borderRight: b }}>
              <div style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Weight</div>
              <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{job.weight || '—'} kg</div>
            </div>
            <div style={{ flex: 1, padding: '4px 6px', textAlign: 'center', borderRight: b }}>
              <div style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Distance</div>
              <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{j.distance || j.distanceMiles || '—'} mi</div>
            </div>
            <div style={{ flex: 1, padding: '4px 6px', textAlign: 'center', borderRight: driverCode ? b : 'none' }}>
              <div style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</div>
              <div style={{ fontSize: '10px', fontWeight: 'bold' }}>
                {job.isMultiDrop ? 'Multi' : job.isReturnTrip ? 'Return' : 'Standard'}
              </div>
            </div>
            {driverCode && (
              <div style={{ flex: 1, padding: '4px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: '7px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Driver</div>
                <div style={{ fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}>{driverCode}</div>
              </div>
            )}
          </div>

          {/* ═══ ROW 6: PARCEL + TAGLINE ═══ */}
          <div style={{ padding: '3px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            {j.parcelDescription ? (
              <div style={{ fontSize: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                <span style={{ fontWeight: '600' }}>Parcel: </span>{j.parcelDescription}
              </div>
            ) : (
              <div />
            )}
            <div style={{ fontSize: '7px', color: '#888', whiteSpace: 'nowrap' }}>
              Same Day &#8226; Tracked &#8226; Insured
            </div>
          </div>

        </div>
      </div>
    );
  }
);

ShippingLabel.displayName = 'ShippingLabel';
