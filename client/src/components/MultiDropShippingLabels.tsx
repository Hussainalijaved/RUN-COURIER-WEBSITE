import { forwardRef } from 'react';
import { MapPin, Phone, User, Clock, Package } from 'lucide-react';
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
  driverName?: string;
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
  ({ job, stops, driverName }, ref) => {
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

    const generateBarcode = (trackingNumber: string, stopNum: number) => {
      const bars = [];
      const code = `${trackingNumber}-${stopNum}`.toUpperCase();
      const totalBars = Math.min(code.length * 2 + 4, 36);
      for (let i = 0; i < totalBars; i++) {
        const isBlack = i % 2 === 0;
        bars.push(
          <div
            key={i}
            style={{
              width: i % 3 === 0 ? '2px' : '1px',
              height: '24px',
              backgroundColor: isBlack ? '#000' : '#fff',
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
        className="bg-white text-black"
        style={{
          width: '4in',
          height: '6in',
          padding: '10px 14px',
          fontFamily: 'Arial, Helvetica, sans-serif',
          boxSizing: 'border-box',
          overflow: 'hidden',
          fontSize: '9px',
          lineHeight: 1.3,
          pageBreakAfter: index < labels.length - 1 ? 'always' : 'auto',
        }}
        data-testid={`shipping-label-stop-${label.stopNumber}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* HEADER */}
          <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '2px solid #000', paddingBottom: '3px', marginBottom: '4px' }}>
            <tbody>
              <tr>
                <td style={{ width: '32px', verticalAlign: 'middle', paddingBottom: '3px' }}>
                  <img
                    src={runCourierLogo}
                    alt="RC"
                    style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '3px', display: 'block' }}
                  />
                </td>
                <td style={{ verticalAlign: 'middle', paddingLeft: '5px', paddingBottom: '3px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#000' }}>RUN COURIER&#8482;</div>
                </td>
                <td style={{ verticalAlign: 'middle', textAlign: 'center', paddingBottom: '3px' }}>
                  <div style={{ backgroundColor: '#000', color: '#fff', padding: '2px 8px', borderRadius: '3px', fontSize: '10px', fontWeight: 'bold', display: 'inline-block' }}>
                    {label.stopNumber}/{label.totalStops}
                  </div>
                </td>
                <td style={{ verticalAlign: 'middle', textAlign: 'right', paddingBottom: '3px' }}>
                  <div style={{ fontSize: '7px', color: '#444' }}>runcourier.co.uk</div>
                  <div style={{ fontSize: '7px', color: '#444' }}>020 4634 6100</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* BARCODE + TRACKING */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
            <tbody>
              <tr>
                <td style={{ width: '45px', verticalAlign: 'top' }}>
                  {j.jobNumber && (
                    <>
                      <div style={{ fontSize: '6px', color: '#999', textTransform: 'uppercase' }}>Job</div>
                      <div style={{ fontSize: '9px', fontWeight: 'bold', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{j.jobNumber}</div>
                    </>
                  )}
                </td>
                <td style={{ textAlign: 'center', verticalAlign: 'top' }}>
                  <div style={{ display: 'inline-flex', justifyContent: 'center' }}>{generateBarcode(job.trackingNumber, label.stopNumber)}</div>
                  <div style={{ fontSize: '8px', fontWeight: 'bold', fontFamily: 'monospace', letterSpacing: '1px', marginTop: '1px' }}>{job.trackingNumber}-{label.stopNumber}</div>
                </td>
                <td style={{ width: '50px', verticalAlign: 'top', textAlign: 'right' }}>
                  <div style={{ fontSize: '6px', color: '#999', textTransform: 'uppercase' }}>Date</div>
                  <div style={{ fontSize: '8px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{formatDate(job.createdAt)}</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* FROM BOX */}
          <div style={{ border: '1px solid #000', borderRadius: '3px', padding: '5px 6px', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '2px' }}>
              <div style={{ backgroundColor: '#000', color: '#fff', borderRadius: '50%', width: '12px', height: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin style={{ width: '7px', height: '7px' }} />
              </div>
              <span style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                {label.isPickup ? 'Pickup' : `From Stop ${label.stopNumber - 1}`}
              </span>
              {label.isPickup && scheduledTime && (
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '8px', fontWeight: 'bold', color: '#007BFF' }}>
                  <Clock style={{ width: '7px', height: '7px' }} />
                  {scheduledTime}
                </span>
              )}
            </div>
            {label.fromBuildingName && (
              <div style={{ fontSize: '9px', fontWeight: 'bold' }}>{label.fromBuildingName}</div>
            )}
            <div style={{ fontSize: '8px', lineHeight: 1.2 }}>{label.fromAddress}</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '1px' }}>{label.fromPostcode}</div>
            {label.fromContactName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '1px', fontSize: '7.5px', color: '#333' }}>
                <User style={{ width: '7px', height: '7px', flexShrink: 0 }} />
                <span style={{ fontWeight: '600' }}>{label.fromContactName}</span>
                {label.fromContactPhone && (
                  <>
                    <span style={{ color: '#bbb' }}>&#183;</span>
                    <Phone style={{ width: '7px', height: '7px', flexShrink: 0 }} />
                    <span>{label.fromContactPhone}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* TO BOX */}
          <div style={{ border: '2px solid #000', borderRadius: '3px', padding: '5px 6px', backgroundColor: '#f7f7f7', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '2px' }}>
              <div style={{ backgroundColor: '#000', color: '#fff', borderRadius: '50%', width: '12px', height: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin style={{ width: '7px', height: '7px' }} />
              </div>
              <span style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                {label.isFinalDelivery ? 'Final Delivery' : `Deliver To Stop ${label.stopNumber}`}
              </span>
            </div>
            {label.toBuildingName && (
              <div style={{ fontSize: '9px', fontWeight: 'bold' }}>{label.toBuildingName}</div>
            )}
            <div style={{ fontSize: '8px', lineHeight: 1.2 }}>{label.toAddress}</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '1px' }}>{label.toPostcode}</div>
            {label.recipientName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '1px', fontSize: '7.5px', color: '#333' }}>
                <User style={{ width: '7px', height: '7px', flexShrink: 0 }} />
                <span style={{ fontWeight: '600' }}>{label.recipientName}</span>
                {label.recipientPhone && (
                  <>
                    <span style={{ color: '#bbb' }}>&#183;</span>
                    <Phone style={{ width: '7px', height: '7px', flexShrink: 0 }} />
                    <span>{label.recipientPhone}</span>
                  </>
                )}
              </div>
            )}
            {label.deliveryInstructions && (
              <div style={{ fontSize: '7px', color: '#666', marginTop: '2px', fontStyle: 'italic' }}>{label.deliveryInstructions}</div>
            )}
          </div>

          {/* FOOTER */}
          <div style={{ borderTop: '1.5px solid #000', marginTop: '4px', paddingTop: '3px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ textAlign: 'center', padding: '0 2px' }}>
                    <div style={{ fontSize: '6px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Weight</div>
                    <div style={{ fontSize: '8px', fontWeight: 'bold' }}>{job.weight || '—'} kg</div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '0 2px' }}>
                    <div style={{ fontSize: '6px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Vehicle</div>
                    <div style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'capitalize' }}>{job.vehicleType?.replace('_', ' ') || '—'}</div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '0 2px' }}>
                    <div style={{ fontSize: '6px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Type</div>
                    <div style={{ fontSize: '8px', fontWeight: 'bold' }}>Multi</div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '0 2px' }}>
                    <div style={{ fontSize: '6px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Dist.</div>
                    <div style={{ fontSize: '8px', fontWeight: 'bold' }}>{j.distance || j.distanceMiles || '—'} mi</div>
                  </td>
                  {driverName && (
                    <td style={{ textAlign: 'center', padding: '0 2px', maxWidth: '50px' }}>
                      <div style={{ fontSize: '6px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Driver</div>
                      <div style={{ fontSize: '7px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driverName}</div>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
            {j.parcelDescription && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '7px', color: '#666', marginTop: '2px', paddingTop: '2px', borderTop: '1px dashed #ddd' }}>
                <Package style={{ width: '7px', height: '7px', flexShrink: 0 }} />
                <span style={{ fontWeight: '600' }}>Parcel:</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.parcelDescription}</span>
              </div>
            )}
          </div>

          <div style={{ textAlign: 'center', marginTop: '2px', paddingTop: '2px', borderTop: '1px dashed #ddd' }}>
            <span style={{ fontSize: '6px', color: '#aaa' }}>Same Day Delivery &#8226; Tracked & Insured &#8226; runcourier.co.uk</span>
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
