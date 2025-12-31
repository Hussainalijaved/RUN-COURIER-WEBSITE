import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Platform, Pressable, Text, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';

interface RouteInfo {
  distance: string;
  duration: string;
  polylinePoints: Array<{ latitude: number; longitude: number }>;
}

interface DriverJobMapProps {
  pickupAddress: string;
  deliveryAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  driverLat?: number;
  driverLng?: number;
  trackingNumber: string;
  distanceMiles?: number;
  onNavigatePress: (type: 'pickup' | 'delivery') => void;
  currentPhase?: 'pickup' | 'delivery';
}

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || 
                            process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

function decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
  const points: Array<{ latitude: number; longitude: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
}

export function DriverJobMap({
  pickupAddress,
  deliveryAddress,
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  driverLat,
  driverLng,
  trackingNumber,
  distanceMiles,
  onNavigatePress,
  currentPhase = 'pickup',
}: DriverJobMapProps) {
  const { theme } = useTheme();
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasPickup = typeof pickupLat === 'number' && typeof pickupLng === 'number';
  const hasDropoff = typeof dropoffLat === 'number' && typeof dropoffLng === 'number';
  const hasDriver = typeof driverLat === 'number' && typeof driverLng === 'number';
  const hasRoute = hasPickup && hasDropoff;

  useEffect(() => {
    if (hasRoute && GOOGLE_MAPS_API_KEY) {
      fetchRoute();
    } else {
      setLoading(false);
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng]);

  const fetchRoute = async () => {
    if (!hasPickup || !hasDropoff || !GOOGLE_MAPS_API_KEY) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const origin = `${pickupLat},${pickupLng}`;
      const destination = `${dropoffLat},${dropoffLng}`;
      
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];
        const polylineEncoded = route.overview_polyline.points;
        
        setRouteInfo({
          distance: leg.distance.text,
          duration: leg.duration.text,
          polylinePoints: decodePolyline(polylineEncoded),
        });
      } else {
        setError('Route unavailable');
      }
    } catch (err) {
      console.error('Error fetching route:', err);
      setError('Failed to load route');
    } finally {
      setLoading(false);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}>
        <View style={styles.webPlaceholder}>
          <Feather name="map" size={32} color={theme.secondaryText} />
          <ThemedText type="body" color="secondary" style={styles.placeholderText}>
            Map available in mobile app
          </ThemedText>
        </View>
        <JobInfoOverlay
          trackingNumber={trackingNumber}
          pickupAddress={pickupAddress}
          deliveryAddress={deliveryAddress}
          distance={routeInfo?.distance || (distanceMiles ? `${distanceMiles} mi` : 'N/A')}
          duration={routeInfo?.duration || 'N/A'}
          theme={theme}
          onNavigatePress={onNavigatePress}
          currentPhase={currentPhase}
          hasValidAddress={!!(pickupAddress || deliveryAddress)}
        />
      </View>
    );
  }

  if (!hasPickup && !hasDropoff) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}>
        <View style={styles.webPlaceholder}>
          <Feather name="map-pin" size={32} color={theme.secondaryText} />
          <ThemedText type="body" color="secondary" style={styles.placeholderText}>
            Location data unavailable
          </ThemedText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}>
      <NativeMapWithRoute
        pickupLat={pickupLat}
        pickupLng={pickupLng}
        dropoffLat={dropoffLat}
        dropoffLng={dropoffLng}
        driverLat={driverLat}
        driverLng={driverLng}
        routePoints={routeInfo?.polylinePoints}
        hasPickup={hasPickup}
        hasDropoff={hasDropoff}
        hasDriver={hasDriver}
        theme={theme}
        loading={loading}
      />
      <JobInfoOverlay
        trackingNumber={trackingNumber}
        pickupAddress={pickupAddress}
        deliveryAddress={deliveryAddress}
        distance={routeInfo?.distance || (distanceMiles ? `${distanceMiles} mi` : 'N/A')}
        duration={routeInfo?.duration || 'N/A'}
        theme={theme}
        onNavigatePress={onNavigatePress}
        currentPhase={currentPhase}
        loading={loading}
        hasValidAddress={hasPickup || hasDropoff}
      />
    </View>
  );
}

