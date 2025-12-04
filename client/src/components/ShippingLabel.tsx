import { forwardRef } from 'react';
import { MapPin, Phone } from 'lucide-react';
import runCourierLogo from '@assets/LOGO APP 1_1764513632490.jpg';
import type { Job } from '@shared/schema';

interface ShippingLabelProps {
  job: Job;
  driverName?: string;
}

export const ShippingLabel = forwardRef<HTMLDivElement, ShippingLabelProps>(
  ({ job, driverName }, ref) => {
    const formatDate = (date: Date | string | null) => {
      if (!date) return new Date().toLocaleDateString('en-GB');
      return new Date(date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    };

    const generateBarcode = (trackingNumber: string) => {
      const bars = [];
      const code = trackingNumber.toUpperCase();
      for (let i = 0; i < code.length * 5; i++) {
        const width = (i % 3 === 0) ? 3 : (i % 2 === 0) ? 2 : 1;
        const isBlack = i % 2 === 0;
        bars.push(
          <div
            key={i}
            style={{
              width: `${width}px`,
              height: '40px',
              backgroundColor: isBlack ? '#000' : '#fff',
            }}
          />
        );
      }
      return bars;
    };

    return (
      <div
        ref={ref}
        className="bg-white text-black p-4"
        style={{
          width: '4in',
          height: '6in',
          fontFamily: 'Arial, sans-serif',
          boxSizing: 'border-box',
        }}
        data-testid="shipping-label"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between border-b-2 border-black pb-2 mb-2">
            <div className="flex items-center gap-2">
              <img 
                src={runCourierLogo} 
                alt="Run Courier" 
                style={{
                  height: '50px',
                  width: 'auto',
                  objectFit: 'contain',
                  filter: 'grayscale(1) contrast(5) brightness(0.7)',
                }}
              />
              <div style={{ lineHeight: '1' }}>
                <p style={{ fontSize: '18px', fontWeight: '800', color: 'black', letterSpacing: '1px' }}>RUN</p>
                <p style={{ fontSize: '18px', fontWeight: '800', color: 'black', letterSpacing: '1px' }}>COURIER</p>
              </div>
            </div>
            <div className="text-right">
              <p style={{ fontSize: '10px', color: '#444' }}>www.runcourier.co.uk</p>
              <p style={{ fontSize: '10px', color: '#444' }}>+44 7311 121 217</p>
            </div>
          </div>

          <div className="flex justify-center items-center mb-1">
            <div className="flex">{generateBarcode(job.trackingNumber)}</div>
          </div>
          <p className="text-center font-mono text-base font-bold tracking-widest mb-2">
            {job.trackingNumber}
          </p>

          <div className="flex-1 space-y-2">
            <div className="border border-black rounded p-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-black text-white rounded-full p-1">
                  <MapPin className="h-3 w-3" />
                </div>
                <span className="text-xs font-bold uppercase text-black">From / Pickup</span>
              </div>
              <p className="text-sm font-semibold leading-tight">{job.pickupAddress}</p>
              <p className="text-lg font-bold font-mono mt-1">{job.pickupPostcode}</p>
              {job.pickupInstructions && (
                <p className="text-xs text-gray-600 mt-1 italic">{job.pickupInstructions}</p>
              )}
            </div>

            <div className="border-2 border-black rounded p-2 bg-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <div className="bg-black text-white rounded-full p-1">
                  <MapPin className="h-3 w-3" />
                </div>
                <span className="text-xs font-bold uppercase text-black">To / Delivery</span>
              </div>
              <p className="text-sm font-semibold leading-tight">{job.deliveryAddress}</p>
              <p className="text-xl font-bold font-mono mt-1">{job.deliveryPostcode}</p>
              {job.recipientName && (
                <div className="flex items-center gap-2 mt-1 text-sm">
                  <span className="font-semibold">Recipient:</span>
                  <span>{job.recipientName}</span>
                  {job.recipientPhone && (
                    <>
                      <span className="text-gray-400">|</span>
                      <Phone className="h-3 w-3" />
                      <span className="text-xs">{job.recipientPhone}</span>
                    </>
                  )}
                </div>
              )}
              {job.deliveryInstructions && (
                <p className="text-xs text-gray-600 mt-1 italic">{job.deliveryInstructions}</p>
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
              <p className="font-bold text-xs">
                {job.isMultiDrop ? 'Multi' : job.isReturnTrip ? 'Return' : 'Std'}
              </p>
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
  }
);

ShippingLabel.displayName = 'ShippingLabel';
