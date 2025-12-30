import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateDriverRequest {
  userId: string;
  email: string;
  fullName?: string;
  phone?: string;
  postcode?: string;
  address?: string;
  vehicleType?: string;
}

function generateDriverId(existingCodes: Set<string>): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let attempts = 0;
  const maxAttempts = 1000;
  
  while (attempts < maxAttempts) {
    const num1 = Math.floor(Math.random() * 10);
    const num2 = Math.floor(Math.random() * 10);
    const letter = letters[Math.floor(Math.random() * 26)];
    const code = `RC${num1}${num2}${letter}`;
    
    if (!existingCodes.has(code)) {
      return code;
    }
    attempts++;
  }
  
  throw new Error('Unable to generate unique driver ID after maximum attempts');
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

    const body: CreateDriverRequest = await req.json();
    const { userId, email, fullName, phone, postcode, address, vehicleType } = body;

    if (!userId || !email) {
      return new Response(JSON.stringify({ error: "userId and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingDriver } = await supabaseClient
      .from("drivers")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existingDriver) {
      return new Response(JSON.stringify({ error: "Driver already exists for this user" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: allDrivers } = await supabaseClient
      .from("drivers")
      .select("driver_id");
    
    const existingCodes = new Set<string>(
      (allDrivers || [])
        .map((d: { driver_id: string | null }) => d.driver_id)
        .filter((code: string | null): code is string => Boolean(code))
    );
    
    const driverId = generateDriverId(existingCodes);

    const { data: newDriver, error: insertError } = await supabaseClient
      .from("drivers")
      .insert({
        user_id: userId,
        driver_id: driverId,
        email: email,
        full_name: fullName || null,
        phone: phone || null,
        postcode: postcode || null,
        address: address || null,
        vehicle_type: vehicleType || 'car',
        is_available: false,
        is_verified: false,
        is_active: true,
        rating: '5.0',
        total_jobs: 0,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to create driver:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Created driver with ID: ${driverId} for user: ${email}`);

    return new Response(JSON.stringify({
      ...newDriver,
      driverCode: driverId,
    }), {
      status: 201,
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
