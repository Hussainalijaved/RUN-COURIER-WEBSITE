import { forwardRef } from 'react';
import { Package, Truck, MapPin, Phone, Calendar, Scale } from 'lucide-react';
import logoImage from '@assets/LOGO APP 1_1764513632490.jpg';
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
      for (let i = 0; i < code.length * 3; i++) {
        const width = (i % 3 === 0) ? 2 : 1;
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
        className="bg-white text-black p-6"
        style={{
          width: '4in',
          height: '6in',
          fontFamily: 'Arial, sans-serif',
          boxSizing: 'border-box',
        }}
        data-testid="shipping-label"
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-3">
            <div className="flex items-center gap-2">
              <img 
                src={logoImage} 
                alt="Run Courier" 
                className="h-12 w-auto object-contain"
              />
              <div>
                <p className="text-xl font-bold text-[#0077B6] leading-tight">RUN</p>
                <p className="text-xl font-bold text-[#0077B6] leading-tight">COURIER</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600">www.runcourier.co.uk</p>
              <p className="text-xs text-gray-600">+44 7311 121 217</p>
            </div>
          </div>

          <div className="flex justify-center items-center mb-2">
            <div className="flex">{generateBarcode(job.trackingNumber)}</div>
          </div>
          <p className="text-center font-mono text-lg font-bold tracking-widest mb-4">
            {job.trackingNumber}
          </p>

          <div className="flex-1 space-y-3">
            <div className="border-2 border-gray-300 rounded p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-green-500 text-white rounded-full p-1">
                  <MapPin className="h-3 w-3" />
                </div>
                <span className="text-xs font-bold uppercase text-gray-500">From / Pickup</span>
              </div>
              <p className="text-sm font-semibold leading-tight">{job.pickupAddress}</p>
              <p className="text-lg font-bold font-mono mt-1">{job.pickupPostcode}</p>
              {job.pickupInstructions && (
                <p className="text-xs text-gray-600 mt-1 italic">{job.pickupInstructions}</p>
              )}
            </div>

            <div className="border-2 border-black rounded p-3 bg-gray-50">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-red-500 text-white rounded-full p-1">
                  <MapPin className="h-3 w-3" />
                </div>
                <span className="text-xs font-bold uppercase text-gray-500">To / Delivery</span>
              </div>
              <p className="text-sm font-semibold leading-tight">{job.deliveryAddress}</p>
              <p className="text-2xl font-bold font-mono mt-1">{job.deliveryPostcode}</p>
              {job.recipientName && (
                <div className="flex items-center gap-2 mt-2 text-sm">
                  <span className="font-semibold">Recipient:</span>
                  <span>{job.recipientName}</span>
                </div>
              )}
              {job.recipientPhone && (
                <div className="flex items-center gap-1 text-xs text-gray-600">
                  <Phone className="h-3 w-3" />
                  <span>{job.recipientPhone}</span>
                </div>
              )}
              {job.deliveryInstructions && (
                <p className="text-xs text-gray-600 mt-1 italic">{job.deliveryInstructions}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 border-t-2 border-black pt-3 mt-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
                <Scale className="h-3 w-3" />
              </div>
              <p className="text-xs text-gray-500">Weight</p>
              <p className="font-bold text-sm">{job.weight} kg</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
                <Truck className="h-3 w-3" />
              </div>
              <p className="text-xs text-gray-500">Vehicle</p>
              <p className="font-bold text-sm capitalize">{job.vehicleType?.replace('_', ' ')}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
                <Package className="h-3 w-3" />
              </div>
              <p className="text-xs text-gray-500">Type</p>
              <p className="font-bold text-sm">
                {job.isMultiDrop ? 'Multi' : job.isReturnTrip ? 'Return' : 'Standard'}
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-gray-500 mb-1">
                <Calendar className="h-3 w-3" />
              </div>
              <p className="text-xs text-gray-500">Date</p>
              <p className="font-bold text-sm">{formatDate(job.createdAt)}</p>
            </div>
          </div>

          <div className="border-t border-dashed border-gray-400 pt-2 mt-2 text-center">
            <p className="text-xs text-gray-500">
              Same Day Delivery | Tracked & Insured
            </p>
          </div>
        </div>
      </div>
    );
  }
);

ShippingLabel.displayName = 'ShippingLabel';
