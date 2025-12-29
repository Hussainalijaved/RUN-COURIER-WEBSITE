import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.3.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      event = JSON.parse(body);
    }

    console.log("Received Stripe event:", event.type);

    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const jobId = paymentIntent.metadata?.job_id;
        
        if (jobId) {
          await supabase
            .from("jobs")
            .update({
              payment_status: "paid",
              stripe_payment_intent_id: paymentIntent.id,
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
          
          console.log(`Job ${jobId} marked as paid`);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const jobId = paymentIntent.metadata?.job_id;
        
        if (jobId) {
          await supabase
            .from("jobs")
            .update({
              payment_status: "failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
          
          console.log(`Job ${jobId} payment failed`);
        }
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const jobId = session.metadata?.job_id;
        
        if (jobId) {
          await supabase
            .from("jobs")
            .update({
              payment_status: "paid",
              stripe_session_id: session.id,
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId);
          
          console.log(`Job ${jobId} checkout completed`);
        }
        break;
      }

      case "customer.created":
      case "customer.updated": {
        const customer = event.data.object as Stripe.Customer;
        const supabaseUserId = customer.metadata?.supabase_user_id;
        
        if (supabaseUserId) {
          await supabase
            .from("users")
            .update({ stripe_customer_id: customer.id })
            .eq("id", supabaseUserId);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
