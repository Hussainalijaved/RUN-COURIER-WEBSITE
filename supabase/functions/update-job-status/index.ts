import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdateStatusRequest {
  jobId: string;
  status: string;
  rejectionReason?: string;
}

const validStatuses = [
  "pending",
  "assigned",
  "accepted",
  "on_the_way_pickup",
  "arrived_pickup",
  "collected",
  "on_the_way_delivery",
  "delivered",
  "cancelled",
];

const statusTransitions: Record<string, string[]> = {
  pending: ["assigned", "cancelled"],
  assigned: ["accepted", "cancelled", "pending"],
  accepted: ["on_the_way_pickup", "cancelled"],
  on_the_way_pickup: ["arrived_pickup", "cancelled"],
  arrived_pickup: ["collected", "cancelled"],
  collected: ["on_the_way_delivery", "cancelled"],
  on_the_way_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

const driverAllowedStatuses = [
  "accepted",
  "on_the_way_pickup",
  "arrived_pickup",
  "collected",
  "on_the_way_delivery",
  "delivered",
];

const customerAllowedStatuses = ["cancelled"];

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

    const { jobId, status, rejectionReason }: UpdateStatusRequest = await req.json();

    if (!validStatuses.includes(status)) {
      return new Response(JSON.stringify({ error: "Invalid status" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingJob, error: fetchError } = await supabaseClient
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (fetchError || !existingJob) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userProfile } = await supabaseClient
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const userRole = userProfile?.role || user.user_metadata?.role;
    const isAdmin = userRole === "admin";
    const isDriver = userRole === "driver";
    const isCustomer = existingJob.customer_id === user.id;
    const isAssignedDriver = existingJob.driver_id === user.id;

    if (!isAdmin && !isAssignedDriver && !isCustomer) {
      return new Response(JSON.stringify({ error: "Not authorized to update this job" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currentStatus = existingJob.status;
    const allowedTransitions = statusTransitions[currentStatus] || [];
    
    if (!isAdmin && !allowedTransitions.includes(status)) {
      return new Response(JSON.stringify({ 
        error: `Invalid status transition from ${currentStatus} to ${status}`,
        code: "INVALID_TRANSITION"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isAssignedDriver && !driverAllowedStatuses.includes(status)) {
      return new Response(JSON.stringify({ 
        error: "Drivers can only update to workflow statuses (accepted, pickup, delivery, delivered)",
        code: "DRIVER_STATUS_RESTRICTED"
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isCustomer && !isAdmin && !customerAllowedStatuses.includes(status)) {
      return new Response(JSON.stringify({ 
        error: "Customers can only cancel their jobs",
        code: "CUSTOMER_STATUS_RESTRICTED"
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (status === "delivered") {
      if (!existingJob.pod_photo_url && !existingJob.pod_signature_url) {
        return new Response(JSON.stringify({ 
          error: "Proof of Delivery required before marking as delivered",
          code: "POD_REQUIRED"
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === "delivered") {
      updateData.delivered_at = new Date().toISOString();
    }

    if (rejectionReason) {
      updateData.rejection_reason = rejectionReason;
    }

    const { data: updatedJob, error: updateError } = await supabaseClient
      .from("jobs")
      .update(updateData)
      .eq("id", jobId)
      .select()
      .single();

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(updatedJob), {
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
