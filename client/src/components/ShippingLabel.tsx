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
      const totalBars = Math.min(code.length * 2 + 6, 36);
      for (let i = 0; i < totalBars; i++) {
        const isBlack = i % 2 === 0;
        bars.push(
          <div
            key={i}
            style={{
              width: i % 3 === 0 ? '2px' : '1px',
              height: '28px',
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
        }}
        data-testid="shipping-label"
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* HEADER — logo left, company centre, contact right */}
          <table style={{ width: '100%', borderCollapse: 'collapse', borderBottom: '2px solid #000', paddingBottom: '4px', marginBottom: '5px' }}>
            <tbody>
              <tr>
                <td style={{ width: '36px', verticalAlign: 'middle', paddingBottom: '4px' }}>
                  <img
                    src={runCourierLogo}
                    alt="RC"
                    style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '4px', display: 'block' }}
                  />
                </td>
                <td style={{ verticalAlign: 'middle', paddingLeft: '6px', paddingBottom: '4px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#000', letterSpacing: '0.5px' }}>RUN COURIER&#8482;</div>
                  <div style={{ fontSize: '7px', color: '#666' }}>Same Day Delivery</div>
                </td>
                <td style={{ verticalAlign: 'middle', textAlign: 'right', paddingBottom: '4px' }}>
                  <div style={{ fontSize: '8px', color: '#444' }}>runcourier.co.uk</div>
                  <div style={{ fontSize: '8px', color: '#444' }}>020 4634 6100</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* BARCODE + TRACKING — centred, job/date flanking */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
            <tbody>
              <tr>
                <td style={{ width: '50px', verticalAlign: 'top' }}>
                  {j.jobNumber && (
                    <>
                      <div style={{ fontSize: '7px', color: '#999', textTransform: 'uppercase' }}>Job</div>
                      <div style={{ fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{j.jobNumber}</div>
                    </>
                  )}
                </td>
                <td style={{ textAlign: 'center', verticalAlign: 'top' }}>
                  <div style={{ display: 'inline-flex', justifyContent: 'center' }}>{generateBarcode(job.trackingNumber)}</div>
                  <div style={{ fontSize: '9px', fontWeight: 'bold', fontFamily: 'monospace', letterSpacing: '1.5px', marginTop: '1px' }}>{job.trackingNumber}</div>
                </td>
                <td style={{ width: '55px', verticalAlign: 'top', textAlign: 'right' }}>
                  <div style={{ fontSize: '7px', color: '#999', textTransform: 'uppercase' }}>Date</div>
                  <div style={{ fontSize: '9px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{formatDate(job.createdAt)}</div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* PICKUP BOX */}
          <div style={{ border: '1px solid #000', borderRadius: '3px', padding: '6px 7px', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '3px' }}>
              <div style={{ backgroundColor: '#000', color: '#fff', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin style={{ width: '8px', height: '8px' }} />
              </div>
              <span style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pickup</span>
              {scheduledTime && (
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '8px', fontWeight: 'bold', color: '#007BFF' }}>
                  <Clock style={{ width: '8px', height: '8px' }} />
                  {scheduledTime}
                </span>
              )}
            </div>
            {j.pickupBuildingName && (
              <div style={{ fontSize: '9px', fontWeight: 'bold' }}>{j.pickupBuildingName}</div>
            )}
            <div style={{ fontSize: '9px', lineHeight: 1.25 }}>{job.pickupAddress}</div>
            <div style={{ fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '1px' }}>{job.pickupPostcode}</div>
            {(j.pickupContactName || j.senderName) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '2px', fontSize: '8px', color: '#333' }}>
                <User style={{ width: '8px', height: '8px', flexShrink: 0 }} />
                <span style={{ fontWeight: '600' }}>{j.pickupContactName || j.senderName}</span>
                {(j.pickupContactPhone || j.senderPhone) && (
                  <>
                    <span style={{ color: '#bbb' }}>&#183;</span>
                    <Phone style={{ width: '8px', height: '8px', flexShrink: 0 }} />
                    <span>{j.pickupContactPhone || j.senderPhone}</span>
                  </>
                )}
              </div>
            )}
            {job.pickupInstructions && (
              <div style={{ fontSize: '7.5px', color: '#666', marginTop: '2px', fontStyle: 'italic' }}>{job.pickupInstructions}</div>
            )}
          </div>

          {/* DELIVERY BOX — thicker border, slight bg */}
          <div style={{ border: '2px solid #000', borderRadius: '3px', padding: '6px 7px', backgroundColor: '#f7f7f7', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '3px' }}>
              <div style={{ backgroundColor: '#000', color: '#fff', borderRadius: '50%', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin style={{ width: '8px', height: '8px' }} />
              </div>
              <span style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Delivery</span>
            </div>
            {j.deliveryBuildingName && (
              <div style={{ fontSize: '9px', fontWeight: 'bold' }}>{j.deliveryBuildingName}</div>
            )}
            <div style={{ fontSize: '9px', lineHeight: 1.25 }}>{job.deliveryAddress}</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '1px' }}>{job.deliveryPostcode}</div>
            {job.recipientName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '2px', fontSize: '8px', color: '#333' }}>
                <User style={{ width: '8px', height: '8px', flexShrink: 0 }} />
                <span style={{ fontWeight: '600' }}>{job.recipientName}</span>
                {job.recipientPhone && (
                  <>
                    <span style={{ color: '#bbb' }}>&#183;</span>
                    <Phone style={{ width: '8px', height: '8px', flexShrink: 0 }} />
                    <span>{job.recipientPhone}</span>
                  </>
                )}
              </div>
            )}
            {job.deliveryInstructions && (
              <div style={{ fontSize: '7.5px', color: '#666', marginTop: '2px', fontStyle: 'italic' }}>{job.deliveryInstructions}</div>
            )}
          </div>

          {/* FOOTER INFO — single clean row */}
          <div style={{ borderTop: '1.5px solid #000', marginTop: '5px', paddingTop: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ textAlign: 'center', padding: '0 2px' }}>
                    <div style={{ fontSize: '7px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Weight</div>
                    <div style={{ fontSize: '9px', fontWeight: 'bold' }}>{job.weight || '—'} kg</div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '0 2px' }}>
                    <div style={{ fontSize: '7px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Vehicle</div>
                    <div style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'capitalize' }}>{job.vehicleType?.replace('_', ' ') || '—'}</div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '0 2px' }}>
                    <div style={{ fontSize: '7px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Type</div>
                    <div style={{ fontSize: '9px', fontWeight: 'bold' }}>{job.isMultiDrop ? 'Multi' : job.isReturnTrip ? 'Return' : 'Std'}</div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '0 2px' }}>
                    <div style={{ fontSize: '7px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Dist.</div>
                    <div style={{ fontSize: '9px', fontWeight: 'bold' }}>{j.distance || j.distanceMiles || '—'} mi</div>
                  </td>
                  {driverName && (
                    <td style={{ textAlign: 'center', padding: '0 2px', maxWidth: '60px' }}>
                      <div style={{ fontSize: '7px', color: '#888', textTransform: 'uppercase', fontWeight: '600' }}>Driver</div>
                      <div style={{ fontSize: '8px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{driverName}</div>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
            {j.parcelDescription && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '7.5px', color: '#666', marginTop: '3px', paddingTop: '2px', borderTop: '1px dashed #ddd' }}>
                <Package style={{ width: '8px', height: '8px', flexShrink: 0 }} />
                <span style={{ fontWeight: '600' }}>Parcel:</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.parcelDescription}</span>
              </div>
            )}
          </div>

          {/* TAGLINE */}
          <div style={{ textAlign: 'center', marginTop: '3px', paddingTop: '2px', borderTop: '1px dashed #ddd' }}>
            <span style={{ fontSize: '6.5px', color: '#aaa', letterSpacing: '0.3px' }}>Same Day Delivery &#8226; Tracked & Insured &#8226; runcourier.co.uk</span>
          </div>
        </div>
      </div>
    );
  }
);

ShippingLabel.displayName = 'ShippingLabel';
