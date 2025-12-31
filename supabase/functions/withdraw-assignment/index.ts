import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WithdrawAssignmentRequest {
  jobId: string;
  reason?: string;
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
      return new Response(JSON.stringify({ error: "Only admins and dispatchers can withdraw assignments" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { jobId, reason }: WithdrawAssignmentRequest = await req.json();

    if (!jobId) {
      return new Response(JSON.stringify({ error: "jobId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: job, error: jobError } = await supabaseClient
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const withdrawableStatuses = ["assigned", "offered", "accepted"];
    if (!withdrawableStatuses.includes(job.status)) {
      return new Response(JSON.stringify({ 
        error: `Cannot withdraw job in '${job.status}' status. Only assigned, offered, or accepted jobs can be withdrawn.`,
        code: "INVALID_JOB_STATE"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const previousDriverId = job.driver_id;

    const { data: updatedJob, error: updateError } = await supabaseClient
      .from("jobs")
      .update({
        driver_id: null,
        dispatcher_id: null,
        driver_price: null,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update job:", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: assignmentUpdateError } = await supabaseClient
      .from("job_assignments")
      .update({
        status: "withdrawn",
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId)
      .in("status", ["pending", "sent", "assigned", "accepted"]);

    if (assignmentUpdateError) {
      console.error("Failed to update job_assignments:", assignmentUpdateError);
    }

    console.log(`[Withdraw] Job ${jobId} withdrawn from driver ${previousDriverId} by admin ${user.id}`);

    return new Response(JSON.stringify({
      ...updatedJob,
      message: "Assignment withdrawn successfully. Job is now available for reassignment.",
      previousDriverId,
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