function NativeMapWithRoute({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  driverLat,
  driverLng,
  routePoints,
  hasPickup,
  hasDropoff,
  hasDriver,
  theme,
  loading,
}: {
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  driverLat?: number;
  driverLng?: number;
  routePoints?: Array<{ latitude: number; longitude: number }>;
  hasPickup: boolean;
  hasDropoff: boolean;
  hasDriver: boolean;
  theme: any;
  loading: boolean;
}) {
  const MapView = require('react-native-maps').default;
  const { Marker, Polyline, PROVIDER_GOOGLE } = require('react-native-maps');
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (mapRef.current && hasPickup && hasDropoff) {
      const coordinates = [
        { latitude: pickupLat!, longitude: pickupLng! },
        { latitude: dropoffLat!, longitude: dropoffLng! },
      ];
      
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(coordinates, {
          edgePadding: { top: 80, right: 60, bottom: 200, left: 60 },
          animated: true,
        });
      }, 300);
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, routePoints]);

  const initialRegion = hasPickup 
    ? {
        latitude: pickupLat!,
        longitude: pickupLng!,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      }
    : hasDropoff 
    ? {
        latitude: dropoffLat!,
        longitude: dropoffLng!,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      }
    : {
        latitude: 51.5074,
        longitude: -0.1278,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };

  return (
    <View style={styles.mapWrapper}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsBuildings={false}
        showsTraffic={false}
        showsIndoors={false}
        toolbarEnabled={false}
        mapPadding={{ top: 0, right: 0, bottom: 180, left: 0 }}
      >
        {hasPickup ? (
          <Marker
            coordinate={{ latitude: pickupLat!, longitude: pickupLng! }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.customMarker}>
              <View style={[styles.markerPin, { backgroundColor: '#4CAF50' }]}>
                <Feather name="package" size={16} color="#fff" />
              </View>
              <View style={[styles.markerStem, { backgroundColor: '#4CAF50' }]} />
            </View>
          </Marker>
        ) : null}
        
        {hasDropoff ? (
          <Marker
            coordinate={{ latitude: dropoffLat!, longitude: dropoffLng! }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.customMarker}>
              <View style={[styles.markerPin, { backgroundColor: '#F44336' }]}>
                <Feather name="flag" size={16} color="#fff" />
              </View>
              <View style={[styles.markerStem, { backgroundColor: '#F44336' }]} />
            </View>
          </Marker>
        ) : null}

        {hasDriver ? (
          <Marker
            coordinate={{ latitude: driverLat!, longitude: driverLng! }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.driverMarker}>
              <View style={[styles.driverMarkerInner, { backgroundColor: '#2196F3' }]}>
                <Feather name="truck" size={18} color="#fff" />
              </View>
            </View>
          </Marker>
        ) : null}

        {routePoints && routePoints.length > 0 ? (
          <Polyline
            coordinates={routePoints}
            strokeColor="#2196F3"
            strokeWidth={4}
            lineDashPattern={[0]}
          />
        ) : null}
      </MapView>

      {loading ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : null}
    </View>
  );
}

function JobInfoOverlay({
  trackingNumber,
  pickupAddress,
  deliveryAddress,
  distance,
  duration,
  theme,
  onNavigatePress,
  currentPhase,
  loading,
  hasValidAddress,
}: {
  trackingNumber: string;
  pickupAddress: string;
  deliveryAddress: string;
  distance: string;
  duration: string;
  theme: any;
  onNavigatePress: (type: 'pickup' | 'delivery') => void;
  currentPhase: 'pickup' | 'delivery';
  loading?: boolean;
  hasValidAddress?: boolean;
}) {
  const truncateAddress = (addr: string, maxLen: number = 35) => {
    if (!addr) return 'N/A';
    return addr.length > maxLen ? addr.substring(0, maxLen) + '...' : addr;
  };

  const canNavigate = hasValidAddress && (pickupAddress || deliveryAddress);

  return (
    <View style={[styles.infoOverlay, { backgroundColor: theme.backgroundDefault }]}>
      <View style={styles.infoHeader}>
        <View style={styles.jobIdBadge}>
          <ThemedText style={styles.jobIdText}>Job #{trackingNumber}</ThemedText>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Feather name="navigation" size={14} color={theme.primary} />
            <ThemedText style={[styles.statValue, { color: theme.text }]}>
              {loading ? '...' : distance}
            </ThemedText>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Feather name="clock" size={14} color={theme.primary} />
            <ThemedText style={[styles.statValue, { color: theme.text }]}>
              {loading ? '...' : duration}
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.addressesContainer}>
        <View style={styles.addressRow}>
          <View style={[styles.addressDot, { backgroundColor: '#4CAF50' }]} />
          <View style={styles.addressContent}>
            <ThemedText style={[styles.addressLabel, { color: theme.secondaryText }]}>Pickup</ThemedText>
            <ThemedText style={styles.addressText} numberOfLines={1}>
              {truncateAddress(pickupAddress)}
            </ThemedText>
          </View>
        </View>
        <View style={styles.addressConnector}>
          <View style={[styles.connectorLine, { backgroundColor: theme.backgroundSecondary }]} />
        </View>
        <View style={styles.addressRow}>
          <View style={[styles.addressDot, { backgroundColor: '#F44336' }]} />
          <View style={styles.addressContent}>
            <ThemedText style={[styles.addressLabel, { color: theme.secondaryText }]}>Delivery</ThemedText>
            <ThemedText style={styles.addressText} numberOfLines={1}>
              {truncateAddress(deliveryAddress)}
            </ThemedText>
          </View>
        </View>
      </View>

      <Pressable
        style={[styles.navigateButton, { backgroundColor: canNavigate ? theme.primary : theme.backgroundSecondary }]}
        disabled={!canNavigate}
        onPress={() => onNavigatePress(currentPhase)}
      >
        <Feather name="navigation" size={18} color="#fff" />
        <Text style={styles.navigateButtonText}>
          Start Navigation to {currentPhase === 'pickup' ? 'Pickup' : 'Delivery'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 400,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  mapWrapper: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  webPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  placeholderText: {
    textAlign: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.9)',
    padding: Spacing.sm,
    borderRadius: 20,
  },
  customMarker: {
    alignItems: 'center',
  },
  markerPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerStem: {
    width: 3,
    height: 10,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  driverMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverMarkerInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  jobIdBadge: {
    backgroundColor: 'rgba(33, 150, 243, 0.15)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  jobIdText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 14,
    backgroundColor: '#ddd',
    marginHorizontal: Spacing.sm,
  },
  addressesContainer: {
    marginBottom: Spacing.md,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  addressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: Spacing.sm,
  },
  addressContent: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressText: {
    fontSize: 14,
    fontWeight: '500',
  },
  addressConnector: {
    paddingLeft: 4,
    height: 16,
  },
  connectorLine: {
    width: 2,
    height: '100%',
    marginLeft: 4,
  },
  navigateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  navigateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
