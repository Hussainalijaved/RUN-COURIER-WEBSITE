import { forwardRef } from 'react';
import runCourierLogo from '@assets/run_courier_logo.png';
import type { Job } from '@shared/schema';

interface ShippingLabelProps {
  job: Job;
  driverCode?: string | null;
}

const IconPin = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);

const IconClock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const IconUser = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const IconPhone = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);

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
      return new Date(date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

    const generateBarcode = (text: string) => {
      const bars = [];
      const len = Math.min(text.length * 2 + 10, 44);
      for (let i = 0; i < len; i++) {
        bars.push(
          <div key={i} style={{ width: i % 3 === 0 ? '2.5px' : '1px', height: '36px', backgroundColor: i % 2 === 0 ? '#000' : '#fff' }} />
        );
      }
      return bars;
    };

    const scheduledTime = formatTime(j.scheduledPickupTime);

    return (
      /* ── OUTER LABEL: exact thermal size 100mm × 150mm, 6mm safe-zone on all sides ── */
      <div
        ref={ref}
        className="label-page"
        style={{
          width: '100mm',
          height: '150mm',
          margin: 0,
          padding: '6mm',
          fontFamily: 'Arial, Helvetica, sans-serif',
          boxSizing: 'border-box',
          overflow: 'hidden',
          color: '#000',
          backgroundColor: '#fff',
          fontSize: '12px',
          lineHeight: 1.4,
        }}
        data-testid="shipping-label"
      >
        {/* ── Inner flex column — gap distributes space between all sections ── */}
        <div style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '2.5mm',
        }}>

          {/* ── HEADER ── */}
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <img src={runCourierLogo} alt="" style={{ width: '24px', height: '24px', borderRadius: '4px', display: 'block', flexShrink: 0 }} />
              <div style={{ fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.3px', lineHeight: 1.1 }}>RUN COURIER<span style={{ fontSize: '8px', verticalAlign: 'super' }}>&trade;</span></div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '7px', color: '#000', lineHeight: 1.4 }}>
              <div>www.runcourier.co.uk</div>
              <div>020 4634 6100</div>
            </div>
          </div>

          {/* ── JOB / BARCODE / DATE ── */}
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
            {j.jobNumber && (
              <div style={{ flexShrink: 0, minWidth: '44px' }}>
                <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700' }}>Job No.</div>
                <div style={{ fontSize: '14px', fontWeight: '900', fontFamily: "'Courier New', monospace", whiteSpace: 'nowrap' }}>{j.jobNumber}</div>
              </div>
            )}
            <div style={{ flex: 1, textAlign: 'center', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'center', maxWidth: '100%', overflow: 'hidden' }}>{generateBarcode(job.trackingNumber)}</div>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: '11px', fontWeight: '900', letterSpacing: '2px', paddingTop: '1px' }}>{job.trackingNumber}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '48px' }}>
              <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700' }}>Date</div>
              <div style={{ fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap' }}>{formatDate(job.createdAt)}</div>
            </div>
          </div>

          {/* ── FROM / PICKUP card — grows to fill space ── */}
          <div style={{
            flex: '1 1 0',
            border: '1px solid #222',
            borderRadius: '10px',
            padding: '5px 8px',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <IconPin />
                <span style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#000' }}>From / Pickup</span>
              </div>
              {scheduledTime && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '8px', fontWeight: 'bold', color: '#1a73e8' }}>
                  <IconClock />
                  <span>{scheduledTime}</span>
                </div>
              )}
            </div>
            {j.pickupBuildingName && (
              <div style={{ fontSize: '10px', fontWeight: '700' }}>{j.pickupBuildingName}</div>
            )}
            <div style={{ fontSize: '10px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{job.pickupAddress}</div>
            <div style={{ fontSize: '18px', fontWeight: '900', fontFamily: "'Courier New', monospace", paddingTop: '2px', letterSpacing: '1.5px', color: '#000' }}>{job.pickupPostcode}</div>
            {(j.pickupContactName || j.senderName) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', paddingTop: '2px', fontSize: '9px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } as any}>
                <IconUser />
                <span style={{ fontWeight: '700', color: '#000' }}>{j.pickupContactName || j.senderName}</span>
                {(j.pickupContactPhone || j.senderPhone) && (
                  <>
                    <span style={{ color: '#000' }}>|</span>
                    <IconPhone />
                    <span style={{ color: '#000' }}>{j.pickupContactPhone || j.senderPhone}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── TO / DELIVERY card — grows to fill space ── */}
          <div style={{
            flex: '1 1 0',
            border: '1.5px solid #111',
            borderRadius: '10px',
            padding: '5px 8px',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', paddingBottom: '2px' }}>
              <IconPin />
              <span style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#000' }}>To / Delivery</span>
            </div>
            {j.deliveryBuildingName && (
              <div style={{ fontSize: '10px', fontWeight: '700' }}>{j.deliveryBuildingName}</div>
            )}
            <div style={{ fontSize: '10px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{job.deliveryAddress}</div>
            <div style={{ fontSize: '18px', fontWeight: '900', fontFamily: "'Courier New', monospace", paddingTop: '2px', letterSpacing: '1.5px', color: '#000' }}>{job.deliveryPostcode}</div>
            {job.recipientName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', paddingTop: '2px', fontSize: '9px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } as any}>
                <IconUser />
                <span style={{ fontWeight: '700', color: '#000' }}>{job.recipientName}</span>
                {job.recipientPhone && (
                  <>
                    <span style={{ color: '#000' }}>|</span>
                    <IconPhone />
                    <span style={{ color: '#000' }}>{job.recipientPhone}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── FOOTER STATS ── */}
          <div style={{
            flex: '0 0 auto',
            display: 'grid',
            gridTemplateColumns: driverCode ? '1fr 1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr',
            borderTop: '1px solid #ddd',
            paddingTop: '2px',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.3px' }}>Weight</div>
              <div style={{ fontSize: '9px', fontWeight: '700' }}>{job.weight || '—'} kg</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.3px' }}>Vehicle</div>
              <div style={{ fontSize: '9px', fontWeight: '700', textTransform: 'capitalize' }}>{job.vehicleType?.replace('_', ' ') || '—'}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.3px' }}>Type</div>
              <div style={{ fontSize: '9px', fontWeight: '700' }}>{job.isMultiDrop ? 'Multi' : job.isReturnTrip ? 'Return' : 'Standard'}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.3px' }}>Distance</div>
              <div style={{ fontSize: '9px', fontWeight: '700' }}>{j.distance || j.distanceMiles || '—'} mi</div>
            </div>
            {driverCode && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.3px' }}>Driver</div>
                <div style={{ fontSize: '9px', fontWeight: '700', fontFamily: 'monospace' }}>{driverCode}</div>
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }
);

ShippingLabel.displayName = 'ShippingLabel';
