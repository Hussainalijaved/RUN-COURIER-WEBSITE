import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { VehicleType } from '@shared/schema';
import type { ServiceType } from '@/lib/pricing';

export interface BookingDraft {
  pickupPostcode: string;
  pickupAddress: string;
  pickupBuildingName: string;
  pickupName: string;
  pickupPhone: string;
  pickupInstructions: string;
  customerEmail: string;
  
  deliveryPostcode: string;
  deliveryAddress: string;
  deliveryBuildingName: string;
  recipientName: string;
  recipientPhone: string;
  deliveryInstructions: string;
  
  vehicleType: VehicleType | '';
  weight: number;
  distance: number;
  estimatedTime: number;
  
  isMultiDrop: boolean;
  multiDropStops: string[];
  isReturnTrip: boolean;
  returnToSameLocation: boolean;
  returnPostcode: string;
  
  pickupDate: string;
  pickupTime: string;
  deliveryDate: string;
  deliveryTime: string;
  
  serviceType: ServiceType;
  serviceTypePercent: number;
  serviceTypeAmount: number;

  totalPrice: number;
  basePrice: number;
  distancePrice: number;
  weightSurcharge: number;
  rushHourCharge: number;
  centralLondonCharge: number;
  multiDropCharge: number;
  returnTripCharge: number;
  waitingTimeCharge: number;
  
  savedAt: string;
}

const BOOKING_STORAGE_KEY = 'runcourier_booking_draft';
const BOOKING_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

const defaultBookingDraft: BookingDraft = {
  pickupPostcode: '',
  pickupAddress: '',
  pickupBuildingName: '',
  pickupName: '',
  pickupPhone: '',
  pickupInstructions: '',
  customerEmail: '',
  
  deliveryPostcode: '',
  deliveryAddress: '',
  deliveryBuildingName: '',
  recipientName: '',
  recipientPhone: '',
  deliveryInstructions: '',
  
  vehicleType: '',
  weight: 1,
  distance: 0,
  estimatedTime: 0,
  
  isMultiDrop: false,
  multiDropStops: [],
  isReturnTrip: false,
  returnToSameLocation: true,
  returnPostcode: '',
  
  pickupDate: '',
  pickupTime: '',
  deliveryDate: '',
  deliveryTime: '',
  
  serviceType: 'standard' as ServiceType,
  serviceTypePercent: 10,
  serviceTypeAmount: 0,

  totalPrice: 0,
  basePrice: 0,
  distancePrice: 0,
  weightSurcharge: 0,
  rushHourCharge: 0,
  centralLondonCharge: 0,
  multiDropCharge: 0,
  returnTripCharge: 0,
  waitingTimeCharge: 0,
  
  savedAt: '',
};

interface BookingContextType {
  booking: BookingDraft;
  updateBooking: (updates: Partial<BookingDraft>) => void;
  clearBooking: () => void;
  hasBookingData: boolean;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

function loadBookingFromStorage(): BookingDraft {
  try {
    const saved = localStorage.getItem(BOOKING_STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved) as BookingDraft;
      const savedTime = data.savedAt ? new Date(data.savedAt) : null;
      const now = new Date();
      
      if (savedTime && (now.getTime() - savedTime.getTime()) < BOOKING_EXPIRY_MS) {
        console.log('[Booking] Restored booking draft from localStorage');
        return { ...defaultBookingDraft, ...data };
      }
      
      localStorage.removeItem(BOOKING_STORAGE_KEY);
      console.log('[Booking] Removed expired booking draft');
    }
  } catch (e) {
    console.error('[Booking] Error loading saved booking:', e);
  }
  return defaultBookingDraft;
}

function saveBookingToStorage(booking: BookingDraft): void {
  try {
    const dataToSave = { ...booking, savedAt: new Date().toISOString() };
    localStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(dataToSave));
  } catch (e) {
    console.error('[Booking] Error saving booking draft:', e);
  }
}

export function BookingProvider({ children }: { children: ReactNode }) {
  const [booking, setBooking] = useState<BookingDraft>(() => loadBookingFromStorage());
  
  useEffect(() => {
    const hasMeaningfulData = 
      booking.pickupPostcode || 
      booking.deliveryPostcode || 
      booking.vehicleType ||
      booking.totalPrice > 0;
    
    if (hasMeaningfulData) {
      saveBookingToStorage(booking);
    }
  }, [booking]);

  const updateBooking = (updates: Partial<BookingDraft>) => {
    setBooking(prev => ({ ...prev, ...updates }));
  };

  const clearBooking = () => {
    setBooking(defaultBookingDraft);
    try {
      localStorage.removeItem(BOOKING_STORAGE_KEY);
      console.log('[Booking] Cleared booking draft');
    } catch (e) {
      console.error('[Booking] Error clearing booking draft:', e);
    }
  };

  const hasBookingData = !!(
    booking.pickupPostcode || 
    booking.deliveryPostcode || 
    booking.vehicleType ||
    booking.totalPrice > 0
  );

  return (
    <BookingContext.Provider value={{ booking, updateBooking, clearBooking, hasBookingData }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const context = useContext(BookingContext);
  if (context === undefined) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return context;
}
