#!/bin/bash
# Start Stripe payment server on port 5000 (accessible via main Replit URL)
echo "Starting Stripe payment server on port 5000..."
PORT=5000 npx tsx server/stripeServer.ts &
STRIPE_PID=$!
echo "Stripe server PID: $STRIPE_PID"

# Wait for Stripe server to start
sleep 3

# Test if Stripe server is running
if curl -s http://localhost:5000/api/stripe/create-payment-intent -X POST -H "Content-Type: application/json" -d '{"amount": 1, "currency": "gbp"}' | grep -q "clientSecret"; then
    echo "Stripe server is running and responding!"
else
    echo "Warning: Stripe server may not be responding correctly"
fi

# Start Expo dev server (this blocks)
echo "Starting Expo development server..."
npm run dev
