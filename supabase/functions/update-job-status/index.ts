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
            // Extract raw path by removing bucket name and prefix
            const rawPath = updatedJob.pod_photo_url
              .replace(/^.*\/storage\/v1\/object\/(?:public|sign|authenticated)\//, '')
              .replace(/^[^\/]+\//, ''); // Remove bucket name (pod, pod-images, etc.)
            
            const { data: signedUrlData } = await supabaseClient
              .storage
              .from('pod-images')
              .createSignedUrl(rawPath, 604800); // 7 days

            const podImageUrl = signedUrlData?.signedUrl || updatedJob.pod_photo_url;

            const LOGO_URL = 'https://945d2f5a-7336-462a-b33f-10fb0e78a123-00-2bep7zisdjcv3.spock.replit.dev/logo-email.jpg';

            const emailHtml = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Delivery Confirmation</title>
              </head>
              <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <!-- Header with Logo -->
                <div style="background-color: #007BFF; padding: 20px; text-align: center;">
                  <img src="${LOGO_URL}" alt="Run Courier" style="max-width: 120px; height: auto; margin-bottom: 10px;" />
                  <h1 style="color: white; margin: 0; font-size: 24px;">Delivery Confirmed</h1>
                </div>
                
                <div style="padding: 30px; background-color: #f9f9f9;">
                  <p style="color: #333; font-size: 16px;">Dear ${customer.full_name || 'Customer'},</p>
                  
                  <p style="color: #666; font-size: 16px;">
                    Great news! Your delivery has been completed successfully.
                  </p>
                  
                  <!-- Tracking Info -->
                  <div style="background-color: #007BFF; color: white; padding: 15px; border-radius: 8px 8px 0 0; text-align: center; margin-top: 20px;">
                    <p style="margin: 0; font-size: 14px;">Tracking Number</p>
                    <p style="margin: 5px 0 0; font-size: 24px; font-weight: bold; letter-spacing: 2px;">${updatedJob.tracking_number || 'N/A'}</p>
                  </div>
                  
                  <div style="background-color: white; border-radius: 0 0 8px 8px; padding: 20px; border: 1px solid #eee; border-top: none;">
                    <table style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 10px 0; color: #666; width: 140px;"><strong>Status:</strong></td>
                        <td style="padding: 10px 0;">
                          <span style="background-color: #28a745; color: white; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">DELIVERED</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; color: #666;"><strong>Delivered At:</strong></td>
                        <td style="padding: 10px 0; color: #333;">${new Date().toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })}</td>
                      </tr>
                    </table>
                  </div>
                  
                  <!-- Proof of Delivery -->
                  <div style="margin: 25px 0;">
                    <h3 style="color: #007BFF; margin: 0 0 15px; font-size: 16px; border-bottom: 2px solid #007BFF; padding-bottom: 8px;">PROOF OF DELIVERY</h3>
                    <div style="background-color: white; padding: 15px; border-radius: 8px; border: 1px solid #eee; text-align: center;">
                      <img src="${podImageUrl}" alt="Proof of Delivery" style="max-width: 100%; border-radius: 8px;" />
                    </div>
                  </div>
                  
                  <p style="color: #666; font-size: 14px; text-align: center; margin-top: 20px;">
                    Thank you for choosing Run Courier for your delivery needs.
                  </p>
                  
                  <!-- Footer -->
                  <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                  <div style="text-align: center;">
                    <img src="${LOGO_URL}" alt="Run Courier" style="max-width: 60px; height: auto; margin-bottom: 10px;" />
                    <p style="color: #999; font-size: 12px; margin: 0;">
                      Run Courier - Same Day Delivery Across the UK<br>
                      <a href="https://www.runcourier.co.uk" style="color: #007BFF;">www.runcourier.co.uk</a> | 
                      <a href="tel:+442046346100" style="color: #007BFF;">+44 20 4634 6100</a>
                    </p>
                  </div>
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
