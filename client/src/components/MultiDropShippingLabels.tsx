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
  deliveryInstructions?: string;
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
      const len = Math.min(text.length * 2, 30);
      for (let i = 0; i < len; i++) {
        bars.push(
          <div
            key={i}
            style={{
              width: i % 3 === 0 ? '2px' : '1px',
              height: '26px',
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
        style={{
          width: '4in',
          height: '6in',
          padding: '8px 12px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          boxSizing: 'border-box',
          overflow: 'hidden',
          color: '#000',
          backgroundColor: '#fff',
          pageBreakAfter: index < labels.length - 1 ? 'always' : 'auto',
        }}
        data-testid={`shipping-label-stop-${label.stopNumber}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* ── HEADER ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px', borderBottom: '2px solid #000', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <img src={runCourierLogo} alt="" style={{ width: '26px', height: '26px', borderRadius: '3px', display: 'block' }} />
              <div style={{ fontSize: '10px', fontWeight: 'bold', lineHeight: 1 }}>RUN COURIER</div>
            </div>
            <div style={{ backgroundColor: '#000', color: '#fff', padding: '2px 8px', borderRadius: '3px', fontSize: '11px', fontWeight: 'bold' }}>
              {label.stopNumber} / {label.totalStops}
            </div>
            <div style={{ textAlign: 'right', fontSize: '8px', color: '#555', lineHeight: 1.4 }}>
              <div>{formatDate(job.createdAt)}</div>
              {label.isPickup && scheduledTime && <div style={{ fontWeight: 'bold', color: '#000' }}>{scheduledTime}</div>}
            </div>
          </div>

          {/* ── BARCODE ── */}
          <div style={{ textAlign: 'center', marginBottom: '5px' }}>
            <div style={{ display: 'inline-flex' }}>{generateBarcode(`${job.trackingNumber}-${label.stopNumber}`)}</div>
            <div style={{ fontFamily: 'monospace', fontSize: '9px', fontWeight: 'bold', letterSpacing: '1.5px', marginTop: '1px' }}>
              {job.trackingNumber}-{label.stopNumber}
            </div>
            {j.jobNumber && (
              <div style={{ fontSize: '7px', color: '#666' }}>Job: {j.jobNumber}</div>
            )}
          </div>

          {/* ── FROM ── */}
          <div style={{ border: '1px solid #333', borderRadius: '3px', padding: '5px 7px', marginBottom: '4px' }}>
            <div style={{ fontSize: '7px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px', borderBottom: '1px solid #ddd', paddingBottom: '1px' }}>
              {label.isPickup ? 'PICKUP' : `FROM STOP ${label.stopNumber - 1}`}
            </div>
            {label.fromBuildingName && (
              <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '1px' }}>{label.fromBuildingName}</div>
            )}
            <div style={{ fontSize: '9px', lineHeight: 1.25 }}>{label.fromAddress}</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '1px' }}>{label.fromPostcode}</div>
            {label.fromContactName && (
              <div style={{ fontSize: '8px', color: '#333', marginTop: '1px' }}>
                {label.fromContactName}
                {label.fromContactPhone && <span style={{ color: '#888', marginLeft: '5px' }}>{label.fromContactPhone}</span>}
              </div>
            )}
          </div>

          {/* ── TO ── */}
          <div style={{ border: '2.5px solid #000', borderRadius: '3px', padding: '5px 7px', backgroundColor: '#f5f5f5', flex: 1 }}>
            <div style={{ fontSize: '7px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2px', borderBottom: '1px solid #ccc', paddingBottom: '1px' }}>
              {label.isFinalDelivery ? 'FINAL DELIVERY' : `DELIVER TO STOP ${label.stopNumber}`}
            </div>
            {label.toBuildingName && (
              <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '1px' }}>{label.toBuildingName}</div>
            )}
            <div style={{ fontSize: '9px', lineHeight: 1.25 }}>{label.toAddress}</div>
            <div style={{ fontSize: '15px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '1px' }}>{label.toPostcode}</div>
            {label.recipientName && (
              <div style={{ fontSize: '8px', color: '#333', marginTop: '1px' }}>
                {label.recipientName}
                {label.recipientPhone && <span style={{ color: '#888', marginLeft: '5px' }}>{label.recipientPhone}</span>}
              </div>
            )}
            {label.deliveryInstructions && (
              <div style={{ fontSize: '7px', color: '#555', marginTop: '2px', fontStyle: 'italic' }}>{label.deliveryInstructions}</div>
            )}
          </div>

          {/* ── FOOTER ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid #000', marginTop: '4px', paddingTop: '3px', fontSize: '8px', gap: '6px' }}>
            <span><b>{job.vehicleType?.replace('_', ' ')}</b></span>
            {job.weight && <span>{job.weight} kg</span>}
            <span>{j.distance || j.distanceMiles ? `${j.distance || j.distanceMiles} mi` : ''}</span>
            <span>Multi-drop</span>
            {driverCode && <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{driverCode}</span>}
          </div>

          <div style={{ textAlign: 'center', fontSize: '6px', color: '#aaa', marginTop: '2px' }}>
            Same Day Delivery &#8226; Tracked & Insured &#8226; runcourier.co.uk
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
