import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WithdrawAssignmentRequest {
  jobId?: string;
  batchItemIds?: string[];
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

    const { jobId, batchItemIds, reason }: WithdrawAssignmentRequest = await req.json();

    if (batchItemIds && batchItemIds.length > 0) {
      const { data: result, error: rpcError } = await supabaseClient.rpc('withdraw_batch_items', {
        p_batch_item_ids: batchItemIds,
        p_withdrawn_by: user.id,
        p_reason: reason || null
      });

      if (rpcError) {
        console.error("Batch withdraw RPC error:", rpcError);
        return new Response(JSON.stringify({ error: rpcError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const withdrawnJobIds = result.items
        .filter((item: any) => item.status === 'withdrawn')
        .map((item: any) => item.job_id);

      if (withdrawnJobIds.length > 0) {
        const { data: withdrawnJobs } = await supabaseClient
          .from("jobs")
          .select("tracking_number, driver_id")
          .in("id", withdrawnJobIds);

        const driverIds = [...new Set(withdrawnJobs?.map(j => j.driver_id).filter(Boolean))];
        
        for (const driverId of driverIds) {
          const driverJobs = withdrawnJobs?.filter(j => j.driver_id === driverId) || [];
          try {
            await supabaseClient.from("notifications").insert({
              user_id: driverId,
              title: `${driverJobs.length} Job(s) Withdrawn`,
              message: `The following jobs have been withdrawn: ${driverJobs.map(j => j.tracking_number).join(", ")}`,
              type: "job_withdrawn",
              data: {
                job_count: driverJobs.length,
                tracking_numbers: driverJobs.map(j => j.tracking_number),
                reason: reason || null
              },
              is_read: false,
            });
          } catch (notifError) {
            console.error("Failed to create withdrawal notification:", notifError);
          }
        }
      }

      console.log(`[Withdraw] Batch withdrawal: ${result.withdrawn_count} jobs withdrawn by admin ${user.id}`);

      return new Response(JSON.stringify({
        success: true,
        withdrawnCount: result.withdrawn_count,
        items: result.items,
        message: `${result.withdrawn_count} job(s) withdrawn successfully.`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!jobId) {
      return new Response(JSON.stringify({ error: "jobId or batchItemIds is required" }), {
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

    const { error: batchItemUpdateError } = await supabaseClient
      .from("job_assignment_batch_items")
      .update({
        status: "withdrawn",
        withdrawn_at: new Date().toISOString(),
        withdrawn_by: user.id,
        withdrawal_reason: reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq("job_id", jobId)
      .in("status", ["pending", "assigned", "accepted"]);

    if (batchItemUpdateError) {
      console.error("Failed to update job_assignment_batch_items:", batchItemUpdateError);
    }

    if (previousDriverId) {
      try {
        await supabaseClient.from("notifications").insert({
          user_id: previousDriverId,
          title: "Job Withdrawn",
          message: `Job ${job.tracking_number} has been withdrawn.`,
          type: "job_withdrawn",
          data: {
            job_id: jobId,
            tracking_number: job.tracking_number,
            reason: reason || null
          },
          is_read: false,
        });
      } catch (notifError) {
        console.error("Failed to create withdrawal notification:", notifError);
      }
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
