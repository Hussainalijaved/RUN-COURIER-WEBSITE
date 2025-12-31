#!/bin/bash
# Run the backend server for production deployment
# This serves the Stripe payment API and other backend endpoints

echo "Starting backend server on port 5000..."
export PORT=5000
npx tsx server/stripeServer.ts
