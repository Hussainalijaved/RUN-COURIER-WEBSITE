import type { VehicleType } from "@shared/schema";

export interface PricingConfig {
  vehicles: {
    [key in VehicleType]: {
      name: string;
      baseCharge: number;
      perMileRate: number;
      rushHourRate: number;
      maxWeight: number;
    };
  };
  weightSurcharges: { min: number; max: number | null; charge: number }[];
  centralLondonSurcharge: number;
  multiDropCharge: number;
  returnTripMultiplier: number;
  waitingTimeFreeMinutes: number;
  waitingTimePerMinute: number;
  rushHourPeriods: { start: string; end: string }[];
}

export const defaultPricingConfig: PricingConfig = {
  vehicles: {
    motorbike: {
      name: "Motorbike",
      baseCharge: 0,
      perMileRate: 3.0,
      rushHourRate: 3.0,
      maxWeight: 5,
    },
    car: {
      name: "Car",
      baseCharge: 25,
      perMileRate: 1.2,
      rushHourRate: 1.4,
      maxWeight: 50,
    },
    small_van: {
      name: "Small Van",
      baseCharge: 25,
      perMileRate: 1.3,
      rushHourRate: 1.6,
      maxWeight: 400,
    },
    medium_van: {
      name: "Medium Van",
      baseCharge: 25,
      perMileRate: 1.4,
      rushHourRate: 1.7,
      maxWeight: 750,
    },
  },
  weightSurcharges: [
    { min: 4, max: 10, charge: 5 },
    { min: 10, max: 20, charge: 10 },
    { min: 20, max: 30, charge: 15 },
    { min: 30, max: 50, charge: 20 },
    { min: 50, max: null, charge: 40 },
  ],
  centralLondonSurcharge: 15,
  multiDropCharge: 5,
  returnTripMultiplier: 0.75,
  waitingTimeFreeMinutes: 10,
  waitingTimePerMinute: 0.5,
  rushHourPeriods: [
    { start: "07:00", end: "09:00" },
    { start: "17:00", end: "19:00" },
  ],
};

const centralLondonPostcodes = [
  "EC1", "EC2", "EC3", "EC4",
  "WC1", "WC2",
  "W1", "SW1", "SE1", "E1", "N1", "NW1",
];

export function isCentralLondon(postcode: string): boolean {
  const prefix = postcode.toUpperCase().replace(/\s/g, "").match(/^[A-Z]+\d*/)?.[0] || "";
  return centralLondonPostcodes.some((cp) => prefix.startsWith(cp));
}

export function isRushHour(date: Date = new Date()): boolean {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const time = hours * 60 + minutes;
  
  for (const period of defaultPricingConfig.rushHourPeriods) {
    const [startHour, startMin] = period.start.split(":").map(Number);
    const [endHour, endMin] = period.end.split(":").map(Number);
    const start = startHour * 60 + startMin;
    const end = endHour * 60 + endMin;
    
    if (time >= start && time <= end) {
      return true;
    }
  }
  return false;
}

export function getWeightSurcharge(weight: number): number {
  for (const surcharge of defaultPricingConfig.weightSurcharges) {
    if (weight >= surcharge.min && (surcharge.max === null || weight < surcharge.max)) {
      return surcharge.charge;
    }
  }
  return 0;
}

export interface QuoteBreakdown {
  vehicleType: VehicleType;
  distance: number;
  weight: number;
  baseCharge: number;
  distanceCharge: number;
  weightSurcharge: number;
  centralLondonCharge: number;
  multiDropCharge: number;
  returnTripCharge: number;
  rushHourApplied: boolean;
  totalPrice: number;
}

export function calculateQuote(
  vehicleType: VehicleType,
  distance: number,
  weight: number,
  options: {
    pickupPostcode: string;
    deliveryPostcode: string;
    isMultiDrop?: boolean;
    multiDropCount?: number;
    isReturnTrip?: boolean;
    returnToSameLocation?: boolean;
    returnDistance?: number;
    scheduledTime?: Date;
  }
): QuoteBreakdown {
  const config = defaultPricingConfig;
  const vehicle = config.vehicles[vehicleType];
  const rushHour = options.scheduledTime ? isRushHour(options.scheduledTime) : isRushHour();
  
  const baseCharge = vehicle.baseCharge;
  const perMileRate = rushHour ? vehicle.rushHourRate : vehicle.perMileRate;
  const distanceCharge = distance * perMileRate;
  
  const weightSurcharge = getWeightSurcharge(weight);
  
  const isCentralPickup = isCentralLondon(options.pickupPostcode);
  const isCentralDelivery = isCentralLondon(options.deliveryPostcode);
  const centralLondonCharge = (isCentralPickup || isCentralDelivery) ? config.centralLondonSurcharge : 0;
  
  const multiDropCharge = options.isMultiDrop && options.multiDropCount
    ? config.multiDropCharge * options.multiDropCount
    : 0;
  
  let returnTripCharge = 0;
  if (options.isReturnTrip) {
    const returnDist = options.returnToSameLocation ? distance : (options.returnDistance || distance);
    returnTripCharge = returnDist * perMileRate * config.returnTripMultiplier;
  }
  
  const totalPrice = baseCharge + distanceCharge + weightSurcharge + centralLondonCharge + multiDropCharge + returnTripCharge;
  
  return {
    vehicleType,
    distance,
    weight,
    baseCharge,
    distanceCharge,
    weightSurcharge,
    centralLondonCharge,
    multiDropCharge,
    returnTripCharge,
    rushHourApplied: rushHour,
    totalPrice: Math.round(totalPrice * 100) / 100,
  };
}

export function formatPrice(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

export function getVehicleForWeight(weight: number): VehicleType {
  const { vehicles } = defaultPricingConfig;
  
  if (weight <= vehicles.motorbike.maxWeight) return "motorbike";
  if (weight <= vehicles.car.maxWeight) return "car";
  if (weight <= vehicles.small_van.maxWeight) return "small_van";
  return "medium_van";
}
