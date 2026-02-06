import { forwardRef } from 'react';
import { MapPin, Phone } from 'lucide-react';
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
}

interface MultiDropShippingLabelsProps {
  job: Job;
  stops: MultiDropStop[];
  driverName?: string;
}

interface LabelData {
  fromAddress: string;
  fromPostcode: string;
  toAddress: string;
  toPostcode: string;
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
    const formatDate = (date: Date | string | null) => {
      if (!date) return new Date().toLocaleDateString('en-GB');
      return new Date(date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    };

    const generateBarcode = (trackingNumber: string, stopNum: number) => {
      const bars = [];
      const code = `${trackingNumber}-${stopNum}`.toUpperCase();
      for (let i = 0; i < code.length * 4; i++) {
        const width = (i % 3 === 0) ? 3 : (i % 2 === 0) ? 2 : 1;
        const isBlack = i % 2 === 0;
        bars.push(
          <div
            key={i}
            style={{
              width: `${width}px`,
              height: '35px',
              backgroundColor: isBlack ? '#000' : '#fff',
            }}
          />
        );
      }
      return bars;
    };

    const sortedStops = [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
    const totalStops = sortedStops.length + 1;

    const labels: LabelData[] = [];

    if (sortedStops.length > 0) {
      labels.push({
        fromAddress: job.pickupAddress,
        fromPostcode: job.pickupPostcode,
        toAddress: sortedStops[0].address,
        toPostcode: sortedStops[0].postcode,
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
          toAddress: sortedStops[i + 1].address,
          toPostcode: sortedStops[i + 1].postcode,
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
        toAddress: job.deliveryAddress,
        toPostcode: job.deliveryPostcode,
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
        toAddress: job.deliveryAddress,
        toPostcode: job.deliveryPostcode,
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
        className="bg-white text-black p-4"
        style={{
          width: '4in',
          height: '6in',
          fontFamily: 'Arial, sans-serif',
          boxSizing: 'border-box',
          pageBreakAfter: index < labels.length - 1 ? 'always' : 'auto',
        }}
        data-testid={`shipping-label-stop-${label.stopNumber}`}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-2">
            <div className="flex items-center gap-2">
              <img 
                src={runCourierLogo} 
                alt="Run Courier" 
                style={{
                  height: '40px',
                  width: 'auto',
                  objectFit: 'contain',
                  borderRadius: '6px',
                }}
              />
              <div style={{ lineHeight: '1', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', margin: '0', color: '#000' }}>RUN COURIER™</p>
              </div>
            </div>
            <div className="text-center">
              <div 
                style={{ 
                  backgroundColor: '#000', 
                  color: '#fff', 
                  padding: '4px 12px', 
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                }}
              >
                STOP {label.stopNumber} of {label.totalStops}
              </div>
            </div>
            <div className="text-right">
              <p style={{ fontSize: '9px', color: '#444' }}>www.runcourier.co.uk</p>
              <p style={{ fontSize: '9px', color: '#444' }}>+44 20 4634 6100</p>
            </div>
          </div>

          {(job as any).jobNumber && (
            <div className="text-center mb-1">
              <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase', letterSpacing: '1px' }}>Job No.</span>
              <p className="font-mono text-base font-bold" style={{ margin: '0' }}>{(job as any).jobNumber}</p>
            </div>
          )}

          <div className="flex justify-center items-center mb-1">
            <div className="flex">{generateBarcode(job.trackingNumber, label.stopNumber)}</div>
          </div>
          <p className="text-center font-mono text-xs font-bold tracking-widest mb-2">
            {job.trackingNumber}-{label.stopNumber}
          </p>

          <div className="flex-1 space-y-2">
            <div className="border border-black rounded p-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="bg-black text-white rounded-full p-1">
                  <MapPin className="h-3 w-3" />
                </div>
                <span className="text-xs font-bold uppercase text-black">
                  {label.isPickup ? 'Pickup' : 'From Stop ' + (label.stopNumber - 1)}
                </span>
              </div>
              <p className="text-sm font-semibold leading-tight">{label.fromAddress}</p>
              <p className="text-lg font-bold font-mono mt-1">{label.fromPostcode}</p>
            </div>

            <div className="border-2 border-black rounded p-2 bg-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <div className="bg-black text-white rounded-full p-1">
                  <MapPin className="h-3 w-3" />
                </div>
                <span className="text-xs font-bold uppercase text-black">
                  {label.isFinalDelivery ? 'Final Delivery' : 'Deliver To Stop ' + label.stopNumber}
                </span>
              </div>
              <p className="text-sm font-semibold leading-tight">{label.toAddress}</p>
              <p className="text-xl font-bold font-mono mt-1">{label.toPostcode}</p>
              {label.recipientName && (
                <div className="flex items-center gap-2 mt-1 text-sm">
                  <span className="font-semibold">Recipient:</span>
                  <span>{label.recipientName}</span>
                  {label.recipientPhone && (
                    <>
                      <span className="text-gray-400">|</span>
                      <Phone className="h-3 w-3" />
                      <span className="text-xs">{label.recipientPhone}</span>
                    </>
                  )}
                </div>
              )}
              {label.deliveryInstructions && (
                <p className="text-xs text-gray-600 mt-1 italic">{label.deliveryInstructions}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1 border-t border-black pt-2 mt-1 text-center">
            <div>
              <p className="text-[10px] text-gray-500">Weight</p>
              <p className="font-bold text-xs">{job.weight} kg</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Vehicle</p>
              <p className="font-bold text-xs capitalize">{job.vehicleType?.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Type</p>
              <p className="font-bold text-xs">Multi-Drop</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Date</p>
              <p className="font-bold text-xs">{formatDate(job.createdAt)}</p>
            </div>
          </div>

          <div className="border-t border-dashed border-gray-400 pt-1 mt-1 text-center">
            <p className="text-[10px] text-gray-500">
              Same Day Delivery | Tracked & Insured | www.runcourier.co.uk
            </p>
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
