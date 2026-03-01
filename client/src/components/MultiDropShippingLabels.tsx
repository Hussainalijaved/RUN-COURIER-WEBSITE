import { forwardRef } from 'react';
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

    if (sortedStops.length > 0) {
      labels.push({
        fromAddress: job.pickupAddress, fromPostcode: job.pickupPostcode, fromBuildingName: j.pickupBuildingName,
        fromContactName: j.pickupContactName || j.senderName, fromContactPhone: j.pickupContactPhone || j.senderPhone,
        toAddress: sortedStops[0].address, toPostcode: sortedStops[0].postcode, toBuildingName: sortedStops[0].buildingName,
        recipientName: sortedStops[0].recipientName, recipientPhone: sortedStops[0].recipientPhone,
        stopNumber: 1, totalStops, isPickup: true, isFinalDelivery: false,
      });
      for (let i = 0; i < sortedStops.length - 1; i++) {
        labels.push({
          fromAddress: sortedStops[i].address, fromPostcode: sortedStops[i].postcode, fromBuildingName: sortedStops[i].buildingName,
          toAddress: sortedStops[i + 1].address, toPostcode: sortedStops[i + 1].postcode, toBuildingName: sortedStops[i + 1].buildingName,
          recipientName: sortedStops[i + 1].recipientName, recipientPhone: sortedStops[i + 1].recipientPhone,
          stopNumber: i + 2, totalStops, isPickup: false, isFinalDelivery: false,
        });
      }
      labels.push({
        fromAddress: sortedStops[sortedStops.length - 1].address, fromPostcode: sortedStops[sortedStops.length - 1].postcode,
        fromBuildingName: sortedStops[sortedStops.length - 1].buildingName,
        toAddress: job.deliveryAddress, toPostcode: job.deliveryPostcode, toBuildingName: j.deliveryBuildingName,
        recipientName: job.recipientName || undefined, recipientPhone: job.recipientPhone || undefined,
        stopNumber: totalStops, totalStops, isPickup: false, isFinalDelivery: true,
      });
    } else {
      labels.push({
        fromAddress: job.pickupAddress, fromPostcode: job.pickupPostcode, fromBuildingName: j.pickupBuildingName,
        fromContactName: j.pickupContactName || j.senderName, fromContactPhone: j.pickupContactPhone || j.senderPhone,
        toAddress: job.deliveryAddress, toPostcode: job.deliveryPostcode, toBuildingName: j.deliveryBuildingName,
        recipientName: job.recipientName || undefined, recipientPhone: job.recipientPhone || undefined,
        stopNumber: 1, totalStops: 1, isPickup: true, isFinalDelivery: true,
      });
    }

    const renderLabel = (label: LabelData, index: number) => (
      <div
        key={index}
        style={{
          width: '4in',
          height: '6in',
          padding: '24px 18px 16px 28px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          boxSizing: 'border-box',
          overflow: 'hidden',
          color: '#111',
          backgroundColor: '#fff',
          position: 'relative',
          fontSize: '10px',
          lineHeight: 1.3,
          pageBreakAfter: index < labels.length - 1 ? 'always' : 'auto',
        }}
        data-testid={`shipping-label-stop-${label.stopNumber}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* ── HEADER ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <img src={runCourierLogo} alt="" style={{ width: '24px', height: '24px', borderRadius: '3px', display: 'block', flexShrink: 0 }} />
              <div style={{ fontSize: '11px', fontWeight: 'bold', lineHeight: 1.1 }}>RUN COURIER<span style={{ fontSize: '8px', verticalAlign: 'super' }}>&trade;</span></div>
            </div>
            <div style={{ backgroundColor: '#000', color: '#fff', padding: '3px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace', flexShrink: 0 }}>
              {label.stopNumber}/{label.totalStops}
            </div>
            <div style={{ textAlign: 'right', fontSize: '7px', color: '#555', lineHeight: 1.5, flexShrink: 0 }}>
              <div>runcourier.co.uk</div>
              <div>020 4634 6100</div>
            </div>
          </div>

          {/* ── JOB / BARCODE / DATE ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px', marginBottom: '2px', flexShrink: 0 }}>
            {j.jobNumber && (
              <div style={{ flexShrink: 0, minWidth: '42px' }}>
                <div style={{ fontSize: '6px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Job No.</div>
                <div style={{ fontSize: '11px', fontWeight: 'bold', fontFamily: "'Courier New', monospace", whiteSpace: 'nowrap' }}>{j.jobNumber}</div>
              </div>
            )}
            <div style={{ flex: 1, textAlign: 'center', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'center', maxWidth: '100%', overflow: 'hidden' }}>{generateBarcode(`${job.trackingNumber}-${label.stopNumber}`)}</div>
              <div style={{ fontFamily: "'Courier New', monospace", fontSize: '9px', fontWeight: 'bold', letterSpacing: '1.5px', marginTop: '1px' }}>{job.trackingNumber}-{label.stopNumber}</div>
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right', minWidth: '46px' }}>
              <div style={{ fontSize: '6px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Date</div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{formatDate(job.createdAt)}</div>
            </div>
          </div>

          {/* ── FROM card ── */}
          <div style={{ border: '1px solid #222', borderRadius: '8px', padding: '6px 8px', marginBottom: '4px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <IconPin />
                <span style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#333' }}>
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
            {label.fromBuildingName && <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '1px' }}>{label.fromBuildingName}</div>}
            <div style={{ fontSize: '9px', lineHeight: 1.25 }}>{label.fromAddress}</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', fontFamily: "'Courier New', monospace", marginTop: '2px', letterSpacing: '1.5px' }}>{label.fromPostcode}</div>
            {label.fromContactName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px', fontSize: '8px', flexWrap: 'wrap' }}>
                <IconUser />
                <span style={{ fontWeight: '600' }}>{label.fromContactName}</span>
                {label.fromContactPhone && (
                  <>
                    <span style={{ color: '#ccc' }}>|</span>
                    <IconPhone />
                    <span style={{ color: '#555' }}>{label.fromContactPhone}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── TO card ── */}
          <div style={{ border: '1.5px solid #111', borderRadius: '8px', padding: '6px 8px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '3px' }}>
              <IconPin />
              <span style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#333' }}>
                {label.isFinalDelivery ? 'To / Final Delivery' : `To Stop ${label.stopNumber}`}
              </span>
            </div>
            {label.toBuildingName && <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '1px' }}>{label.toBuildingName}</div>}
            <div style={{ fontSize: '10px', lineHeight: 1.25 }}>{label.toAddress}</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', fontFamily: "'Courier New', monospace", marginTop: '3px', letterSpacing: '2px' }}>{label.toPostcode}</div>
            {label.recipientName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px', fontSize: '9px', flexWrap: 'wrap' }}>
                <IconUser />
                <span style={{ fontWeight: '600' }}>{label.recipientName}</span>
                {label.recipientPhone && (
                  <>
                    <span style={{ color: '#ccc' }}>|</span>
                    <IconPhone />
                    <span style={{ color: '#555' }}>{label.recipientPhone}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── FOOTER ── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: driverCode ? '1fr 1fr 1fr 1fr 1fr' : '1fr 1fr 1fr 1fr',
            borderTop: '1px solid #ddd',
            marginTop: '5px',
            paddingTop: '3px',
            flexShrink: 0,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '6px', color: '#999', textTransform: 'uppercase', fontWeight: '600' }}>Weight</div>
              <div style={{ fontSize: '8px', fontWeight: 'bold' }}>{job.weight || '—'} kg</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '6px', color: '#999', textTransform: 'uppercase', fontWeight: '600' }}>Vehicle</div>
              <div style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'capitalize' }}>{job.vehicleType?.replace('_', ' ') || '—'}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '6px', color: '#999', textTransform: 'uppercase', fontWeight: '600' }}>Type</div>
              <div style={{ fontSize: '8px', fontWeight: 'bold' }}>Multi</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '6px', color: '#999', textTransform: 'uppercase', fontWeight: '600' }}>Distance</div>
              <div style={{ fontSize: '8px', fontWeight: 'bold' }}>{j.distance || j.distanceMiles || '—'} mi</div>
            </div>
            {driverCode && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '6px', color: '#999', textTransform: 'uppercase', fontWeight: '600' }}>Driver</div>
                <div style={{ fontSize: '8px', fontWeight: 'bold', fontFamily: 'monospace' }}>{driverCode}</div>
              </div>
            )}
          </div>
          <div style={{ textAlign: 'center', marginTop: '2px', flexShrink: 0 }}>
            <span style={{ fontSize: '6px', color: '#aaa' }}>Same Day Delivery | Tracked &amp; Insured | www.runcourier.co.uk</span>
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
