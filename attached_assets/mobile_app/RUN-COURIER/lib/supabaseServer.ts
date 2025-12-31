import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase server credentials not fully configured');
}

export const supabaseServer = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export async function updateBookingPaymentStatus(
  bookingId: string, 
  paymentIntentId: string, 
  status: 'confirmed' | 'failed'
) {
  if (!supabaseServer) {
    throw new Error('Supabase server not configured');
  }

  const { data, error } = await supabaseServer
    .from('customer_bookings')
    .update({ 
      status,
      payment_intent_id: paymentIntentId,
      payment_confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId);

  if (error) {
    console.error('Error updating booking payment status:', error);
    throw error;
  }

  return data;
}

export async function getBookingByPaymentIntent(paymentIntentId: string) {
  if (!supabaseServer) {
    throw new Error('Supabase server not configured');
  }

  const { data, error } = await supabaseServer
    .from('customer_bookings')
    .select('*')
    .eq('payment_intent_id', paymentIntentId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error getting booking by payment intent:', error);
    throw error;
  }

  return data;
}
