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

    // Send POD email to customer when job is delivered
    if (status === "delivered" && updatedJob.pod_photo_url) {
      try {
        // Get customer email
        const { data: customer } = await supabaseClient
          .from("users")
          .select("email, full_name")
          .eq("id", updatedJob.customer_id)
          .single();

        if (customer?.email) {
          const resendApiKey = Deno.env.get("RESEND_API_KEY");
          
          if (resendApiKey) {
            // Generate signed URL for POD image (valid for 7 days)
            const podPath = updatedJob.pod_photo_url.replace(/^.*\/storage\/v1\/object\/public\//, '').replace(/^.*\/storage\/v1\/object\/sign\//, '');
            const bucketPath = podPath.startsWith('pod/') ? podPath : `pod/${podPath}`;
            
            const { data: signedUrlData } = await supabaseClient
              .storage
              .from('pod')
              .createSignedUrl(bucketPath.replace('pod/', ''), 604800); // 7 days
            
            const podImageUrl = signedUrlData?.signedUrl || updatedJob.pod_photo_url;
            
            const emailHtml = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Delivery Confirmation</title>
              </head>
              <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
                <div style="background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <div style="text-align: center; margin-bottom: 20px;">
                    <h1 style="color: #1a1a1a; margin: 0;">Delivery Confirmed</h1>
                  </div>
                  
                  <p style="color: #333; font-size: 16px;">Dear ${customer.full_name || 'Customer'},</p>
                  
                  <p style="color: #333; font-size: 16px;">Your delivery has been completed successfully.</p>
                  
                  <div style="background-color: #f8f9fa; border-radius: 6px; padding: 15px; margin: 20px 0;">
                    <p style="margin: 5px 0; color: #666;"><strong>Tracking Number:</strong> ${updatedJob.tracking_number || 'N/A'}</p>
                    <p style="margin: 5px 0; color: #666;"><strong>Delivered:</strong> ${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}</p>
                  </div>
                  
                  <div style="margin: 25px 0;">
                    <h3 style="color: #1a1a1a; margin-bottom: 10px;">Proof of Delivery</h3>
                    <img src="${podImageUrl}" alt="Proof of Delivery" style="max-width: 100%; border-radius: 8px; border: 1px solid #eee;" />
                  </div>
                  
                  <hr style="border: none; border-top: 1px solid #eee; margin: 25px 0;" />
                  
                  <p style="color: #888; font-size: 14px; text-align: center;">
                    Thank you for choosing Run Courier.<br>
                    <a href="https://runcourier.co.uk" style="color: #0066cc;">www.runcourier.co.uk</a>
                  </p>
                </div>
              </body>
              </html>
            `;

            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${resendApiKey}`,
              },
              body: JSON.stringify({
                from: "Run Courier <noreply@runcourier.co.uk>",
                to: customer.email,
                subject: `Delivery Confirmed - ${updatedJob.tracking_number || 'Your Order'}`,
                html: emailHtml,
                reply_to: "info@runcourier.co.uk",
              }),
            });
            
            console.log(`POD email sent to ${customer.email} for job ${updatedJob.tracking_number}`);
          }
        }
      } catch (emailError) {
        // Log but don't fail the status update if email fails
        console.error("Failed to send POD email:", emailError);
      }
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
