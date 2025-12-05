import { getUncachableStripeClient } from './stripeClient';

export interface BookingData {
  pickupPostcode: string;
  pickupAddress: string;
  pickupBuildingName: string;
  pickupName: string;
  pickupPhone: string;
  pickupInstructions: string;
  deliveryPostcode: string;
  deliveryAddress: string;
  deliveryBuildingName: string;
  recipientName: string;
  recipientPhone: string;
  deliveryInstructions: string;
  vehicleType: string;
  weight: number;
  originalPrice?: number;
  discountAmount?: number;
  discountApplied?: boolean;
  totalPrice: number;
  distance: number;
  estimatedTime: number;
  isMultiDrop: boolean;
  isReturnTrip: boolean;
  multiDropStops?: string;
  customerId?: string;
  customerEmail?: string;
  scheduledPickupTime?: string | null;
  scheduledDeliveryTime?: string | null;
}

export class StripeService {
  async createCustomer(email: string, userId: string, name?: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      name,
      metadata: { userId },
    });
  }

  async createPaymentIntent(amount: number, currency: string, customerId: string, metadata: Record<string, string>) {
    const stripe = await getUncachableStripeClient();
    return await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      metadata,
      automatic_payment_methods: {
        enabled: true,
      },
    });
  }

  async createCheckoutSession(
    customerId: string, 
    amount: number, 
    description: string,
    successUrl: string, 
    cancelUrl: string,
    metadata: Record<string, string>
  ) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          unit_amount: amount,
          product_data: {
            name: description,
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
    });
  }

  async createBookingCheckoutSession(
    customerEmail: string,
    bookingData: BookingData,
    successUrl: string,
    cancelUrl: string
  ) {
    const stripe = await getUncachableStripeClient();
    
    const customer = await stripe.customers.create({
      email: customerEmail,
      name: bookingData.pickupName,
      metadata: { 
        userId: bookingData.customerId || 'guest',
        phone: bookingData.pickupPhone 
      },
    });

    const vehicleName = bookingData.vehicleType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    const description = `Run Courier Delivery - ${vehicleName} - ${bookingData.pickupPostcode} to ${bookingData.deliveryPostcode}`;

    const metadataForStripe: Record<string, string> = {
      bookingType: 'courier_delivery',
      pickupPostcode: bookingData.pickupPostcode,
      pickupAddress: bookingData.pickupAddress.substring(0, 500),
      pickupBuildingName: bookingData.pickupBuildingName.substring(0, 100),
      pickupName: bookingData.pickupName.substring(0, 100),
      pickupPhone: bookingData.pickupPhone,
      pickupInstructions: (bookingData.pickupInstructions || '').substring(0, 200),
      deliveryPostcode: bookingData.deliveryPostcode,
      deliveryAddress: bookingData.deliveryAddress.substring(0, 500),
      deliveryBuildingName: bookingData.deliveryBuildingName.substring(0, 100),
      recipientName: bookingData.recipientName.substring(0, 100),
      recipientPhone: bookingData.recipientPhone,
      deliveryInstructions: (bookingData.deliveryInstructions || '').substring(0, 200),
      vehicleType: bookingData.vehicleType,
      weight: bookingData.weight.toString(),
      originalPrice: (bookingData.originalPrice || bookingData.totalPrice).toString(),
      discountAmount: (bookingData.discountAmount || 0).toString(),
      discountApplied: (bookingData.discountApplied || false).toString(),
      totalPrice: bookingData.totalPrice.toString(),
      distance: bookingData.distance.toString(),
      estimatedTime: bookingData.estimatedTime.toString(),
      isMultiDrop: bookingData.isMultiDrop.toString(),
      isReturnTrip: bookingData.isReturnTrip.toString(),
      customerId: bookingData.customerId || '',
      customerEmail: customerEmail,
    };

    if (bookingData.multiDropStops) {
      metadataForStripe.multiDropStops = bookingData.multiDropStops.substring(0, 500);
    }

    if (bookingData.scheduledPickupTime) {
      metadataForStripe.scheduledPickupTime = bookingData.scheduledPickupTime;
    }

    if (bookingData.scheduledDeliveryTime) {
      metadataForStripe.scheduledDeliveryTime = bookingData.scheduledDeliveryTime;
    }

    return await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'gbp',
          unit_amount: Math.round(bookingData.totalPrice * 100),
          product_data: {
            name: description,
            description: `From: ${bookingData.pickupPostcode} | To: ${bookingData.deliveryPostcode} | Vehicle: ${vehicleName} | Weight: ${bookingData.weight}kg`,
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: metadataForStripe,
    });
  }

  async getCheckoutSession(sessionId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.retrieve(sessionId);
  }

  async getCustomer(customerId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.retrieve(customerId);
  }

  async getPaymentIntent(paymentIntentId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async refundPayment(paymentIntentId: string, amount?: number) {
    const stripe = await getUncachableStripeClient();
    return await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount,
    });
  }
}

export const stripeService = new StripeService();
