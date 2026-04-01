import { forwardRef } from 'react';
import type { Job } from '@shared/schema';

/* Inline SVG logo — vector-sharp at any DPI, ideal for thermal printing */
const RunCourierLogoSVG = ({ size = 24 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'block', flexShrink: 0 }}
    aria-hidden="true"
  >
    {/* Head */}
    <circle cx="62" cy="18" r="9" fill="#000" />
    {/* Torso / running body */}
    <line x1="62" y1="27" x2="50" y2="58" stroke="#000" strokeWidth="7" strokeLinecap="round" />
    {/* Rear leg */}
    <line x1="50" y1="58" x2="30" y2="82" stroke="#000" strokeWidth="6" strokeLinecap="round" />
    {/* Front leg */}
    <line x1="50" y1="58" x2="62" y2="85" stroke="#000" strokeWidth="6" strokeLinecap="round" />
    {/* Arm holding box (forward arm) */}
    <line x1="58" y1="38" x2="80" y2="32" stroke="#000" strokeWidth="6" strokeLinecap="round" />
    {/* Package/box */}
    <rect x="75" y="20" width="18" height="16" rx="2" fill="#000" />
    {/* Rear arm */}
    <line x1="56" y1="42" x2="40" y2="52" stroke="#000" strokeWidth="6" strokeLinecap="round" />
    {/* Speed lines */}
    <line x1="5" y1="36" x2="22" y2="36" stroke="#000" strokeWidth="4" strokeLinecap="round" />
    <line x1="10" y1="47" x2="24" y2="47" stroke="#000" strokeWidth="3" strokeLinecap="round" />
    <line x1="15" y1="57" x2="26" y2="57" stroke="#000" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

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
  driverCode?: string | null;
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
  stopNumber: number;
  totalStops: number;
  isPickup: boolean;
  isFinalDelivery: boolean;
}

const IconPin = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);

const IconClock = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const IconUser = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const IconPhone = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);

