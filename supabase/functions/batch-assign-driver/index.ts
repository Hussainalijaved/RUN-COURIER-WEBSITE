import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JobAssignment {
  jobId: string;
  driverPrice: number;
}

interface BatchAssignRequest {
  driverId: string;
  jobs: JobAssignment[];
  notes?: string;
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
      return new Response(JSON.stringify({ error: "Only admins and dispatchers can batch assign drivers" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { driverId, jobs, notes }: BatchAssignRequest = await req.json();

    if (!driverId || !jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return new Response(JSON.stringify({ error: "Invalid request: driverId and jobs array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const jobAssignments = jobs.map(job => ({
      job_id: job.jobId,
      driver_price: job.driverPrice
    }));

    const { data: result, error: rpcError } = await supabaseClient.rpc('batch_assign_driver', {
      p_driver_id: driverId,
      p_created_by: user.id,
      p_job_assignments: jobAssignments,
      p_notes: notes || null
    });

    if (rpcError) {
      console.error("Batch assign RPC error:", rpcError);
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract tracking numbers directly from RPC result (no requery needed)
    const trackingNumbers: string[] = result.jobs
      .map((job: any) => job.tracking_number)
      .filter((tn: string | null) => tn);

    try {
      await supabaseClient.from("notifications").insert({
        user_id: driverId,
        title: `${result.total_jobs} New Jobs Assigned`,
        message: `You have been assigned ${result.total_jobs} jobs: ${trackingNumbers.join(", ")}`,
        type: "job_assigned",
        data: {
          batch_id: result.batch_id,
          job_count: result.total_jobs,
          tracking_numbers: trackingNumbers,
          total_driver_price: result.total_driver_price
        },
        is_read: false,
      });
    } catch (notifError) {
      console.error("Failed to create notification:", notifError);
    }

    return new Response(JSON.stringify({
      success: true,
      batchId: result.batch_id,
      totalJobs: result.total_jobs,
      totalDriverPrice: result.total_driver_price,
      jobs: result.jobs,
      trackingNumbers
    }), {
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
