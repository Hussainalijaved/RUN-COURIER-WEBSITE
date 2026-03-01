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
      const len = Math.min(text.length * 2 + 8, 42);
      for (let i = 0; i < len; i++) {
        bars.push(
          <div
            key={i}
            style={{
              width: i % 3 === 0 ? '2.5px' : '1px',
              height: '38px',
              backgroundColor: i % 2 === 0 ? '#000' : '#fff',
            }}
          />
        );
      }
      return bars;
    };

    const scheduledTime = formatTime(j.scheduledPickupTime);
    const border = '1px solid #000';

    return (
      <div
        ref={ref}
        style={{
          width: '4in',
          height: '6in',
          padding: '14px 12px 12px 12px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          boxSizing: 'border-box',
          overflow: 'hidden',
          color: '#000',
          backgroundColor: '#fff',
          position: 'relative',
        }}
        data-testid="shipping-label"
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', border: '1.5px solid #000' }}>

          {/* ═══ HEADER — CSS Grid: brand | date | job# ═══ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            borderBottom: '2px solid #000',
            flexShrink: 0,
          }}>
            <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
              <img
                src={runCourierLogo}
                alt=""
                style={{ width: '28px', height: '28px', borderRadius: '3px', display: 'block', flexShrink: 0 }}
              />
              <div style={{ overflow: 'hidden', minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.5px', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>RUN COURIER</div>
                <div style={{ fontSize: '7px', color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>runcourier.co.uk | 020 4634 6100</div>
              </div>
            </div>
            <div style={{ borderLeft: border, padding: '5px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>DATE</div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{formatDate(job.createdAt)}</div>
            </div>
            {j.jobNumber && (
              <div style={{ borderLeft: border, padding: '5px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>JOB #</div>
                <div style={{ fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70px' }}>{j.jobNumber}</div>
              </div>
            )}
          </div>

          {/* ═══ BARCODE ═══ */}
          <div style={{ borderBottom: border, padding: '8px 10px 6px', textAlign: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'center', maxWidth: '100%', overflow: 'hidden', margin: '0 auto' }}>
              {generateBarcode(job.trackingNumber)}
            </div>
            <div style={{ fontFamily: "'Courier New', monospace", fontSize: '12px', fontWeight: 'bold', letterSpacing: '3px', marginTop: '3px' }}>
              {job.trackingNumber}
            </div>
          </div>

          {/* ═══ FROM (PICKUP) ═══ */}
          <div style={{ borderBottom: border, display: 'flex', flexShrink: 0 }}>
            <div style={{
              backgroundColor: '#000', color: '#fff',
              width: '24px', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                writingMode: 'vertical-lr', transform: 'rotate(180deg)',
                fontSize: '9px', fontWeight: 'bold', letterSpacing: '2px',
              }}>FROM</span>
            </div>
            <div style={{ padding: '7px 10px', flex: 1, overflow: 'hidden', borderLeft: border }}>
              {j.pickupBuildingName && (
                <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.pickupBuildingName}</div>
              )}
              <div style={{ fontSize: '10px', lineHeight: 1.3 }}>{job.pickupAddress}</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', fontFamily: "'Courier New', monospace", marginTop: '3px', letterSpacing: '1.5px' }}>{job.pickupPostcode}</div>
              {(j.pickupContactName || j.senderName) && (
                <div style={{ fontSize: '9px', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: '600' }}>{j.pickupContactName || j.senderName}</span>
                  {(j.pickupContactPhone || j.senderPhone) && (
                    <span style={{ color: '#555', marginLeft: '8px' }}>{j.pickupContactPhone || j.senderPhone}</span>
                  )}
                </div>
              )}
              {scheduledTime && (
                <div style={{ fontSize: '9px', fontWeight: 'bold', marginTop: '2px' }}>Collect by: {scheduledTime}</div>
              )}
            </div>
          </div>

          {/* ═══ TO (DELIVERY) — flex:1 takes remaining space ═══ */}
          <div style={{ borderBottom: border, display: 'flex', flex: 1, minHeight: 0 }}>
            <div style={{
              backgroundColor: '#000', color: '#fff',
              width: '28px', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                writingMode: 'vertical-lr', transform: 'rotate(180deg)',
                fontSize: '11px', fontWeight: 'bold', letterSpacing: '3px',
              }}>TO</span>
            </div>
            <div style={{ padding: '8px 10px', flex: 1, overflow: 'hidden', borderLeft: border }}>
              {j.deliveryBuildingName && (
                <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.deliveryBuildingName}</div>
              )}
              <div style={{ fontSize: '11px', lineHeight: 1.3 }}>{job.deliveryAddress}</div>
              <div style={{ fontSize: '26px', fontWeight: 'bold', fontFamily: "'Courier New', monospace", marginTop: '4px', letterSpacing: '2px' }}>{job.deliveryPostcode}</div>
              {job.recipientName && (
                <div style={{ fontSize: '10px', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: '600' }}>{job.recipientName}</span>
                  {job.recipientPhone && (
                    <span style={{ color: '#555', marginLeft: '8px' }}>{job.recipientPhone}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══ BOTTOM STATS — 5-column grid ═══ */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: driverCode ? '1fr 1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr',
            flexShrink: 0,
          }}>
            <div style={{ padding: '4px 4px', textAlign: 'center', borderRight: border }}>
              <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>VEHICLE</div>
              <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.vehicleType?.replace('_', ' ') || '—'}</div>
            </div>
            <div style={{ padding: '4px 4px', textAlign: 'center', borderRight: border }}>
              <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>WEIGHT</div>
              <div style={{ fontSize: '9px', fontWeight: 'bold' }}>{job.weight || '—'} kg</div>
            </div>
            <div style={{ padding: '4px 4px', textAlign: 'center', borderRight: border }}>
              <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>DISTANCE</div>
              <div style={{ fontSize: '9px', fontWeight: 'bold' }}>{j.distance || j.distanceMiles || '—'} mi</div>
            </div>
            <div style={{ padding: '4px 4px', textAlign: 'center', borderRight: driverCode ? border : 'none' }}>
              <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>TYPE</div>
              <div style={{ fontSize: '9px', fontWeight: 'bold' }}>
                {job.isMultiDrop ? 'Multi' : job.isReturnTrip ? 'Return' : 'Standard'}
              </div>
            </div>
            {driverCode && (
              <div style={{ padding: '4px 4px', textAlign: 'center' }}>
                <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>DRIVER</div>
                <div style={{ fontSize: '9px', fontWeight: 'bold', fontFamily: 'monospace' }}>{driverCode}</div>
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }
);

ShippingLabel.displayName = 'ShippingLabel';
