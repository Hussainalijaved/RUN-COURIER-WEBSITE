import type { VehicleType, PricingSettings, Vehicle } from "@shared/schema";

export interface PricingConfig {
  vehicles: {
    [key in VehicleType]: {
      name: string;
      baseCharge: number;
      perMileRate: number;
      rushHourRate: number;
      maxWeight: number;
      maxDistance?: number;
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
      baseCharge: 7,
      perMileRate: 1.3,
      rushHourRate: 1.5,
      maxWeight: 5,
    },
    car: {
      name: "Car",
      baseCharge: 19,
      perMileRate: 1.20,
      rushHourRate: 1.40,
      maxWeight: 50,
    },
    small_van: {
      name: "Small Van",
      baseCharge: 25,
      perMileRate: 1.30,
      rushHourRate: 1.50,
      maxWeight: 400,
    },
    medium_van: {
      name: "Medium Van",
      baseCharge: 30,
      perMileRate: 1.40,
      rushHourRate: 1.60,
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
  multiDropCharge: 3,
  returnTripMultiplier: 0.60,
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
  totalDistance: number;
  weight: number;
  baseCharge: number;
  distanceCharge: number;
  multiDropDistanceCharge: number;
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
    multiDropDistances?: number[];
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
  
  let multiDropCharge = 0;
  let multiDropDistanceCharge = 0;
  let totalMultiDropDistance = 0;
  
  if (options.isMultiDrop && options.multiDropDistances && options.multiDropDistances.length > 0) {
    totalMultiDropDistance = options.multiDropDistances.reduce((sum, d) => sum + d, 0);
    multiDropDistanceCharge = totalMultiDropDistance * perMileRate;
  }
  
  const subtotalBeforeReturn = baseCharge + distanceCharge + multiDropDistanceCharge + weightSurcharge + centralLondonCharge + multiDropCharge;
  
  let returnTripCharge = 0;
  if (options.isReturnTrip) {
    if (options.returnToSameLocation) {
      returnTripCharge = subtotalBeforeReturn * config.returnTripMultiplier;
    } else if (options.returnDistance) {
      returnTripCharge = options.returnDistance * perMileRate;
    }
  }
  
  const totalDistance = distance + totalMultiDropDistance;
  const totalPrice = subtotalBeforeReturn + returnTripCharge;
  
  return {
    vehicleType,
    distance,
    totalDistance,
    weight,
    baseCharge,
    distanceCharge,
    multiDropDistanceCharge,
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

export function getVehicleForWeightAndDistance(weight: number, distance: number): VehicleType {
  const { vehicles } = defaultPricingConfig;
  
  if (weight <= vehicles.motorbike.maxWeight) {
    if (vehicles.motorbike.maxDistance && distance > vehicles.motorbike.maxDistance) {
      return "car";
    }
    return "motorbike";
  }
  if (weight <= vehicles.car.maxWeight) return "car";
  if (weight <= vehicles.small_van.maxWeight) return "small_van";
  return "medium_van";
}

export function shouldSwitchVehicle(vehicleType: VehicleType, distance: number): VehicleType | null {
  const vehicle = defaultPricingConfig.vehicles[vehicleType];
  
  if (vehicle.maxDistance && distance > vehicle.maxDistance) {
    if (vehicleType === "motorbike") {
      return "car";
    }
  }
  return null;
}

// Cache for fetched pricing config
let cachedPricingConfig: PricingConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch pricing configuration from the API.
 * Returns cached config if available and not expired.
 * Falls back to defaultPricingConfig on error.
 */
export async function fetchPricingConfig(): Promise<PricingConfig> {
  // Return cached config if valid
  if (cachedPricingConfig && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedPricingConfig;
  }

  try {
    // Fetch both pricing settings and vehicles in parallel
    const [pricingRes, vehiclesRes] = await Promise.all([
      fetch('/api/pricing'),
      fetch('/api/vehicles'),
    ]);

    if (!pricingRes.ok || !vehiclesRes.ok) {
      console.warn('Failed to fetch pricing config, using defaults');
      return defaultPricingConfig;
    }

    const pricingSettings: PricingSettings = await pricingRes.json();
    const vehicles: Vehicle[] = await vehiclesRes.json();

    // Transform API data to PricingConfig format
    const vehiclesMap: PricingConfig['vehicles'] = { ...defaultPricingConfig.vehicles };
    
    vehicles.forEach((v) => {
      const type = v.type as VehicleType;
      if (vehiclesMap[type]) {
        vehiclesMap[type] = {
          name: v.name,
          baseCharge: parseFloat(v.baseCharge) || vehiclesMap[type].baseCharge,
          perMileRate: parseFloat(v.perMileRate) || vehiclesMap[type].perMileRate,
          rushHourRate: parseFloat(v.rushHourRate || '0') || vehiclesMap[type].rushHourRate,
          maxWeight: v.maxWeight || vehiclesMap[type].maxWeight,
        };
      }
    });

    // Convert weight surcharges from Record to array format
    const weightSurcharges: PricingConfig['weightSurcharges'] = [];
    if (pricingSettings.weightSurcharges) {
      const surcharges = pricingSettings.weightSurcharges as Record<string, number>;
      Object.entries(surcharges).forEach(([range, charge]) => {
        if (range.includes('+')) {
          const min = parseInt(range.replace('+', ''));
          weightSurcharges.push({ min, max: null, charge });
        } else if (range.includes('-')) {
          const [minStr, maxStr] = range.split('-');
          weightSurcharges.push({ min: parseInt(minStr), max: parseInt(maxStr), charge });
        }
      });
      weightSurcharges.sort((a, b) => a.min - b.min);
    }

    // Convert rush hour settings to periods array
    const rushHourPeriods = [
      { start: pricingSettings.rushHourStart || '07:00', end: pricingSettings.rushHourEnd || '09:00' },
      { start: pricingSettings.rushHourStartEvening || '17:00', end: pricingSettings.rushHourEndEvening || '19:00' },
    ];

    cachedPricingConfig = {
      vehicles: vehiclesMap,
      weightSurcharges: weightSurcharges.length > 0 ? weightSurcharges : defaultPricingConfig.weightSurcharges,
      centralLondonSurcharge: parseFloat(pricingSettings.centralLondonSurcharge || '15'),
      multiDropCharge: parseFloat(pricingSettings.multiDropCharge || '5'),
      returnTripMultiplier: parseFloat(pricingSettings.returnTripMultiplier || '0.60'),
      waitingTimeFreeMinutes: pricingSettings.waitingTimeFreeMinutes || 10,
      waitingTimePerMinute: parseFloat(pricingSettings.waitingTimePerMinute || '0.50'),
      rushHourPeriods,
    };
    cacheTimestamp = Date.now();

    return cachedPricingConfig;
  } catch (error) {
    console.warn('Error fetching pricing config:', error);
    return defaultPricingConfig;
  }
}

/**
 * Clear the pricing config cache.
 * Call this when pricing is updated to ensure fresh values are used.
 */
export function clearPricingCache(): void {
  cachedPricingConfig = null;
  cacheTimestamp = 0;
}

/**
 * Calculate quote with pricing fetched from the database.
 * This is the async version that uses server pricing.
 */
export async function calculateQuoteAsync(
  vehicleType: VehicleType,
  distance: number,
  weight: number,
  options: {
    pickupPostcode: string;
    deliveryPostcode: string;
    isMultiDrop?: boolean;
    multiDropCount?: number;
    multiDropDistances?: number[];
    isReturnTrip?: boolean;
    returnToSameLocation?: boolean;
    returnDistance?: number;
    scheduledTime?: Date;
  }
): Promise<QuoteBreakdown> {
  const config = await fetchPricingConfig();
  const vehicle = config.vehicles[vehicleType];
  
  // Check rush hour using fetched config
  const rushHour = options.scheduledTime 
    ? isRushHourWithConfig(options.scheduledTime, config)
    : isRushHourWithConfig(new Date(), config);
  
  const baseCharge = vehicle.baseCharge;
  const perMileRate = rushHour ? vehicle.rushHourRate : vehicle.perMileRate;
  const distanceCharge = distance * perMileRate;
  
  // Get weight surcharge from fetched config
  const weightSurcharge = getWeightSurchargeWithConfig(weight, config);
  
  const isCentralPickup = isCentralLondon(options.pickupPostcode);
  const isCentralDelivery = isCentralLondon(options.deliveryPostcode);
  const centralLondonCharge = (isCentralPickup || isCentralDelivery) ? config.centralLondonSurcharge : 0;
  
  let multiDropCharge = 0;
  let multiDropDistanceCharge = 0;
  let totalMultiDropDistance = 0;
  
  if (options.isMultiDrop && options.multiDropDistances && options.multiDropDistances.length > 0) {
    totalMultiDropDistance = options.multiDropDistances.reduce((sum, d) => sum + d, 0);
    multiDropDistanceCharge = totalMultiDropDistance * perMileRate;
  }
  
  const subtotalBeforeReturn = baseCharge + distanceCharge + multiDropDistanceCharge + weightSurcharge + centralLondonCharge + multiDropCharge;
  
  let returnTripCharge = 0;
  if (options.isReturnTrip) {
    if (options.returnToSameLocation) {
      returnTripCharge = subtotalBeforeReturn * config.returnTripMultiplier;
    } else if (options.returnDistance) {
      returnTripCharge = options.returnDistance * perMileRate;
    }
  }
  
  const totalDistance = distance + totalMultiDropDistance;
  const totalPrice = subtotalBeforeReturn + returnTripCharge;
  
  return {
    vehicleType,
    distance,
    totalDistance,
    weight,
    baseCharge,
    distanceCharge,
    multiDropDistanceCharge,
    weightSurcharge,
    centralLondonCharge,
    multiDropCharge,
    returnTripCharge,
    rushHourApplied: rushHour,
    totalPrice: Math.round(totalPrice * 100) / 100,
  };
}

// Helper to check rush hour with a specific config
function isRushHourWithConfig(date: Date, config: PricingConfig): boolean {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const time = hours * 60 + minutes;
  
  for (const period of config.rushHourPeriods) {
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

// Helper to get weight surcharge with a specific config
function getWeightSurchargeWithConfig(weight: number, config: PricingConfig): number {
  for (const surcharge of config.weightSurcharges) {
    if (weight >= surcharge.min && (surcharge.max === null || weight < surcharge.max)) {
      return surcharge.charge;
    }
  }
  return 0;
}
