import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.3.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentIntentRequest {
  amount: number;
  currency?: string;
  jobId?: string;
  customerId?: string;
  customerEmail?: string;
  description?: string;
  metadata?: Record<string, string>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2023-10-16",
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    const anonClient = createClient(supabaseUrl, anonKey);
    
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { 
      amount, 
      currency = "gbp", 
      jobId, 
      customerId, 
      customerEmail,
      description,
      metadata = {}
    }: PaymentIntentRequest = await req.json();

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "Valid amount required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let verifiedAmount = amount;

    if (jobId) {
      const { data: job, error: jobError } = await supabaseClient
        .from("jobs")
        .select("customer_id, total_price, payment_status")
        .eq("id", jobId)
        .single();

      if (jobError || !job) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (job.customer_id !== user.id) {
        const { data: userProfile } = await supabaseClient
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();
        
        const userRole = userProfile?.role || user.user_metadata?.role;
        if (userRole !== "admin" && userRole !== "dispatcher") {
          return new Response(JSON.stringify({ error: "Not authorized to pay for this job" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      if (job.payment_status === "paid") {
        return new Response(JSON.stringify({ error: "Job is already paid" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const jobTotalPrice = parseFloat(job.total_price);
      const tolerance = 0.01;
      if (Math.abs(amount - jobTotalPrice) > tolerance) {
        return new Response(JSON.stringify({ 
          error: "Payment amount must match job total price",
          expected: jobTotalPrice,
          provided: amount
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      verifiedAmount = jobTotalPrice;
    }

    const { data: userProfile } = await supabaseClient
      .from("users")
      .select("stripe_customer_id, email, full_name")
      .eq("id", user.id)
      .single();

    let stripeCustomerId = userProfile?.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: customerEmail || userProfile?.email || user.email,
        name: userProfile?.full_name,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      stripeCustomerId = customer.id;

      await supabaseClient
        .from("users")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", user.id);
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(verifiedAmount * 100),
      currency,
      customer: stripeCustomerId,
      description: description || "Run Courier Delivery Payment",
      metadata: {
        ...metadata,
        job_id: jobId || "",
        user_id: user.id,
        customer_id: customerId || user.id,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return new Response(JSON.stringify({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Payment intent error:", error);
    return new Response(JSON.stringify({ error: error.message || "Payment creation failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
