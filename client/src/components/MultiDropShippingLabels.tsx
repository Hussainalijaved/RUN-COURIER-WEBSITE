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
      return new Date(date).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const generateBarcode = (text: string) => {
      const bars = [];
      const len = Math.min(text.length * 2 + 6, 36);
      for (let i = 0; i < len; i++) {
        bars.push(
          <div
            key={i}
            style={{
              width: i % 3 === 0 ? '2px' : '1px',
              height: '32px',
              backgroundColor: i % 2 === 0 ? '#000' : '#fff',
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
        stopNumber: 1,
        totalStops: 1,
        isPickup: true,
        isFinalDelivery: true,
      });
    }

    const b = '1.5px solid #000';

    const renderLabel = (label: LabelData, index: number) => (
      <div
        key={index}
        style={{
          width: '4in',
          height: '6in',
          padding: '10px 12px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          boxSizing: 'border-box',
          overflow: 'hidden',
          color: '#000',
          backgroundColor: '#fff',
          position: 'relative',
          pageBreakAfter: index < labels.length - 1 ? 'always' : 'auto',
        }}
        data-testid={`shipping-label-stop-${label.stopNumber}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', border: '2px solid #000' }}>

          {/* ═══ ROW 1: HEADER ═══ */}
          <div style={{ display: 'flex', borderBottom: b, flexShrink: 0 }}>
            <div style={{ padding: '5px 7px', display: 'flex', alignItems: 'center', gap: '5px', flex: 1, overflow: 'hidden' }}>
              <img src={runCourierLogo} alt="" style={{ width: '24px', height: '24px', borderRadius: '3px', display: 'block', flexShrink: 0 }} />
              <div style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.5px', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>RUN COURIER</div>
            </div>
            <div style={{ borderLeft: b, padding: '4px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', color: '#fff', flexShrink: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{label.stopNumber}/{label.totalStops}</div>
            </div>
            <div style={{ borderLeft: b, padding: '4px 7px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Date</div>
              <div style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{formatDate(job.createdAt)}</div>
            </div>
            {j.jobNumber && (
              <div style={{ borderLeft: b, padding: '4px 7px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Job</div>
                <div style={{ fontSize: '9px', fontWeight: 'bold', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{j.jobNumber}</div>
              </div>
            )}
          </div>

          {/* ═══ ROW 2: BARCODE ═══ */}
          <div style={{ borderBottom: b, padding: '4px 0', textAlign: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'center', maxWidth: '100%', overflow: 'hidden' }}>{generateBarcode(`${job.trackingNumber}-${label.stopNumber}`)}</div>
            <div style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 'bold', letterSpacing: '2px', marginTop: '1px' }}>
              {job.trackingNumber}-{label.stopNumber}
            </div>
          </div>

          {/* ═══ ROW 3: FROM ═══ */}
          <div style={{ borderBottom: b, display: 'flex', flexShrink: 0 }}>
            <div style={{ backgroundColor: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '20px', flexShrink: 0 }}>
              <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '8px', fontWeight: 'bold', letterSpacing: '1.5px', whiteSpace: 'nowrap' }}>
                {label.isPickup ? 'FROM' : `STOP ${label.stopNumber - 1}`}
              </span>
            </div>
            <div style={{ padding: '5px 8px', flex: 1, overflow: 'hidden' }}>
              {label.fromBuildingName && (
                <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label.fromBuildingName}</div>
              )}
              <div style={{ fontSize: '9px', lineHeight: 1.25 }}>{label.fromAddress}</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '1px', letterSpacing: '1px' }}>{label.fromPostcode}</div>
              {label.fromContactName && (
                <div style={{ fontSize: '8px', marginTop: '2px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: '600' }}>{label.fromContactName}</span>
                  {label.fromContactPhone && <span style={{ color: '#555' }}>{label.fromContactPhone}</span>}
                </div>
              )}
              {label.isPickup && scheduledTime && (
                <div style={{ fontSize: '8px', fontWeight: 'bold', marginTop: '1px' }}>Collect by: {scheduledTime}</div>
              )}
            </div>
          </div>

          {/* ═══ ROW 4: TO ═══ */}
          <div style={{ borderBottom: b, display: 'flex', flex: 1, minHeight: 0 }}>
            <div style={{ backgroundColor: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '22px', flexShrink: 0 }}>
              <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '9px', fontWeight: 'bold', letterSpacing: '1.5px', whiteSpace: 'nowrap' }}>
                {label.isFinalDelivery ? 'FINAL' : `STOP ${label.stopNumber}`}
              </span>
            </div>
            <div style={{ padding: '6px 8px', flex: 1, backgroundColor: '#fafafa', overflow: 'hidden' }}>
              {label.toBuildingName && (
                <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label.toBuildingName}</div>
              )}
              <div style={{ fontSize: '10px', lineHeight: 1.25 }}>{label.toAddress}</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '2px', letterSpacing: '2px' }}>{label.toPostcode}</div>
              {label.recipientName && (
                <div style={{ fontSize: '9px', marginTop: '3px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: '600' }}>{label.recipientName}</span>
                  {label.recipientPhone && <span style={{ color: '#555' }}>{label.recipientPhone}</span>}
                </div>
              )}
            </div>
          </div>

          {/* ═══ ROW 5: DETAILS ═══ */}
          <div style={{ display: 'flex', borderBottom: b, flexShrink: 0 }}>
            <div style={{ flex: 1, padding: '3px 5px', textAlign: 'center', borderRight: b }}>
              <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase' }}>Vehicle</div>
              <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.vehicleType?.replace('_', ' ') || '—'}</div>
            </div>
            <div style={{ flex: 1, padding: '3px 5px', textAlign: 'center', borderRight: b }}>
              <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase' }}>Weight</div>
              <div style={{ fontSize: '9px', fontWeight: 'bold' }}>{job.weight || '—'} kg</div>
            </div>
            <div style={{ flex: 1, padding: '3px 5px', textAlign: 'center', borderRight: driverCode ? b : 'none' }}>
              <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase' }}>Distance</div>
              <div style={{ fontSize: '9px', fontWeight: 'bold' }}>{j.distance || j.distanceMiles || '—'} mi</div>
            </div>
            {driverCode && (
              <div style={{ flex: 1, padding: '3px 5px', textAlign: 'center' }}>
                <div style={{ fontSize: '6px', color: '#666', textTransform: 'uppercase' }}>Driver</div>
                <div style={{ fontSize: '9px', fontWeight: 'bold', fontFamily: 'monospace' }}>{driverCode}</div>
              </div>
            )}
          </div>

          {/* ═══ ROW 6: PARCEL + TAGLINE ═══ */}
          <div style={{ padding: '2px 7px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexShrink: 0 }}>
            {j.parcelDescription ? (
              <div style={{ fontSize: '7px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                <span style={{ fontWeight: '600' }}>Parcel: </span>{j.parcelDescription}
              </div>
            ) : (
              <div />
            )}
            <div style={{ fontSize: '6px', color: '#888', whiteSpace: 'nowrap' }}>
              Multi-drop &#8226; runcourier.co.uk
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
