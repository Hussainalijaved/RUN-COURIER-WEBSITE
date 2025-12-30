import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdateDriverRequest {
  driverId: string;
  isVerified?: boolean;
  isAvailable?: boolean;
  isActive?: boolean;
  fullName?: string;
  phone?: string;
  address?: string;
  postcode?: string;
  vehicleType?: string;
  vehicleRegistration?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  bypassDocumentCheck?: boolean;
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
      return new Response(JSON.stringify({ error: "Only admins and dispatchers can update drivers" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: UpdateDriverRequest = await req.json();
    const { driverId, bypassDocumentCheck, ...updateFields } = body;

    if (!driverId) {
      return new Response(JSON.stringify({ error: "Driver ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: existingDriver, error: driverError } = await supabaseClient
      .from("drivers")
      .select("*")
      .eq("id", driverId)
      .single();

    if (driverError || !existingDriver) {
      return new Response(JSON.stringify({ error: "Driver not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (updateFields.isVerified === true && !bypassDocumentCheck) {
      const vehicleType = existingDriver.vehicle_type || 'car';
      
      const baseRequiredDocs = [
        'driving_license',
        'dbs_certificate',
        'hire_and_reward_insurance',
        'goods_in_transit_insurance',
        'proof_of_identity',
        'proof_of_address',
      ];
      
      const vehiclePhotoDocs = vehicleType === 'motorbike' 
        ? ['vehicle_photo_front', 'vehicle_photo_back']
        : ['vehicle_photo_front', 'vehicle_photo_back', 'vehicle_photo_left', 'vehicle_photo_right', 'vehicle_photo_load_space'];
      
      const requiredDocs = [...baseRequiredDocs, ...vehiclePhotoDocs];
      
      const { data: documents } = await supabaseClient
        .from("documents")
        .select("*")
        .eq("driver_id", driverId);

      const driverDocs = documents || [];
      const issues: string[] = [];
      const missingDocs: string[] = [];
      const pendingDocs: string[] = [];
      const rejectedDocs: string[] = [];
      
      for (const docType of requiredDocs) {
        const doc = driverDocs.find((d: any) => d.type === docType);
        if (!doc) {
          missingDocs.push(docType);
          issues.push(`Missing: ${docType.replace(/_/g, ' ')}`);
        } else if (doc.status === 'pending') {
          pendingDocs.push(docType);
          issues.push(`Pending review: ${docType.replace(/_/g, ' ')}`);
        } else if (doc.status === 'rejected') {
          rejectedDocs.push(docType);
          issues.push(`Rejected: ${docType.replace(/_/g, ' ')}`);
        }
      }
      
      if (issues.length > 0) {
        return new Response(JSON.stringify({ 
          error: "Cannot verify driver until all required documents are approved",
          details: issues,
          missingCount: missingDocs.length,
          pendingCount: pendingDocs.length,
          rejectedCount: rejectedDocs.length
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseUpdateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    
    if (updateFields.isVerified !== undefined) supabaseUpdateData.is_verified = updateFields.isVerified;
    if (updateFields.isAvailable !== undefined) supabaseUpdateData.is_available = updateFields.isAvailable;
    if (updateFields.isActive !== undefined) supabaseUpdateData.is_active = updateFields.isActive;
    if (updateFields.fullName !== undefined) supabaseUpdateData.full_name = updateFields.fullName;
    if (updateFields.phone !== undefined) supabaseUpdateData.phone = updateFields.phone;
    if (updateFields.address !== undefined) supabaseUpdateData.address = updateFields.address;
    if (updateFields.postcode !== undefined) supabaseUpdateData.postcode = updateFields.postcode;
    if (updateFields.vehicleType !== undefined) supabaseUpdateData.vehicle_type = updateFields.vehicleType;
    if (updateFields.vehicleRegistration !== undefined) supabaseUpdateData.vehicle_registration = updateFields.vehicleRegistration;
    if (updateFields.vehicleMake !== undefined) supabaseUpdateData.vehicle_make = updateFields.vehicleMake;
    if (updateFields.vehicleModel !== undefined) supabaseUpdateData.vehicle_model = updateFields.vehicleModel;
    if (updateFields.vehicleColor !== undefined) supabaseUpdateData.vehicle_color = updateFields.vehicleColor;

    const { data: updatedDriver, error: updateError } = await supabaseClient
      .from("drivers")
      .update(supabaseUpdateData)
      .eq("id", driverId)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update driver:", updateError);
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(updatedDriver), {
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
