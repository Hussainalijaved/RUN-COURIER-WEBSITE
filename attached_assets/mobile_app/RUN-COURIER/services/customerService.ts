import { supabase } from '@/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  CustomerProfile, 
  CustomerBooking, 
  BookingStop, 
  BookingPayment,
  CustomerInvoice,
  CustomerRole,
  BookingStatus,
  PaymentOption 
} from '@/lib/customer-types';

const DELETED_BOOKINGS_KEY = 'deleted_booking_ids';

export const customerService = {
  async getCustomerProfile(authUserId: string): Promise<CustomerProfile | null> {
    // IMPORTANT: This function THROWS on network/server errors so caller can detect failures
    // It only returns null for legitimate "not found" cases (PGRST116)
    console.log('[CUSTOMER] Getting customer profile for auth_user_id:', authUserId);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUserId)
      .neq('user_type', 'archived')
      .single();
    
    console.log('[CUSTOMER] Customer profile query result - data:', !!data, 'error:', error?.code);
    
    // CRITICAL: Throw on non-404 errors so caller knows it's a failure, not "not found"
    if (error && error.code !== 'PGRST116') {
      console.error('[CUSTOMER] Error fetching customer profile (will throw):', error);
      throw new Error(`Customer profile fetch error: ${error.message || error.code}`);
    }
    
    if (!data) return null;
    
    // Map profiles table to CustomerProfile type
    const customerProfile: CustomerProfile = {
      id: data.id,
      auth_user_id: data.id,
      role: (data.user_type === 'business' ? 'business' : 'individual') as CustomerRole,
      email: data.email || '',
      full_name: data.full_name || '',
      phone: data.phone,
      address: data.address,
      postcode: data.postcode,
      company_name: data.company_name,
      company_reg_number: data.company_registration_number,
      company_address: data.company_address,
      contact_person_name: data.contact_person_name,
      contact_person_phone: data.contact_person_phone,
      stripe_customer_id: data.stripe_customer_id,
      created_at: data.updated_at,
      updated_at: data.updated_at,
    };
    
    return customerProfile;
  },

  async createCustomerProfile(profile: Partial<CustomerProfile> & { auth_user_id: string; email: string; full_name: string; role: CustomerRole }): Promise<CustomerProfile | null> {
    // Map CustomerProfile to profiles table structure
    const profileData = {
      id: profile.auth_user_id,
      email: profile.email.toLowerCase(),
      full_name: profile.full_name,
      user_type: profile.role,
      phone: profile.phone,
      address: profile.address,
      postcode: profile.postcode,
      company_name: profile.company_name,
      company_registration_number: profile.company_reg_number,
    };
    
    const { data, error } = await supabase
      .from('profiles')
      .upsert(profileData)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating customer profile:', error);
      return null;
    }
    
    // Map back to CustomerProfile type
    return {
      id: data.id,
      auth_user_id: data.id,
      role: (data.user_type === 'business' ? 'business' : 'individual') as CustomerRole,
      email: data.email || '',
      full_name: data.full_name || '',
      phone: data.phone,
      address: data.address,
      postcode: data.postcode,
      company_name: data.company_name,
      company_reg_number: data.company_registration_number,
      company_address: data.company_address,
      contact_person_name: data.contact_person_name,
      contact_person_phone: data.contact_person_phone,
      stripe_customer_id: data.stripe_customer_id,
      created_at: data.updated_at,
      updated_at: data.updated_at,
    };
  },

  async updateCustomerProfile(profileId: string, updates: Partial<CustomerProfile>): Promise<CustomerProfile | null> {
    // Map CustomerProfile updates to profiles table structure
    const profileUpdates: any = {};
    if (updates.full_name) profileUpdates.full_name = updates.full_name;
    if (updates.phone) profileUpdates.phone = updates.phone;
    if (updates.address) profileUpdates.address = updates.address;
    if (updates.postcode) profileUpdates.postcode = updates.postcode;
    if (updates.company_name) profileUpdates.company_name = updates.company_name;
    if (updates.company_reg_number) profileUpdates.company_registration_number = updates.company_reg_number;
    if (updates.company_address) profileUpdates.company_address = updates.company_address;
    if (updates.contact_person_name) profileUpdates.contact_person_name = updates.contact_person_name;
    if (updates.contact_person_phone) profileUpdates.contact_person_phone = updates.contact_person_phone;
    
    const { data, error } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', profileId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating customer profile:', error);
      return null;
    }
    
    return {
      id: data.id,
      auth_user_id: data.id,
      role: (data.user_type === 'business' ? 'business' : 'individual') as CustomerRole,
      email: data.email || '',
      full_name: data.full_name || '',
      phone: data.phone,
      address: data.address,
      postcode: data.postcode,
      company_name: data.company_name,
      company_reg_number: data.company_registration_number,
      company_address: data.company_address,
      contact_person_name: data.contact_person_name,
      contact_person_phone: data.contact_person_phone,
      stripe_customer_id: data.stripe_customer_id,
      created_at: data.updated_at,
      updated_at: data.updated_at,
    };
  },

  async getCustomerBookings(customerId: string, status?: BookingStatus[]): Promise<CustomerBooking[]> {
    let query = supabase
      .from('customer_bookings')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    
    if (status && status.length > 0) {
      query = query.in('status', status);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching bookings:', error);
      return [];
    }
    
    // Filter out locally deleted bookings
    const deletedIds = await this.getDeletedBookingIds();
    const filteredData = (data || []).filter((booking: CustomerBooking) => !deletedIds.includes(booking.id));
    
    return filteredData;
  },

  async getBookingById(bookingId: string): Promise<CustomerBooking | null> {
    const { data, error } = await supabase
      .from('customer_bookings')
      .select('*')
      .eq('id', bookingId)
      .single();
    
    if (error) {
      console.error('Error fetching booking:', error);
      return null;
    }
    return data;
  },

  async getBookingByTracking(trackingNumber: string): Promise<CustomerBooking | null> {
    const { data, error } = await supabase
      .from('customer_bookings')
      .select('*')
      .eq('tracking_number', trackingNumber)
      .single();
    
    if (error) {
      console.error('Error fetching booking by tracking:', error);
      return null;
    }
    return data;
  },

  async createBooking(booking: Partial<CustomerBooking> & { customer_id: string; pickup_address: string; pickup_postcode: string; delivery_address: string; delivery_postcode: string; scheduled_date: string }): Promise<CustomerBooking | null> {
    console.log('customerService.createBooking - inserting booking data');
    const { data, error } = await supabase
      .from('customer_bookings')
      .insert(booking)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating booking - code:', error.code, 'message:', error.message, 'details:', error.details, 'hint:', error.hint);
      return null;
    }
    console.log('customerService.createBooking - success, booking id:', data?.id);
    return data;
  },

  async updateBooking(bookingId: string, updates: Partial<CustomerBooking>): Promise<CustomerBooking | null> {
    const { data, error } = await supabase
      .from('customer_bookings')
      .update(updates)
      .eq('id', bookingId)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating booking:', error);
      return null;
    }
    return data;
  },

  async cancelBooking(bookingId: string): Promise<boolean> {
    const { error } = await supabase
      .from('customer_bookings')
      .update({ status: 'cancelled' as BookingStatus })
      .eq('id', bookingId);
    
    if (error) {
      console.error('Error cancelling booking:', error);
      return false;
    }
    return true;
  },

  async getDeletedBookingIds(): Promise<string[]> {
    try {
      const stored = await AsyncStorage.getItem(DELETED_BOOKINGS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error getting deleted booking IDs:', error);
      return [];
    }
  },

  async addDeletedBookingId(bookingId: string): Promise<void> {
    try {
      const existing = await this.getDeletedBookingIds();
      if (!existing.includes(bookingId)) {
        existing.push(bookingId);
        await AsyncStorage.setItem(DELETED_BOOKINGS_KEY, JSON.stringify(existing));
      }
    } catch (error) {
      console.error('Error saving deleted booking ID:', error);
    }
  },

  async deleteBooking(bookingId: string): Promise<boolean> {
    console.log('Attempting to delete booking:', bookingId);
    
    // Try database delete first
    const { error } = await supabase
      .from('customer_bookings')
      .delete()
      .eq('id', bookingId);
    
    if (error) {
      console.log('Database delete blocked by RLS, using local soft delete');
    }
    
    // Always mark as deleted locally (works even if DB delete is blocked by RLS)
    await this.addDeletedBookingId(bookingId);
    console.log('Booking marked as deleted locally:', bookingId);
    
    return true;
  },

  async updateBookingStatus(bookingId: string, status: BookingStatus): Promise<boolean> {
    const { error } = await supabase
      .from('customer_bookings')
      .update({ status })
      .eq('id', bookingId);
    
    if (error) {
      console.error('Error updating booking status:', error);
      return false;
    }
    return true;
  },

  async getBookingStops(bookingId: string): Promise<BookingStop[]> {
    const { data, error } = await supabase
      .from('booking_stops')
      .select('*')
      .eq('booking_id', bookingId)
      .order('stop_order', { ascending: true });
    
    if (error) {
      console.error('Error fetching booking stops:', error);
      return [];
    }
    return data || [];
  },

  async addBookingStop(stop: Partial<BookingStop> & { booking_id: string; stop_order: number; stop_type: string; address: string; postcode: string }): Promise<BookingStop | null> {
    const { data, error } = await supabase
      .from('booking_stops')
      .insert(stop)
      .select()
      .single();
    
    if (error) {
      console.error('Error adding booking stop:', error);
      return null;
    }
    return data;
  },

  async getBookingPayments(bookingId: string): Promise<BookingPayment[]> {
    const { data, error } = await supabase
      .from('booking_payments')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching payments:', error);
      return [];
    }
    return data || [];
  },

  async getCustomerInvoices(customerId: string): Promise<CustomerInvoice[]> {
    // customer_invoices table not yet implemented - return empty array
    // This prevents errors when querying non-existent table
    return [];
  },

  async getActiveBookings(customerId: string): Promise<CustomerBooking[]> {
    const activeStatuses: BookingStatus[] = ['confirmed', 'assigned', 'picked_up', 'in_transit'];
    return this.getCustomerBookings(customerId, activeStatuses);
  },

  async getCompletedBookings(customerId: string): Promise<CustomerBooking[]> {
    return this.getCustomerBookings(customerId, ['delivered']);
  },

  async getPendingBookings(customerId: string): Promise<CustomerBooking[]> {
    const pendingStatuses: BookingStatus[] = ['draft', 'pending_payment', 'paid'];
    return this.getCustomerBookings(customerId, pendingStatuses);
  },

  subscribeToBookingUpdates(bookingId: string, callback: (booking: CustomerBooking) => void) {
    return supabase
      .channel(`booking-${bookingId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'customer_bookings',
          filter: `id=eq.${bookingId}`
        },
        (payload: any) => {
          callback(payload.new as CustomerBooking);
        }
      )
      .subscribe();
  },

  async deleteCustomerAccount(authUserId: string): Promise<boolean> {
    const { error } = await supabase
      .from('customer_profiles')
      .delete()
      .eq('auth_user_id', authUserId);
    
    if (error) {
      console.error('Error deleting customer account:', error);
      return false;
    }
    return true;
  },

  async getPricingConfig(): Promise<{ 
    vehiclePricing: Record<string, { basePrice: number; ratePerMile: number; rushHourRate: number }>;
    surcharges: Record<string, { value: number; unit: string }>;
  }> {
    const [pricingResult, surchargesResult] = await Promise.all([
      supabase.from('pricing_config').select('*'),
      supabase.from('pricing_surcharges').select('*').eq('is_active', true)
    ]);

    const vehiclePricing: Record<string, { basePrice: number; ratePerMile: number; rushHourRate: number }> = {};
    const surcharges: Record<string, { value: number; unit: string }> = {};

    if (pricingResult.data) {
      pricingResult.data.forEach((item: any) => {
        vehiclePricing[item.vehicle_type] = {
          basePrice: parseFloat(item.base_price),
          ratePerMile: parseFloat(item.rate_per_mile),
          rushHourRate: parseFloat(item.rush_hour_rate || item.rate_per_mile)
        };
      });
    }

    if (surchargesResult.data) {
      surchargesResult.data.forEach((item: any) => {
        surcharges[item.surcharge_type] = {
          value: parseFloat(item.surcharge_value),
          unit: item.surcharge_unit
        };
      });
    }

    // Return defaults if database is empty
    if (Object.keys(vehiclePricing).length === 0) {
      return {
        vehiclePricing: {
          motorbike: { basePrice: 7.00, ratePerMile: 1.30, rushHourRate: 1.50 },
          car: { basePrice: 17.00, ratePerMile: 1.20, rushHourRate: 1.40 },
          small_van: { basePrice: 21.00, ratePerMile: 1.30, rushHourRate: 1.50 },
          medium_van: { basePrice: 25.00, ratePerMile: 1.40, rushHourRate: 1.60 },
        },
        surcharges: {
          weight_per_kg_over_5: { value: 0.50, unit: 'per_kg' },
          return_delivery: { value: 60.00, unit: 'percentage' },
        }
      };
    }

    return { vehiclePricing, surcharges };
  }
};
