import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JobData {
  customerId?: string;
  customerEmail?: string;
  pickupAddress: string;
  pickupPostcode: string;
  pickupContactName?: string;
  pickupContactPhone?: string;
  pickupInstructions?: string;
  deliveryAddress: string;
  deliveryPostcode: string;
  recipientName?: string;
  recipientPhone?: string;
  deliveryInstructions?: string;
  vehicleType: string;
  weight?: string;
  distance?: string;
  basePrice: string;
  distancePrice?: string;
  weightSurcharge?: string;
  multiDropCharge?: string;
  returnTripCharge?: string;
  centralLondonCharge?: string;
  waitingTimeCharge?: string;
  totalPrice: string;
  scheduledPickupTime?: string;
  scheduledDeliveryTime?: string;
  isMultiDrop?: boolean;
  isReturnTrip?: boolean;
  paymentStatus?: string;
}

const validVehicleTypes = ["motorbike", "car", "small_van", "medium_van"];

const vehicleConfig: Record<string, { baseCharge: number; perMileRate: number }> = {
  motorbike: { baseCharge: 7, perMileRate: 1.3 },
  car: { baseCharge: 19, perMileRate: 1.2 },
  small_van: { baseCharge: 25, perMileRate: 1.3 },
  medium_van: { baseCharge: 30, perMileRate: 1.4 },
};

const weightSurcharges = [
  { min: 0, max: 5, charge: 0 },
  { min: 5, max: 20, charge: 5 },
  { min: 20, max: 50, charge: 15 },
  { min: 50, max: 100, charge: 25 },
  { min: 100, max: Infinity, charge: 40 },
];

function sanitizeNonNegative(value: string | undefined | null, defaultVal = 0, maxVal = 1000): number {
  if (!value) return defaultVal;
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0) return defaultVal;
  return Math.min(parsed, maxVal);
}

function calculateServerSidePrice(data: JobData): { 
  basePrice: number; 
  distancePrice: number; 
  weightSurcharge: number;
  multiDropCharge: number;
  returnTripCharge: number;
  centralLondonCharge: number;
  waitingTimeCharge: number;
  totalPrice: number;
  sanitizedDistance: number;
  sanitizedWeight: number;
} {
  const vehicle = vehicleConfig[data.vehicleType];
  const basePrice = vehicle.baseCharge;
  
  const sanitizedDistance = sanitizeNonNegative(data.distance, 0, 500);
  const distancePrice = sanitizedDistance > 0 ? sanitizedDistance * vehicle.perMileRate : 0;
  
  const sanitizedWeight = sanitizeNonNegative(data.weight, 0, 10000);
  let weightSurcharge = 0;
  for (const tier of weightSurcharges) {
    if (sanitizedWeight > tier.min && sanitizedWeight <= tier.max) {
      weightSurcharge = tier.charge;
      break;
    }
  }
  
  const multiDropCharge = sanitizeNonNegative(data.multiDropCharge, 0, 500);
  const returnTripCharge = sanitizeNonNegative(data.returnTripCharge, 0, 500);
  const centralLondonCharge = sanitizeNonNegative(data.centralLondonCharge, 0, 100);
  const waitingTimeCharge = sanitizeNonNegative(data.waitingTimeCharge, 0, 500);
  
  const totalPrice = basePrice + distancePrice + weightSurcharge + 
    multiDropCharge + returnTripCharge + centralLondonCharge + waitingTimeCharge;
  
  return { 
    basePrice, 
    distancePrice, 
    weightSurcharge, 
    multiDropCharge,
    returnTripCharge,
    centralLondonCharge,
    waitingTimeCharge,
    totalPrice,
    sanitizedDistance,
    sanitizedWeight
  };
}

function validateJobData(data: JobData): { valid: boolean; error?: string } {
  if (!data.pickupAddress || typeof data.pickupAddress !== "string" || data.pickupAddress.length < 5) {
    return { valid: false, error: "Valid pickup address is required" };
  }
  if (!data.pickupPostcode || typeof data.pickupPostcode !== "string") {
    return { valid: false, error: "Valid pickup postcode is required" };
  }
  if (!data.deliveryAddress || typeof data.deliveryAddress !== "string" || data.deliveryAddress.length < 5) {
    return { valid: false, error: "Valid delivery address is required" };
  }
  if (!data.deliveryPostcode || typeof data.deliveryPostcode !== "string") {
    return { valid: false, error: "Valid delivery postcode is required" };
  }
  if (!data.vehicleType || !validVehicleTypes.includes(data.vehicleType)) {
    return { valid: false, error: "Valid vehicle type is required" };
  }
  
  return { valid: true };
}

async function generateTrackingNumber(supabase: any): Promise<string> {
  const prefix = "RC";
  const currentYear = new Date().getFullYear();
  const pattern = `RC${currentYear}%`;
  
  const { data: latestJobs } = await supabase
    .from("jobs")
    .select("tracking_number")
    .ilike("tracking_number", pattern)
    .order("tracking_number", { ascending: false })
    .limit(1);

  let sequence = 1;
  if (latestJobs && latestJobs.length > 0) {
    const match = latestJobs[0].tracking_number.match(/RC\d{4}(\d{3})/);
    if (match) {
      sequence = parseInt(match[1], 10) + 1;
    }
  }

  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const randomSuffix = Array.from({ length: 3 }, () =>
    letters.charAt(Math.floor(Math.random() * letters.length))
  ).join("");

  const sequenceStr = sequence.toString().padStart(3, "0");
  return `${prefix}${currentYear}${sequenceStr}${randomSuffix}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobData: JobData = await req.json();
    
    const validation = validateJobData(jobData);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const serverPricing = calculateServerSidePrice(jobData);
    
    const trackingNumber = await generateTrackingNumber(supabaseClient);

    const { data: job, error: insertError } = await supabaseClient
      .from("jobs")
      .insert({
        tracking_number: trackingNumber,
        customer_id: jobData.customerId || user.id,
        customer_email: jobData.customerEmail,
        pickup_address: jobData.pickupAddress,
        pickup_postcode: jobData.pickupPostcode,
        pickup_contact_name: jobData.pickupContactName,
        pickup_contact_phone: jobData.pickupContactPhone,
        pickup_instructions: jobData.pickupInstructions,
        delivery_address: jobData.deliveryAddress,
        delivery_postcode: jobData.deliveryPostcode,
        recipient_name: jobData.recipientName,
        recipient_phone: jobData.recipientPhone,
        delivery_instructions: jobData.deliveryInstructions,
        vehicle_type: jobData.vehicleType,
        weight: serverPricing.sanitizedWeight.toFixed(2),
        distance: serverPricing.sanitizedDistance.toFixed(2),
        base_price: serverPricing.basePrice.toFixed(2),
        distance_price: serverPricing.distancePrice.toFixed(2),
        weight_surcharge: serverPricing.weightSurcharge.toFixed(2),
        multi_drop_charge: serverPricing.multiDropCharge.toFixed(2),
        return_trip_charge: serverPricing.returnTripCharge.toFixed(2),
        central_london_charge: serverPricing.centralLondonCharge.toFixed(2),
        waiting_time_charge: serverPricing.waitingTimeCharge.toFixed(2),
        total_price: serverPricing.totalPrice.toFixed(2),
        scheduled_pickup_time: jobData.scheduledPickupTime,
        scheduled_delivery_time: jobData.scheduledDeliveryTime,
        is_multi_drop: jobData.isMultiDrop ?? false,
        is_return_trip: jobData.isReturnTrip ?? false,
        payment_status: jobData.paymentStatus || "pending",
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Job creation error:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(job), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
