import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Pressable, Alert, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Constants from 'expo-constants';
import { ScreenKeyboardAwareScrollView } from '@/components/ScreenKeyboardAwareScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Card } from '@/components/Card';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { customerService } from '@/services/customerService';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';
import { TextInput } from 'react-native';
import { PostcodeAddressInput } from '@/components/PostcodeAddressInput';

// Get Google Maps API key from environment (client-side)
const getGoogleMapsApiKey = (): string => {
  try {
    const extra = Constants.expoConfig?.extra || (Constants as any).manifest?.extra || {};
    return extra.googleMapsApiKey || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  } catch {
    return '';
  }
};

type LatLng = { lat: number; lng: number } | null;

type VehicleType = 'motorbike' | 'car' | 'small_van' | 'medium_van';

const vehicleOptions: { type: VehicleType; label: string; icon: string; description: string }[] = [
  { type: 'motorbike', label: 'Motorbike', icon: 'zap', description: 'Small packages, fastest' },
  { type: 'car', label: 'Car', icon: 'truck', description: 'Medium packages' },
  { type: 'small_van', label: 'Small Van', icon: 'package', description: 'Large packages' },
  { type: 'medium_van', label: 'Medium Van', icon: 'box', description: 'Bulk deliveries' },
];

export function NewBookingScreen() {
  const { theme } = useTheme();
  const { customerProfile, userRole } = useAuth();
  const navigation = useNavigation<any>();
  
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupPostcode, setPickupPostcode] = useState('');
  const [pickupBuilding, setPickupBuilding] = useState('');
  const [pickupLatLng, setPickupLatLng] = useState<LatLng>(null);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPostcode, setDeliveryPostcode] = useState('');
  const [deliveryBuilding, setDeliveryBuilding] = useState('');
  const [deliveryLatLng, setDeliveryLatLng] = useState<LatLng>(null);
  const [distanceMiles, setDistanceMiles] = useState(0);
  const [additionalStops, setAdditionalStops] = useState<Array<{ address: string; postcode: string; building: string; recipientName: string; recipientPhone: string }>>([]);
  const [scheduledDate, setScheduledDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isAsap, setIsAsap] = useState(true);
  const [hasSelectedDateTime, setHasSelectedDateTime] = useState(false);
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [parcelWeight, setParcelWeight] = useState('');
  const [parcelDescription, setParcelDescription] = useState('');
  const [senderName, setSenderName] = useState(customerProfile?.full_name || '');
  const [senderPhone, setSenderPhone] = useState(customerProfile?.phone || '');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [isReturnRequired, setIsReturnRequired] = useState(false);
  const canPayLater = userRole === 'business' && customerProfile?.stripe_customer_id && customerProfile?.pay_later_enabled === true;
  const [paymentOption, setPaymentOption] = useState<'pay_now' | 'pay_later'>('pay_now');
  const [showPayLaterMessage, setShowPayLaterMessage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quoteGenerated, setQuoteGenerated] = useState(false);
  const [gettingQuote, setGettingQuote] = useState(false);
  const [pricingConfig, setPricingConfig] = useState<{
    vehiclePricing: Record<string, { basePrice: number; ratePerMile: number; rushHourRate: number }>;
    surcharges: Record<string, { value: number; unit: string }>;
  } | null>(null);
  
  // Haversine formula to calculate straight-line distance between two points
  const calculateHaversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 3958.8; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightLine = R * c;
    return straightLine * 1.3;
  };

  // Calculate distance using Google Distance Matrix API (client-side)
  const calculateDistanceClientSide = async (pickup: { lat: number; lng: number }, delivery: { lat: number; lng: number }): Promise<number> => {
    const apiKey = getGoogleMapsApiKey();
    
    if (!apiKey) {
      console.log('[DISTANCE] No API key, using Haversine fallback');
      return calculateHaversineDistance(pickup.lat, pickup.lng, delivery.lat, delivery.lng);
    }

    try {
      const origins = `${pickup.lat},${pickup.lng}`;
      const destinations = `${delivery.lat},${delivery.lng}`;
      
      const params = new URLSearchParams({
        origins,
        destinations,
        key: apiKey,
        units: 'imperial',
      });

      console.log('[DISTANCE] Requesting from Google Distance Matrix API');
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`
      );

      if (response.ok) {
        const data = await response.json();
        console.log('[DISTANCE] API response status:', data.status);

        if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') {
          const distanceMeters = data.rows[0].elements[0].distance.value;
          const distanceMiles = distanceMeters / 1609.344;
          console.log('[DISTANCE] Google API success:', distanceMiles.toFixed(2), 'miles');
          return Math.round(distanceMiles * 10) / 10;
        } else {
          console.log('[DISTANCE] API element status:', data.rows?.[0]?.elements?.[0]?.status);
        }
      }
    } catch (error: any) {
      console.log('[DISTANCE] API error:', error.message);
    }

    console.log('[DISTANCE] Using Haversine fallback');
    return calculateHaversineDistance(pickup.lat, pickup.lng, delivery.lat, delivery.lng);
  };

  // Calculate distance when both coordinates exist
  useEffect(() => {
    if (pickupLatLng && deliveryLatLng) {
      calculateDistanceClientSide(pickupLatLng, deliveryLatLng).then(setDistanceMiles);
    } else {
      setDistanceMiles(0);
    }
  }, [pickupLatLng, deliveryLatLng]);

  const isRushHour = (date: Date): boolean => {
    const hours = date.getHours();
    return (hours >= 7 && hours < 10) || (hours >= 16 && hours < 19);
  };

  useEffect(() => {
    const loadPricing = async () => {
      const config = await customerService.getPricingConfig();
      setPricingConfig(config);
    };
    loadPricing();
  }, []);

  const getValidationErrors = (): string[] => {
    const errors: string[] = [];
    
    if (!pickupPostcode.trim()) errors.push('Pickup postcode');
    if (!pickupAddress.trim()) errors.push('Pickup address');
    if (!pickupBuilding.trim()) errors.push('Pickup building name/number');
    if (!senderName.trim()) errors.push('Sender name');
    if (!senderPhone.trim()) errors.push('Sender phone');
    if (!deliveryPostcode.trim()) errors.push('Delivery postcode');
    if (!deliveryAddress.trim()) errors.push('Delivery address');
    if (!deliveryBuilding.trim()) errors.push('Delivery building name/number');
    if (!recipientName.trim()) errors.push('Recipient name');
    if (!recipientPhone.trim()) errors.push('Recipient phone');
    
    for (let i = 0; i < additionalStops.length; i++) {
      const stop = additionalStops[i];
      if (!stop.postcode.trim()) errors.push(`Stop ${i + 1} postcode`);
      if (!stop.address.trim()) errors.push(`Stop ${i + 1} address`);
      if (!stop.building.trim()) errors.push(`Stop ${i + 1} building name/number`);
      if (!stop.recipientName.trim()) errors.push(`Stop ${i + 1} recipient name`);
      if (!stop.recipientPhone.trim()) errors.push(`Stop ${i + 1} recipient phone`);
    }
    
    return errors;
  };

  const canGetQuote = (): boolean => {
    if (!customerProfile) return false;
    if (!pricingConfig) return false;
    if (!pickupPostcode.trim() || !pickupAddress.trim()) return false;
    if (!pickupBuilding.trim()) return false;
    if (!deliveryPostcode.trim() || !deliveryAddress.trim()) return false;
    if (!deliveryBuilding.trim()) return false;
    if (!senderName.trim() || !senderPhone.trim()) return false;
    if (!recipientName.trim() || !recipientPhone.trim()) return false;
    if (!pickupLatLng || !deliveryLatLng) return false;
    
    if (!isAsap && !hasSelectedDateTime) return false;
    
    for (const stop of additionalStops) {
      if (!stop.postcode.trim() || !stop.address.trim()) return false;
      if (!stop.building.trim()) return false;
      if (!stop.recipientName.trim() || !stop.recipientPhone.trim()) return false;
    }
    
    return true;
  };

  const isFormValid = (): boolean => {
    if (!canGetQuote()) return false;
    if (!quoteGenerated) return false;
    if (priceBreakdown.total <= 0) return false;
    
    return true;
  };

  const handleGetQuote = async () => {
    if (!canGetQuote()) return;
    
    setGettingQuote(true);
    
    try {
      let pickupCoords = pickupLatLng;
      let deliveryCoords = deliveryLatLng;
      
      if (!pickupCoords) {
        Alert.alert(
          'Select Pickup Address',
          'Please select a pickup address from the dropdown suggestions to get an accurate quote.'
        );
        setGettingQuote(false);
        return;
      }
      
      if (!deliveryCoords) {
        Alert.alert(
          'Select Delivery Address',
          'Please select a delivery address from the dropdown suggestions to get an accurate quote.'
        );
        setGettingQuote(false);
        return;
      }
      
      const calculatedDistance = await calculateDistanceClientSide(pickupCoords, deliveryCoords);
      
      setDistanceMiles(calculatedDistance);
      
      if (calculatedDistance <= 0) {
        Alert.alert(
          'Cannot Calculate Quote',
          'Unable to determine the distance between your addresses. Please try again.'
        );
        setGettingQuote(false);
        return;
      }
      
      calculatePrice({ pickup: pickupCoords, delivery: deliveryCoords, distance: calculatedDistance });
      setQuoteGenerated(true);
      setGettingQuote(false);
      
    } catch (error) {
      console.error('Error getting quote:', error);
      Alert.alert('Quote Error', 'Unable to calculate quote. Please check your addresses and try again.');
      setGettingQuote(false);
    }
  };

  const validateForm = () => {
    const errors = getValidationErrors();
    
    if (errors.length > 0) {
      Alert.alert(
        'Missing Information',
        `Please fill in the following fields:\n\n${errors.join('\n')}`
      );
      return false;
    }
    
    if (!pricingConfig || priceBreakdown.total <= 0) {
      Alert.alert('Pricing Error', 'Unable to calculate price. Please try again.');
      return false;
    }
    
    return true;
  };

  const addStop = () => {
    setAdditionalStops([...additionalStops, { address: '', postcode: '', building: '', recipientName: '', recipientPhone: '' }]);
  };

  const removeStop = (index: number) => {
    setAdditionalStops(additionalStops.filter((_, i) => i !== index));
  };

  const updateStop = (index: number, field: string, value: string) => {
    const updated = [...additionalStops];
    updated[index] = { ...updated[index], [field]: value };
    setAdditionalStops(updated);
  };

  const [estimatedPrice, setEstimatedPrice] = useState(0);
  const [isRushHourPrice, setIsRushHourPrice] = useState(false);

  // Calculate price using database config
  const calculatePrice = (overrides?: { pickup?: LatLng | null; delivery?: LatLng | null; distance?: number }) => {
    const weight = parcelWeight ? parseFloat(parcelWeight) : 0;
    const effectivePickup = overrides?.pickup !== undefined ? overrides.pickup : pickupLatLng;
    const effectiveDelivery = overrides?.delivery !== undefined ? overrides.delivery : deliveryLatLng;
    const effectiveDistance = overrides?.distance !== undefined ? overrides.distance : distanceMiles;
    
    // DEBUG: Log all required values
    console.log('[PRICE INPUTS]', {
      vehicleType,
      distanceMiles: effectiveDistance,
      weightKg: weight,
      isAsap,
      isReturn: isReturnRequired,
    });

    // Guard: Return £0.00 if pricingConfig not loaded
    if (!pricingConfig) {
      console.log('[PRICE DEBUG] BLOCKED: pricingConfig is null');
      setEstimatedPrice(0);
      setIsRushHourPrice(false);
      return;
    }
    
    // Guard: Pickup coordinates required
    if (!effectivePickup) {
      console.log('[PRICE DEBUG] BLOCKED: pickupLatLng is null');
      setEstimatedPrice(0);
      setIsRushHourPrice(false);
      return;
    }
    
    // Guard: Delivery coordinates required
    if (!effectiveDelivery) {
      console.log('[PRICE DEBUG] BLOCKED: deliveryLatLng is null');
      setEstimatedPrice(0);
      setIsRushHourPrice(false);
      return;
    }
    
    // Guard: Valid distance required (must be > 0)
    if (effectiveDistance <= 0) {
      console.log('[PRICE DEBUG] BLOCKED: distanceMiles is <= 0');
      setEstimatedPrice(0);
      setIsRushHourPrice(false);
      return;
    }
    
    // Guard: Either date/time selected OR isAsap must be true
    if (!isAsap && !hasSelectedDateTime) {
      console.log('[PRICE DEBUG] BLOCKED: neither isAsap nor hasSelectedDateTime is true');
      setEstimatedPrice(0);
      setIsRushHourPrice(false);
      return;
    }

    console.log('[PRICE DEBUG] All guards passed, calculating price...');

    const vehiclePrices = pricingConfig.vehiclePricing?.[vehicleType] || { basePrice: 7.50, ratePerMile: 1.50, rushHourRate: 1.80 };
    const basePrice = vehiclePrices.basePrice;
    const rushHour = isRushHour(scheduledDate);
    const ratePerMile = rushHour ? vehiclePrices.rushHourRate : vehiclePrices.ratePerMile;
    
    // For multi-drop: add 3 miles for each additional stop
    const additionalStopMiles = additionalStops.length * 3;
    const totalMiles = effectiveDistance + additionalStopMiles;
    const distanceCost = totalMiles * ratePerMile;
    
    // Weight surcharge from database
    const weightSurcharge = pricingConfig.surcharges?.weight_per_kg_over_5;
    const chargeableWeight = Math.max(0, weight - 5);
    const weightCost = weightSurcharge ? chargeableWeight * weightSurcharge.value : 0;
    
    // Subtotal before return
    const subtotal = basePrice + distanceCost + weightCost;
    
    // Return delivery surcharge from database
    const returnConfig = pricingConfig.surcharges?.return_delivery;
    const returnSurcharge = isReturnRequired && returnConfig 
      ? (returnConfig.unit === 'percentage' ? subtotal * (returnConfig.value / 100) : returnConfig.value)
      : 0;
    
    const total = subtotal + returnSurcharge;
    
    console.log('[FINAL ESTIMATED PRICE]', total.toFixed(2));

    setEstimatedPrice(total);
    setIsRushHourPrice(rushHour);
  };

  // Trigger price recalculation when any required input changes
  // But don't recalculate if a quote has been generated (to avoid resetting it)
  useEffect(() => {
    if (!quoteGenerated) {
      calculatePrice();
    }
  }, [pickupLatLng, deliveryLatLng, vehicleType, distanceMiles, scheduledDate, isAsap, hasSelectedDateTime, pricingConfig, parcelWeight, isReturnRequired, additionalStops.length, quoteGenerated]);

  // Track previous values to detect actual changes (not just initial render)
  const prevValuesRef = React.useRef<{
    pickupPostcode: string;
    deliveryPostcode: string;
    vehicleType: string;
    parcelWeight: string;
    isReturnRequired: boolean;
  } | null>(null);
  
  // Reset quote when any input changes that affects the price
  useEffect(() => {
    // Skip if we're in the middle of getting a quote
    if (gettingQuote) return;
    
    // Only reset if values actually changed (not on initial render)
    const prevValues = prevValuesRef.current;
    if (prevValues && quoteGenerated) {
      const hasChanged = 
        prevValues.pickupPostcode !== pickupPostcode ||
        prevValues.deliveryPostcode !== deliveryPostcode ||
        prevValues.vehicleType !== vehicleType ||
        prevValues.parcelWeight !== parcelWeight ||
        prevValues.isReturnRequired !== isReturnRequired;
      
      if (hasChanged) {
        console.log('[QUOTE] Resetting quote due to input change');
        setQuoteGenerated(false);
      }
    }
    
    // Update previous values
    prevValuesRef.current = {
      pickupPostcode,
      deliveryPostcode,
      vehicleType,
      parcelWeight,
      isReturnRequired,
    };
  }, [pickupPostcode, deliveryPostcode, vehicleType, parcelWeight, isReturnRequired, gettingQuote, quoteGenerated]);

  const priceBreakdown = { total: estimatedPrice, isRushHourPrice };

  const calculateEstimate = () => {
    return priceBreakdown.total.toFixed(2);
  };

  const handleSubmit = async () => {
    console.log('handleSubmit called, customerProfile:', customerProfile?.id);
    
    if (!customerProfile) {
      Alert.alert('Profile Not Ready', 'Your customer profile is still loading. Please wait a moment and try again.');
      return;
    }
    
    if (!validateForm()) return;
    
    const estimatedPrice = parseFloat(calculateEstimate());
    const isMultiDrop = additionalStops.length > 0;
    
    const formatDate = (date: Date): string => {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };
    
    const formatTime = (date: Date): string => {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };
    
    const bookingData = {
      customer_id: customerProfile.id,
      pickup_address: `${pickupBuilding.trim()}, ${pickupAddress.trim()}`,
      pickup_postcode: pickupPostcode.trim().toUpperCase(),
      delivery_address: `${deliveryBuilding.trim()}, ${deliveryAddress.trim()}`,
      delivery_postcode: deliveryPostcode.trim().toUpperCase(),
      scheduled_date: isAsap ? new Date().toISOString().split('T')[0] : scheduledDate.toISOString().split('T')[0],
      scheduled_time: isAsap ? null : formatTime(scheduledDate),
      vehicle_type: vehicleType,
      parcel_weight: parcelWeight ? parseFloat(parcelWeight) : undefined,
      parcel_description: parcelDescription.trim() || undefined,
      sender_name: senderName.trim(),
      sender_phone: senderPhone.trim(),
      recipient_name: recipientName.trim(),
      recipient_phone: recipientPhone.trim(),
      notes: notes.trim() || undefined,
      is_multi_drop: isMultiDrop,
      is_return_required: isReturnRequired,
      payment_option: paymentOption,
      price_estimate: estimatedPrice,
      status: paymentOption === 'pay_now' ? 'pending_payment' : 'confirmed',
    };
    
    console.log('Booking data to submit:', JSON.stringify(bookingData, null, 2));
    
    setLoading(true);
    try {
      console.log('Creating booking in database...');
      const booking = await customerService.createBooking(bookingData as any);
      
      if (!booking) {
        console.error('Booking creation returned null - database insert failed');
        Alert.alert(
          'Booking Failed',
          'We could not save your booking to the database. Please check your connection and try again.'
        );
        return;
      }
      
      console.log('Booking created successfully:', booking.id);

      if (paymentOption === 'pay_now') {
        console.log('Navigating to Payment screen with bookingId:', booking.id, 'amount:', estimatedPrice);
        navigation.replace('Payment', { bookingId: booking.id, amount: calculateEstimate(), paymentOption: 'pay_now' });
      } else if (paymentOption === 'pay_later' && canPayLater) {
        console.log('Navigating to Payment screen for invoice confirmation');
        navigation.replace('Payment', { bookingId: booking.id, amount: calculateEstimate(), paymentOption: 'pay_later' });
      } else {
        Alert.alert('Booking Created', 'Your delivery has been booked successfully! You will receive an invoice.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error: any) {
      console.error('Booking error:', error);
      const errorMessage = error?.message || 'Unknown error';
      Alert.alert(
        'Booking Error',
        `Failed to create booking: ${errorMessage}\n\nPlease try again or contact support if this continues.`
      );
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = [styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }];

  return (
    <ScreenKeyboardAwareScrollView hasTabBar={true}>
      <Card style={[styles.section, { zIndex: 1002 }] as any}>
        <ThemedText style={styles.sectionTitle}>Pickup Details</ThemedText>
        <View style={{ zIndex: 1001 }}>
          <PostcodeAddressInput
            postcodeValue={pickupPostcode}
            addressValue={pickupAddress}
            onPostcodeChange={setPickupPostcode}
            onAddressChange={setPickupAddress}
            onAddressSelect={(address, postcode) => {
              setPickupAddress(address);
              setPickupPostcode(postcode);
            }}
            onPlaceSelected={(details) => {
              console.log('[PICKUP] Place selected:', details.lat, details.lng);
              setPickupLatLng({ lat: details.lat, lng: details.lng });
            }}
            onPlaceInvalidated={() => {
              setPickupLatLng(null);
              setQuoteGenerated(false);
            }}
            hasValidPlace={pickupLatLng !== null}
            label="Pickup"
          />
        </View>
        <TextInput
          style={[inputStyle, { marginTop: Spacing.md }]}
          placeholder="Building Name/Number *"
          placeholderTextColor={theme.placeholder}
          value={pickupBuilding}
          onChangeText={setPickupBuilding}
        />
        <TextInput
          style={inputStyle}
          placeholder="Sender Name"
          placeholderTextColor={theme.placeholder}
          value={senderName}
          onChangeText={setSenderName}
        />
        <TextInput
          style={inputStyle}
          placeholder="Sender Phone"
          placeholderTextColor={theme.placeholder}
          value={senderPhone}
          onChangeText={setSenderPhone}
          keyboardType="phone-pad"
        />
      </Card>

      <Card style={[styles.section, { zIndex: 1000 }] as any}>
        <ThemedText style={styles.sectionTitle}>Delivery Details</ThemedText>
        <View style={{ zIndex: 999 }}>
          <PostcodeAddressInput
            postcodeValue={deliveryPostcode}
            addressValue={deliveryAddress}
            onPostcodeChange={setDeliveryPostcode}
            onAddressChange={setDeliveryAddress}
            onAddressSelect={(address, postcode) => {
              setDeliveryAddress(address);
              setDeliveryPostcode(postcode);
            }}
            onPlaceSelected={(details) => {
              console.log('[DELIVERY] Place selected:', details.lat, details.lng);
              setDeliveryLatLng({ lat: details.lat, lng: details.lng });
            }}
            onPlaceInvalidated={() => {
              setDeliveryLatLng(null);
              setQuoteGenerated(false);
            }}
            hasValidPlace={deliveryLatLng !== null}
            label="Delivery"
          />
        </View>
        <TextInput
          style={[inputStyle, { marginTop: Spacing.md }]}
          placeholder="Building Name/Number *"
          placeholderTextColor={theme.placeholder}
          value={deliveryBuilding}
          onChangeText={setDeliveryBuilding}
        />
        <TextInput
          style={inputStyle}
          placeholder="Recipient Name"
          placeholderTextColor={theme.placeholder}
          value={recipientName}
          onChangeText={setRecipientName}
        />
        <TextInput
          style={inputStyle}
          placeholder="Recipient Phone"
          placeholderTextColor={theme.placeholder}
          value={recipientPhone}
          onChangeText={setRecipientPhone}
          keyboardType="phone-pad"
        />
        
        {additionalStops.map((stop, index) => (
          <View key={index} style={[styles.additionalStop, { borderColor: theme.border, zIndex: 900 - index }]}>
            <View style={styles.stopHeader}>
              <ThemedText style={styles.stopTitle}>Stop {index + 2}</ThemedText>
              <Pressable onPress={() => removeStop(index)} style={styles.removeButton}>
                <Feather name="x-circle" size={20} color={theme.error} />
              </Pressable>
            </View>
            <View style={{ zIndex: 850 - index }}>
              <PostcodeAddressInput
                postcodeValue={stop.postcode}
                addressValue={stop.address}
                onPostcodeChange={(val) => updateStop(index, 'postcode', val)}
                onAddressChange={(val) => updateStop(index, 'address', val)}
                onAddressSelect={(address, postcode) => {
                  updateStop(index, 'address', address);
                  updateStop(index, 'postcode', postcode);
                }}
                label={`Stop ${index + 2}`}
              />
            </View>
            <TextInput
              style={[inputStyle, { marginTop: Spacing.md }]}
              placeholder="Building Name/Number *"
              placeholderTextColor={theme.placeholder}
              value={stop.building}
              onChangeText={(val) => updateStop(index, 'building', val)}
            />
            <TextInput
              style={inputStyle}
              placeholder="Recipient Name"
              placeholderTextColor={theme.placeholder}
              value={stop.recipientName}
              onChangeText={(val) => updateStop(index, 'recipientName', val)}
            />
            <TextInput
              style={inputStyle}
              placeholder="Recipient Phone"
              placeholderTextColor={theme.placeholder}
              value={stop.recipientPhone}
              onChangeText={(val) => updateStop(index, 'recipientPhone', val)}
              keyboardType="phone-pad"
            />
          </View>
        ))}
        
        <Pressable
          style={[styles.addStopButton, { borderColor: theme.primary }]}
          onPress={addStop}
        >
          <Feather name="plus-circle" size={20} color={theme.primary} />
          <ThemedText style={{ color: theme.primary, marginLeft: Spacing.sm }}>Add Another Stop</ThemedText>
        </Pressable>
      </Card>

      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Schedule</ThemedText>
        <View style={styles.scheduleRow}>
          <Pressable
            style={[styles.dateButton, styles.scheduleButton, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Feather name="calendar" size={20} color={theme.primary} />
            <ThemedText style={styles.dateText}>
              {scheduledDate.toLocaleDateString()}
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.dateButton, styles.scheduleButton, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
            onPress={() => setShowTimePicker(true)}
          >
            <Feather name="clock" size={20} color={theme.primary} />
            <ThemedText style={styles.dateText}>
              {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </ThemedText>
          </Pressable>
        </View>
        {showDatePicker ? (
          <DateTimePicker
            value={scheduledDate}
            mode="date"
            minimumDate={new Date()}
            onChange={(event, date) => {
              setShowDatePicker(Platform.OS === 'ios');
              if (date) {
                setScheduledDate(date);
                setHasSelectedDateTime(true);
                setIsAsap(false);
              }
            }}
          />
        ) : null}
        {showTimePicker ? (
          <DateTimePicker
            value={scheduledDate}
            mode="time"
            onChange={(event, date) => {
              setShowTimePicker(Platform.OS === 'ios');
              if (date) {
                setScheduledDate(date);
                setHasSelectedDateTime(true);
                setIsAsap(false);
              }
            }}
          />
        ) : null}
      </Card>

      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Vehicle Type</ThemedText>
        <View style={styles.vehicleGrid}>
          {vehicleOptions.map((option) => (
            <Pressable
              key={option.type}
              style={[
                styles.vehicleOption,
                { 
                  backgroundColor: vehicleType === option.type ? theme.primary + '15' : theme.backgroundSecondary,
                  borderColor: vehicleType === option.type ? theme.primary : theme.border,
                },
              ]}
              onPress={() => setVehicleType(option.type)}
            >
              <Feather 
                name={option.icon as any} 
                size={24} 
                color={vehicleType === option.type ? theme.primary : theme.text} 
              />
              <ThemedText style={[styles.vehicleLabel, vehicleType === option.type && { color: theme.primary }]}>
                {option.label}
              </ThemedText>
              <ThemedText style={[styles.vehicleDesc, { color: theme.secondaryText }]}>
                {option.description}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </Card>


      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Package Details</ThemedText>
        <TextInput
          style={inputStyle}
          placeholder="Weight (kg) - Optional"
          placeholderTextColor={theme.placeholder}
          value={parcelWeight}
          onChangeText={setParcelWeight}
          keyboardType="decimal-pad"
        />
        <TextInput
          style={[inputStyle, styles.multiline]}
          placeholder="Description - Optional"
          placeholderTextColor={theme.placeholder}
          value={parcelDescription}
          onChangeText={setParcelDescription}
          multiline
          numberOfLines={3}
        />
        <TextInput
          style={[inputStyle, styles.multiline]}
          placeholder="Special Instructions - Optional"
          placeholderTextColor={theme.placeholder}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />
        <Pressable
          style={styles.toggleRow}
          onPress={() => setIsReturnRequired(!isReturnRequired)}
        >
          <View style={[styles.checkbox, { borderColor: theme.border }, isReturnRequired && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
            {isReturnRequired ? <Feather name="check" size={16} color="#fff" /> : null}
          </View>
          <ThemedText>Return delivery required</ThemedText>
        </Pressable>
      </Card>

      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Payment Option</ThemedText>
        <View style={styles.paymentOptions}>
          <Pressable
            style={[
              styles.paymentOption,
              userRole !== 'business' && styles.paymentOptionFull,
              { 
                backgroundColor: paymentOption === 'pay_now' ? theme.primary + '15' : theme.backgroundSecondary,
                borderColor: paymentOption === 'pay_now' ? theme.primary : theme.border,
              },
            ]}
            onPress={() => setPaymentOption('pay_now')}
          >
            <Feather name="credit-card" size={24} color={paymentOption === 'pay_now' ? theme.primary : theme.text} />
            <ThemedText style={paymentOption === 'pay_now' ? { color: theme.primary } : undefined}>Pay Now</ThemedText>
          </Pressable>
          {userRole === 'business' ? (
            <Pressable
              style={[
                styles.paymentOption,
                { 
                  backgroundColor: paymentOption === 'pay_later' ? theme.primary + '15' : theme.backgroundSecondary,
                  borderColor: paymentOption === 'pay_later' ? theme.primary : theme.border,
                },
              ]}
              onPress={() => {
                if (canPayLater) {
                  setPaymentOption('pay_later');
                  setShowPayLaterMessage(false);
                } else {
                  setShowPayLaterMessage(true);
                }
              }}
            >
              <Feather name="file-text" size={24} color={paymentOption === 'pay_later' ? theme.primary : theme.text} />
              <ThemedText style={paymentOption === 'pay_later' ? { color: theme.primary } : undefined}>Invoice Later</ThemedText>
            </Pressable>
          ) : null}
        </View>
        {showPayLaterMessage && !canPayLater ? (
          <View style={[styles.payLaterMessageBox, { backgroundColor: theme.warning + '15', borderColor: theme.warning }]}>
            <Feather name="info" size={16} color={theme.warning} />
            <ThemedText style={[styles.payLaterMessageText, { color: theme.text }]}>
              To activate invoice payments, please contact our sales department.
            </ThemedText>
          </View>
        ) : null}
      </Card>

      {!quoteGenerated ? (
        <Pressable
          style={[
            styles.submitButton, 
            { backgroundColor: theme.primary }, 
            (gettingQuote || !canGetQuote()) && { opacity: 0.6 }
          ]}
          onPress={handleGetQuote}
          disabled={gettingQuote || !canGetQuote()}
        >
          <ThemedText style={styles.submitButtonText}>
            {gettingQuote ? 'Calculating Quote...' : 'Get Quote'}
          </ThemedText>
        </Pressable>
      ) : (
        <>
          <Card style={{ ...styles.section, ...styles.summaryCard }}>
            <View style={styles.summaryRow}>
              <ThemedText style={styles.summaryLabel}>Estimated Price</ThemedText>
              <ThemedText style={[styles.summaryPrice, { color: theme.primary }]}>
                {'\u00A3'}{calculateEstimate()}
              </ThemedText>
            </View>
            {distanceMiles > 0 ? (
              <ThemedText style={[styles.summaryNote, { color: theme.secondaryText }]}>
                Distance: {distanceMiles.toFixed(1)} miles
              </ThemedText>
            ) : null}
            <ThemedText style={[styles.summaryNote, { color: theme.secondaryText }]}>
              Final price confirmed after distance verification
            </ThemedText>
          </Card>

          <Pressable
            style={[
              styles.submitButton, 
              { backgroundColor: theme.primary }, 
              (loading || !isFormValid()) && { opacity: 0.6 }
            ]}
            onPress={handleSubmit}
            disabled={loading || !isFormValid()}
          >
            <ThemedText style={styles.submitButtonText}>
              {loading ? 'Creating Booking...' : (paymentOption === 'pay_now' ? 'Continue to Payment' : 'Book Delivery')}
            </ThemedText>
          </Pressable>
        </>
      )}
    </ScreenKeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  section: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h4,
    marginBottom: Spacing.md,
  },
  input: {
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    ...Typography.body,
  },
  multiline: {
    height: 80,
    paddingTop: Spacing.md,
    textAlignVertical: 'top',
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  scheduleButton: {
    flex: 1,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  dateText: {
    ...Typography.body,
  },
  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  vehicleOption: {
    flex: 1,
    minWidth: '45%',
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  vehicleLabel: {
    ...Typography.bodyMedium,
  },
  vehicleDesc: {
    ...Typography.caption,
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderRadius: BorderRadius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  paymentOption: {
    flex: 1,
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  paymentOptionFull: {
    flex: undefined,
    width: '100%',
  },
  payLaterNote: {
    ...Typography.caption,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  payLaterMessageBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  payLaterMessageText: {
    ...Typography.caption,
    flex: 1,
  },
  summaryCard: {
    marginBottom: Spacing.lg,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  breakdownLabel: {
    ...Typography.body,
    flex: 1,
  },
  breakdownValue: {
    ...Typography.body,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  summaryLabel: {
    ...Typography.bodyMedium,
  },
  summaryPrice: {
    ...Typography.h3,
  },
  summaryNote: {
    ...Typography.caption,
  },
  submitButton: {
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['3xl'],
  },
  submitButtonText: {
    ...Typography.button,
    color: '#fff',
  },
  additionalStop: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  stopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  stopTitle: {
    ...Typography.bodyMedium,
  },
  removeButton: {
    padding: Spacing.xs,
  },
  addStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    borderStyle: 'dashed',
  },
  distanceNote: {
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
});
