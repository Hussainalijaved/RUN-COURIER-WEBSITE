import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AssignDriverRequest {
  jobId: string;
  driverId: string;
  driverPrice?: string;
  dispatcherId?: string;
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

    const { data: userProfile } = await supabaseClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const userRole = userProfile?.role || user.user_metadata?.role;
    if (userRole !== "admin" && userRole !== "dispatcher") {
      return new Response(JSON.stringify({ error: "Only admins and dispatchers can assign drivers" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { jobId, driverId, driverPrice, dispatcherId }: AssignDriverRequest = await req.json();

    const { data: driver, error: driverError } = await supabaseClient
      .from("drivers")
      .select("*")
      .eq("id", driverId)
      .single();

    if (driverError || !driver) {
      return new Response(JSON.stringify({ error: "Driver not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (driver.is_active === false) {
      return new Response(JSON.stringify({ error: "Cannot assign jobs to deactivated drivers" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CRITICAL: In the Supabase drivers table, the 'id' column IS the auth.uid()
    // There is no separate 'user_id' column - the table uses 'id' directly as the auth identifier
    // The driver_id in jobs table MUST be set to this id for drivers to see their jobs via RLS
    const driverUserId = driver.id;

    const { data: existingJob, error: jobError } = await supabaseClient
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !existingJob) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const assignableStatuses = ["pending", "assigned"];
    if (!assignableStatuses.includes(existingJob.status)) {
      return new Response(JSON.stringify({ 
        error: `Cannot assign job in ${existingJob.status} status`,
        code: "INVALID_JOB_STATE"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CRITICAL: Driver price MUST be provided by admin - never default to customer price
    if (!driverPrice) {
      return new Response(JSON.stringify({ 
        error: "Driver price is required",
        code: "DRIVER_PRICE_REQUIRED"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedDriverPrice = parseFloat(driverPrice);
    if (isNaN(parsedDriverPrice) || parsedDriverPrice < 0) {
      return new Response(JSON.stringify({ error: "Invalid driver price" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const jobTotalPrice = parseFloat(existingJob.total_price || "0");
    if (jobTotalPrice > 0 && parsedDriverPrice > jobTotalPrice * 1.5) {
      return new Response(JSON.stringify({ 
        error: "Driver price cannot exceed 150% of job total",
        code: "DRIVER_PRICE_TOO_HIGH"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const validatedDriverPrice = parsedDriverPrice;

    // CRITICAL FIX: Use driverUserId (auth.uid) so RLS policy "auth.uid() = driver_id" works
    // This allows drivers to see their assigned jobs in the mobile app
    const { data: updatedJob, error: updateError } = await supabaseClient
      .from("jobs")
      .update({
        driver_id: driverUserId, // MUST be user_id (auth.uid), NOT driver table ID
        dispatcher_id: dispatcherId || user.id,
        driver_price: validatedDriverPrice.toFixed(2),
        status: "assigned",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select()
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also use driverUserId for job_assignments so RLS works for drivers to see their assignments
    const { error: assignmentError } = await supabaseClient
      .from("job_assignments")
      .insert({
        job_id: jobId,
        driver_id: driverUserId, // MUST be user_id (auth.uid) for RLS to work
        assigned_by: user.id,
        driver_price: validatedDriverPrice.toFixed(2),
        status: "sent",
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (assignmentError) {
      console.error("Failed to create job assignment:", assignmentError);
    }

    // Send push notification to driver
    try {
      const { data: devices } = await supabaseClient
        .from("driver_devices")
        .select("push_token")
        .eq("driver_id", driverUserId);

      if (devices && devices.length > 0) {
        const pickupShort = updatedJob.pickup_address?.split(",")[0] || "Pickup";
        const deliveryShort = updatedJob.delivery_address?.split(",")[0] || "Delivery";
        const priceText = `£${validatedDriverPrice.toFixed(2)}`;

        const messages = devices.map((device: any) => ({
          to: device.push_token,
          sound: "default",
          title: "New Job Assigned!",
          body: `${pickupShort} → ${deliveryShort} | ${priceText}`,
          data: {
            type: "job_assigned",
            jobId: jobId,
            trackingNumber: updatedJob.tracking_number,
            screen: "JobOffers",
          },
          priority: "high",
          channelId: "job-offers",
        }));

        const validMessages = messages.filter((m: any) => 
          m.to && (m.to.startsWith("ExponentPushToken[") || m.to.startsWith("ExpoPushToken["))
        );

        if (validMessages.length > 0) {
          await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(validMessages),
          });
          console.log(`Sent push notification to ${validMessages.length} devices for driver ${driverId}`);
        }
      }
    } catch (pushError) {
      console.error("Failed to send push notification:", pushError);
    }

    // SECURITY: Only return driver-safe fields - NEVER include total_price/customer pricing
    const safeResponse = {
      success: true,
      jobId: updatedJob.id,
      trackingNumber: updatedJob.tracking_number,
      status: updatedJob.status,
      driverId: driverUserId,
      driverPrice: validatedDriverPrice.toFixed(2),
      pickupAddress: updatedJob.pickup_address,
      deliveryAddress: updatedJob.delivery_address,
    };
    
    return new Response(JSON.stringify(safeResponse), {
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