export const MultiDropShippingLabels = forwardRef<HTMLDivElement, MultiDropShippingLabelsProps>(
  ({ job, stops, driverCode }, ref) => {
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
      const len = Math.min(text.length * 2 + 6, 38);
      for (let i = 0; i < len; i++) {
        bars.push(
          <div key={i} style={{ width: i % 3 === 0 ? '2px' : '1px', height: '30px', backgroundColor: i % 2 === 0 ? '#000' : '#fff' }} />
        );
      }
      return bars;
    };

    const sortedStops = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
    const totalStops = sortedStops.length + 1;
    const scheduledTime = formatTime(j.scheduledPickupTime);

    const labels: LabelData[] = [];

    const pickupFrom = {
      fromAddress: job.pickupAddress,
      fromPostcode: job.pickupPostcode,
      fromBuildingName: j.pickupBuildingName,
      fromContactName: j.pickupContactName || j.senderName,
      fromContactPhone: j.pickupContactPhone || j.senderPhone,
    };

    if (sortedStops.length > 0) {
      for (let i = 0; i < sortedStops.length; i++) {
        labels.push({
          ...pickupFrom,
          toAddress: sortedStops[i].address, toPostcode: sortedStops[i].postcode, toBuildingName: sortedStops[i].buildingName,
          recipientName: sortedStops[i].recipientName, recipientPhone: sortedStops[i].recipientPhone,
          stopNumber: i + 1, totalStops, isPickup: true, isFinalDelivery: false,
        });
      }
      labels.push({
        ...pickupFrom,
        toAddress: job.deliveryAddress, toPostcode: job.deliveryPostcode, toBuildingName: j.deliveryBuildingName,
        recipientName: job.recipientName || undefined, recipientPhone: job.recipientPhone || undefined,
        stopNumber: totalStops, totalStops, isPickup: true, isFinalDelivery: true,
      });
    } else {
      labels.push({
        ...pickupFrom,
        toAddress: job.deliveryAddress, toPostcode: job.deliveryPostcode, toBuildingName: j.deliveryBuildingName,
        recipientName: job.recipientName || undefined, recipientPhone: job.recipientPhone || undefined,
        stopNumber: 1, totalStops: 1, isPickup: true, isFinalDelivery: true,
      });
    }

    const renderLabel = (label: LabelData, index: number) => (
      /* ── OUTER LABEL: exact thermal size 100mm × 150mm, 6mm safe-zone on all sides ── */
      <div
        key={index}
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
          pageBreakAfter: index < labels.length - 1 ? 'always' : 'auto',
        }}
        data-testid={`shipping-label-stop-${label.stopNumber}`}
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
              <RunCourierLogoSVG size={26} />
              <div style={{ fontSize: '13px', fontWeight: 'bold', lineHeight: 1.1 }}>RUN COURIER<span style={{ fontSize: '9px', verticalAlign: 'super' }}>&trade;</span></div>
            </div>
            <div style={{ backgroundColor: '#000', color: '#fff', padding: '3px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace', flexShrink: 0 }}>
              {label.stopNumber}/{label.totalStops}
            </div>
            <div style={{ textAlign: 'right', fontSize: '7px', color: '#000', lineHeight: 1.4, flexShrink: 0 }}>
              <div>runcourier.co.uk</div>
              <div>020 4634 6100</div>
            </div>
          </div>

          {/* ── JOB / BARCODE / DATE ── */}
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
            {j.jobNumber && (
              <div style={{ flexShrink: 0, minWidth: '42px' }}>
                <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', fontWeight: '700' }}>Job No.</div>
                <div style={{ fontSize: '14px', fontWeight: '900', fontFamily: "'Courier New', monospace", whiteSpace: 'nowrap' }}>{j.jobNumber}</div>
              </div>
            )}
            <div style={{ flex: 1, textAlign: 'center', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'center', maxWidth: '100%', overflow: 'hidden' }}>{generateBarcode(`${job.trackingNumber}-${label.stopNumber}`)}</div>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: '11px', fontWeight: '900', letterSpacing: '1.5px', paddingTop: '1px' }}>{job.trackingNumber}-{label.stopNumber}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '46px' }}>
              <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', fontWeight: '700' }}>Date</div>
              <div style={{ fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap' }}>{formatDate(job.createdAt)}</div>
            </div>
          </div>

          {/* ── FROM card — grows to fill space ── */}
          <div style={{
            flex: '1 1 0',
            border: '1px solid #222',
            borderRadius: '8px',
            padding: '5px 7px',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <IconPin />
                <span style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#000' }}>
                  {label.isPickup ? 'From / Pickup' : `From Stop ${label.stopNumber - 1}`}
                </span>
              </div>
              {label.isPickup && scheduledTime && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '8px', fontWeight: 'bold', color: '#1a73e8' }}>
                  <IconClock />
                  <span>{scheduledTime}</span>
                </div>
              )}
            </div>
            {label.fromBuildingName && <div style={{ fontSize: '10px', fontWeight: '700' }}>{label.fromBuildingName}</div>}
            <div style={{ fontSize: '10px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{label.fromAddress}</div>
            <div style={{ fontSize: '16px', fontWeight: '900', fontFamily: "'Courier New', monospace", paddingTop: '2px', letterSpacing: '1.5px', color: '#000' }}>{label.fromPostcode}</div>
            {label.fromContactName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', paddingTop: '2px', fontSize: '9px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } as any}>
                <IconUser />
                <span style={{ fontWeight: '700', color: '#000' }}>{label.fromContactName}</span>
                {label.fromContactPhone && (
                  <>
                    <span style={{ color: '#000' }}>|</span>
                    <IconPhone />
                    <span style={{ color: '#000' }}>{label.fromContactPhone}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── TO card — grows to fill space ── */}
          <div style={{
            flex: '1 1 0',
            border: '1.5px solid #111',
            borderRadius: '8px',
            padding: '5px 7px',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', paddingBottom: '2px' }}>
              <IconPin />
              <span style={{ fontSize: '9px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#000' }}>
                {label.isFinalDelivery ? 'To / Final Delivery' : `To Stop ${label.stopNumber}`}
              </span>
            </div>
            {label.toBuildingName && <div style={{ fontSize: '10px', fontWeight: '700' }}>{label.toBuildingName}</div>}
            <div style={{ fontSize: '10px', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}>{label.toAddress}</div>
            <div style={{ fontSize: '16px', fontWeight: '900', fontFamily: "'Courier New', monospace", paddingTop: '2px', letterSpacing: '1.5px', color: '#000' }}>{label.toPostcode}</div>
            {label.recipientName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', paddingTop: '2px', fontSize: '9px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } as any}>
                <IconUser />
                <span style={{ fontWeight: '700', color: '#000' }}>{label.recipientName}</span>
                {label.recipientPhone && (
                  <>
                    <span style={{ color: '#000' }}>|</span>
                    <IconPhone />
                    <span style={{ color: '#000' }}>{label.recipientPhone}</span>
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
              <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', fontWeight: '700' }}>Weight</div>
              <div style={{ fontSize: '9px', fontWeight: '700' }}>{job.weight || '—'} kg</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', fontWeight: '700' }}>Vehicle</div>
              <div style={{ fontSize: '9px', fontWeight: '700', textTransform: 'capitalize' }}>{job.vehicleType?.replace('_', ' ') || '—'}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', fontWeight: '700' }}>Type</div>
              <div style={{ fontSize: '9px', fontWeight: '700' }}>Multi</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', fontWeight: '700' }}>Distance</div>
              <div style={{ fontSize: '9px', fontWeight: '700' }}>{j.distance || j.distanceMiles || '—'} mi</div>
            </div>
            {driverCode && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '7px', color: '#000', textTransform: 'uppercase', fontWeight: '700' }}>Driver</div>
                <div style={{ fontSize: '9px', fontWeight: '700', fontFamily: 'monospace' }}>{driverCode}</div>
              </div>
            )}
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
