import type { VehicleType, PricingSettings, Vehicle } from "@shared/schema";
import { congestionZonePostcodes } from "./congestionZonePostcodes";

export type ServiceType = 'flexible' | 'urgent';

export const SERVICE_TYPE_CONFIG: Record<ServiceType, { label: string; percent: number; description: string }> = {
  flexible: { label: 'Flexible', percent: 0,  description: 'Best value, flexible timing' },
  urgent:   { label: 'Urgent',   percent: 15, description: 'Priority same-day delivery' },
};

export function applyServiceTypeAdjustment(
  baseTotal: number,
  serviceType: ServiceType
): { total: number; percent: number; amount: number } {
  const config = SERVICE_TYPE_CONFIG[serviceType] ?? SERVICE_TYPE_CONFIG.flexible;
  const amount = Math.round(baseTotal * (config.percent / 100) * 100) / 100;
  const total = Math.round((baseTotal + amount) * 100) / 100;
  return { total, percent: config.percent, amount };
}

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
      baseCharge: 12,
      perMileRate: 1.50,
      rushHourRate: 1.70,
      maxWeight: 5,
      maxDistance: 10,
    },
    car: {
      name: "Car",
      baseCharge: 22,
      perMileRate: 1.30,
      rushHourRate: 1.50,
      maxWeight: 50,
    },
    small_van: {
      name: "Small Van",
      baseCharge: 25,
      perMileRate: 1.30,
      rushHourRate: 1.60,
      maxWeight: 400,
    },
    medium_van: {
      name: "Medium Van",
      baseCharge: 30,
      perMileRate: 1.40,
      rushHourRate: 1.70,
      maxWeight: 750,
    },
    lwb_van: {
      name: "LWB Van",
      baseCharge: 35,
      perMileRate: 1.60,
      rushHourRate: 1.80,
      maxWeight: 1000,
    },
    luton_van: {
      name: "Luton Van",
      baseCharge: 40,
      perMileRate: 1.70,
      rushHourRate: 1.90,
      maxWeight: 1200,
    },

  },
  weightSurcharges: [
    { min: 10,  max: 20,   charge: 10 },
    { min: 20,  max: 30,   charge: 15 },
    { min: 30,  max: 50,   charge: 20 },
    { min: 50,  max: 100,  charge: 40 },
    { min: 100, max: 400,  charge: 50 },
    { min: 400, max: null, charge: 70 },
  ],
  centralLondonSurcharge: 18.15,
  multiDropCharge: 5,
  returnTripMultiplier: 0.60,
  waitingTimeFreeMinutes: 10,
  waitingTimePerMinute: 0.5,
  rushHourPeriods: [
    { start: "07:00", end: "09:00" },
    { start: "14:00", end: "19:00" },
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

export function isCongestionZone(postcode: string): boolean {
  const normalized = postcode.toUpperCase().replace(/\s/g, "");
  return congestionZonePostcodes.has(normalized);
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
  // Weight up to and including 10kg is free
  for (const surcharge of defaultPricingConfig.weightSurcharges) {
    if (weight > surcharge.min && (surcharge.max === null || weight <= surcharge.max)) {
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
  congestionZoneCharge: number;
  multiDropCharge: number;
  returnTripCharge: number;
  waitingTimeCharge: number;
  waitingTimeMinutes: number;
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
    allDropPostcodes?: string[]; // All drop postcodes for multi-drop congestion check
    isReturnTrip?: boolean;
    returnToSameLocation?: boolean;
    returnDistance?: number;
    scheduledTime?: Date;
    waitingTimeMinutes?: number;
  }
): QuoteBreakdown {
  const config = defaultPricingConfig;
  const vehicle = config.vehicles[vehicleType];
  const rushHour = options.scheduledTime ? isRushHour(options.scheduledTime) : isRushHour();
  
  const baseCharge = vehicle.baseCharge;
  const perMileRate = rushHour ? vehicle.rushHourRate : vehicle.perMileRate;
  const distanceCharge = distance * perMileRate;
  
  const weightSurcharge = getWeightSurcharge(weight);
  
  // For multi-drop routes, check ALL postcodes but only charge £18 once
  const isCongestionPickup = isCongestionZone(options.pickupPostcode);
  let hasCongestionZone = isCongestionPickup;
  
  if (options.allDropPostcodes && options.allDropPostcodes.length > 0) {
    // Check all drop postcodes for congestion zone
    hasCongestionZone = hasCongestionZone || options.allDropPostcodes.some(pc => isCongestionZone(pc));
  } else {
    // Fallback: only check the single delivery postcode
    hasCongestionZone = hasCongestionZone || isCongestionZone(options.deliveryPostcode);
  }
  
  // Only apply £18 ONCE regardless of how many postcodes are in congestion zone
  const congestionZoneCharge = hasCongestionZone ? 18 : 0;
  
  let multiDropCharge = 0;
  let multiDropDistanceCharge = 0;
  let totalMultiDropDistance = 0;
  let hiddenStopCharge = 0;
  
  if (options.isMultiDrop && options.multiDropDistances && options.multiDropDistances.length > 0) {
    totalMultiDropDistance = options.multiDropDistances.reduce((sum, d) => sum + d, 0);
    multiDropDistanceCharge = totalMultiDropDistance * perMileRate;
    // First stop and second stop are free. From the THIRD stop onward, add £5 per stop.
    // multiDropDistances[0] = leg to 2nd drop (free), [1] = leg to 3rd drop (+£5), etc.
    hiddenStopCharge = Math.max(0, options.multiDropDistances.length - 1) * 5;
  }
  
  const subtotalBeforeReturn = baseCharge + distanceCharge + multiDropDistanceCharge + weightSurcharge + congestionZoneCharge + multiDropCharge + hiddenStopCharge;
  
  let returnTripCharge = 0;
  if (options.isReturnTrip) {
    if (options.returnToSameLocation) {
      returnTripCharge = subtotalBeforeReturn * config.returnTripMultiplier;
    } else if (options.returnDistance) {
      returnTripCharge = options.returnDistance * perMileRate;
    }
  }
  
  // Calculate waiting time charge (first 10 minutes free, then £0.50/min)
  const waitingTimeMinutes = options.waitingTimeMinutes || 0;
  let waitingTimeCharge = 0;
  if (waitingTimeMinutes > config.waitingTimeFreeMinutes) {
    const chargeableMinutes = waitingTimeMinutes - config.waitingTimeFreeMinutes;
    waitingTimeCharge = chargeableMinutes * config.waitingTimePerMinute;
  }
  
  const totalDistance = distance + totalMultiDropDistance;
  const totalPrice = subtotalBeforeReturn + returnTripCharge + waitingTimeCharge;
  
  return {
    vehicleType,
    distance,
    totalDistance,
    weight,
    baseCharge,
    distanceCharge,
    multiDropDistanceCharge,
    weightSurcharge,
    congestionZoneCharge,
    multiDropCharge,
    returnTripCharge,
    waitingTimeCharge,
    waitingTimeMinutes,
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
  if (weight <= vehicles.medium_van.maxWeight) return "medium_van";
  if (weight <= vehicles.lwb_van.maxWeight) return "lwb_van";
  return "luton_van";
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
  if (weight <= vehicles.medium_van.maxWeight) return "medium_van";
  if (weight <= vehicles.lwb_van.maxWeight) return "lwb_van";
  return "luton_van";
}

export function shouldSwitchVehicle(currentType: VehicleType, distance: number, weight?: number): VehicleType | null {
  const vehicle = defaultPricingConfig.vehicles[currentType];
  
  // Rule: Distance limit (e.g. motorbike max 10 miles)
  if (vehicle.maxDistance && distance > vehicle.maxDistance) {
    if (currentType === 'motorbike') return 'car';
    // Add other switch rules if needed
  }
  
  // Rule: Weight limit
  if (weight !== undefined && weight > vehicle.maxWeight) {
    return getVehicleForWeightAndDistance(weight, distance);
  }
  
  return null;
}


// Cache for fetched pricing config
let cachedPricingConfig: PricingConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 30 * 1000; // 30 seconds

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
      { start: pricingSettings.rushHourStartEvening || '14:00', end: pricingSettings.rushHourEndEvening || '19:00' },
    ];

    cachedPricingConfig = {
      vehicles: vehiclesMap,
      weightSurcharges: weightSurcharges.length > 0 ? weightSurcharges : defaultPricingConfig.weightSurcharges,
      centralLondonSurcharge: parseFloat(pricingSettings.centralLondonSurcharge || '18.15'),
      multiDropCharge: parseFloat(pricingSettings.multiDropCharge || '5'),
      returnTripMultiplier: parseFloat(pricingSettings.returnTripMultiplier || '0.60'),
      waitingTimeFreeMinutes: pricingSettings.waitingTimeFreeMinutes || 10,
      waitingTimePerMinute: parseFloat(pricingSettings.waitingTimePerMinute || '0.50'),
      rushHourPeriods,
    };
    cacheTimestamp = Date.now();

    return cachedPricingConfig as PricingConfig;
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
    waitingTimeMinutes?: number;
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
  
  const isCongestionPickup = isCongestionZone(options.pickupPostcode);
  const isCongestionDelivery = isCongestionZone(options.deliveryPostcode);
  const congestionZoneCharge = (isCongestionPickup || isCongestionDelivery) ? 18 : 0;
  
  let multiDropCharge = 0;
  let multiDropDistanceCharge = 0;
  let totalMultiDropDistance = 0;
  let hiddenStopCharge = 0;
  
  if (options.isMultiDrop && options.multiDropDistances && options.multiDropDistances.length > 0) {
    totalMultiDropDistance = options.multiDropDistances.reduce((sum, d) => sum + d, 0);
    multiDropDistanceCharge = totalMultiDropDistance * perMileRate;
    // First stop and second stop are free. From the THIRD stop onward, add £5 per stop.
    // multiDropDistances[0] = leg to 2nd drop (free), [1] = leg to 3rd drop (+£5), etc.
    hiddenStopCharge = Math.max(0, options.multiDropDistances.length - 1) * 5;
  }
  
  const subtotalBeforeReturn = baseCharge + distanceCharge + multiDropDistanceCharge + weightSurcharge + congestionZoneCharge + multiDropCharge + hiddenStopCharge;
  
  let returnTripCharge = 0;
  if (options.isReturnTrip) {
    if (options.returnToSameLocation) {
      returnTripCharge = subtotalBeforeReturn * config.returnTripMultiplier;
    } else if (options.returnDistance) {
      returnTripCharge = options.returnDistance * perMileRate;
    }
  }
  
  // Calculate waiting time charge (first 10 minutes free, then £0.50/min)
  const waitingTimeMinutes = options.waitingTimeMinutes || 0;
  let waitingTimeCharge = 0;
  if (waitingTimeMinutes > config.waitingTimeFreeMinutes) {
    const chargeableMinutes = waitingTimeMinutes - config.waitingTimeFreeMinutes;
    waitingTimeCharge = chargeableMinutes * config.waitingTimePerMinute;
  }
  
  const totalDistance = distance + totalMultiDropDistance;
  const totalPrice = subtotalBeforeReturn + returnTripCharge + waitingTimeCharge;
  
  return {
    vehicleType,
    distance,
    totalDistance,
    weight,
    baseCharge,
    distanceCharge,
    multiDropDistanceCharge,
    weightSurcharge,
    congestionZoneCharge,
    multiDropCharge,
    returnTripCharge,
    waitingTimeCharge,
    waitingTimeMinutes,
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
// Weight up to and including 10kg is free
function getWeightSurchargeWithConfig(weight: number, config: PricingConfig): number {
  for (const surcharge of config.weightSurcharges) {
    if (weight > surcharge.min && (surcharge.max === null || weight <= surcharge.max)) {
      return surcharge.charge;
    }
  }
  return 0;
}
