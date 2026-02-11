import React, { useRef, useEffect, useState, memo } from 'react';
import { View, StyleSheet, Platform, Image, ActivityIndicator } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Location from 'expo-location';

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || 
                            process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || '';

// FREEZE PREVENTION: Timeout for location and API calls
// ALWAYS resolves - never rejects - to prevent UI freezes
const LOCATION_TIMEOUT_MS = 3000;
const API_TIMEOUT_MS = 5000;

// Safe timeout wrapper that ALWAYS resolves (never throws)
const safeTimeout = async <T,>(
  promise: Promise<T>, 
  timeoutMs: number,
  fallback: T
): Promise<T> => {
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]);
  } catch (error) {
    console.warn('[MapPreview] Operation timed out, using fallback');
    return fallback;
  }
};

interface JobOfferMapPreviewProps {
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  staticMapUrl?: string | null;
}

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

export function JobOfferMapPreview({ 
  pickupLat, 
  pickupLng, 
  dropoffLat, 
  dropoffLng,
  staticMapUrl,
}: JobOfferMapPreviewProps) {
  const { theme } = useTheme();
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  const hasPickup = typeof pickupLat === 'number' && typeof pickupLng === 'number' && !isNaN(pickupLat) && !isNaN(pickupLng);
  const hasDropoff = typeof dropoffLat === 'number' && typeof dropoffLng === 'number' && !isNaN(dropoffLat) && !isNaN(dropoffLng);
  const hasAnyCoords = hasPickup || hasDropoff;

  useEffect(() => {
    if (Platform.OS !== 'web') {
      getDriverLocation();
    }
  }, []);

  const getDriverLocation = async () => {
    const permResult = await safeTimeout(
      Location.getForegroundPermissionsAsync(),
      LOCATION_TIMEOUT_MS,
      { status: 'denied' as const, granted: false, canAskAgain: false, expires: 'never' as const }
    );
    if (permResult.status !== 'granted') return;
    
    const location = await safeTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      LOCATION_TIMEOUT_MS,
      null as any
    );
    
    if (location) {
      setDriverLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    }
  };

  if (Platform.OS === 'web') {
    if (staticMapUrl) {
      return (
        <View style={[styles.mapContainer, { backgroundColor: theme.backgroundSecondary }]}>
          <Image source={{ uri: staticMapUrl }} style={styles.map} resizeMode="cover" />
          <View style={styles.mapLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
              <ThemedText type="caption" color="secondary">Pickup</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F44336' }]} />
              <ThemedText type="caption" color="secondary">Delivery</ThemedText>
            </View>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.noMapContainer, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name="map" size={24} color={theme.secondaryText} />
        <ThemedText type="small" color="secondary">Map preview available in app</ThemedText>
      </View>
    );
  }

  if (!hasAnyCoords) {
    if (staticMapUrl) {
      return (
        <View style={[styles.mapContainer, { backgroundColor: theme.backgroundSecondary }]}>
          <Image source={{ uri: staticMapUrl }} style={styles.map} resizeMode="cover" />
          <View style={styles.mapLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
              <ThemedText type="caption" color="secondary">Pickup</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F44336' }]} />
              <ThemedText type="caption" color="secondary">Delivery</ThemedText>
            </View>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.noMapContainer, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name="map" size={24} color={theme.secondaryText} />
        <ThemedText type="small" color="secondary">Map preview unavailable</ThemedText>
      </View>
    );
  }

  return (
    <NativeMapPreview
      pickupLat={pickupLat}
      pickupLng={pickupLng}
      dropoffLat={dropoffLat}
      dropoffLng={dropoffLng}
      driverLocation={driverLocation}
      hasPickup={hasPickup}
      hasDropoff={hasDropoff}
      theme={theme}
      staticMapUrl={staticMapUrl}
    />
  );
}

function NativeMapPreview({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  driverLocation,
  hasPickup,
  hasDropoff,
  theme,
  staticMapUrl,
}: {
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  driverLocation: { latitude: number; longitude: number } | null;
  hasPickup: boolean;
  hasDropoff: boolean;
  theme: any;
  staticMapUrl?: string | null;
}) {
  let MapView: any;
  let Marker: any;
  let Polyline: any;
  let PROVIDER_GOOGLE: any;
  let mapAvailable = false;
  
  try {
    const maps = require('react-native-maps');
    MapView = maps.default;
    Marker = maps.Marker;
    Polyline = maps.Polyline;
    PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
    mapAvailable = true;
  } catch (e) {
    console.log('[MapPreview] react-native-maps not available, using static map fallback');
    mapAvailable = false;
  }

  const mapRef = useRef<any>(null);
  const [routePoints, setRoutePoints] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (hasPickup && hasDropoff) {
      fetchRoute();
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, hasPickup, hasDropoff]);

  const fetchRoute = async () => {
    if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) return;
    
    try {
      const origin = `${pickupLat},${pickupLng}`;
      const destination = `${dropoffLat},${dropoffLng}`;
      
      let url: string;
      if (API_URL) {
        url = `${API_URL}/api/mobile/v1/directions?origin=${origin}&destination=${destination}&mode=driving`;
      } else if (GOOGLE_MAPS_API_KEY) {
        url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;
      } else {
        console.log('[MapPreview] No API URL or Maps key available for directions');
        return;
      }
      
      const headers: any = { 'Content-Type': 'application/json' };
      if (API_URL) {
        try {
          const { supabase: sb } = require('@/lib/supabase');
          const { data: { session } } = await sb.auth.getSession();
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
          }
        } catch (e) {
          console.log('[MapPreview] Could not get auth token for directions API');
        }
      }
      
      const response = await safeTimeout(fetch(url, { headers }), API_TIMEOUT_MS, null as any);
      if (!response) return;
      const data = await response.json();

      if (API_URL && data?.routes?.length > 0) {
        const route = data.routes[0];
        if (route.polyline) {
          setRoutePoints(decodePolyline(route.polyline));
        }
        if (route.distance?.text && route.duration?.text) {
          setRouteInfo({
            distance: route.distance.text,
            duration: route.duration.text,
          });
        }
      } else if (data?.status === 'OK' && data?.routes?.length > 0) {
        const route = data.routes[0];
        const leg = route?.legs?.[0];
        const polylineEncoded = route?.overview_polyline?.points;
        
        if (polylineEncoded) {
          setRoutePoints(decodePolyline(polylineEncoded));
        }
        if (leg?.distance?.text && leg?.duration?.text) {
          setRouteInfo({
            distance: leg.distance.text,
            duration: leg.duration.text,
          });
        }
      }
    } catch (err) {
      console.log('[MapPreview] Error fetching route (non-blocking):', err);
    }
  };

  if (!mapAvailable || mapError) {
    if (staticMapUrl) {
      return (
        <View style={[styles.mapContainer, { backgroundColor: theme.backgroundSecondary }]}>
          <Image source={{ uri: staticMapUrl }} style={styles.map} resizeMode="cover" />
          <View style={styles.mapLegend}>
            {driverLocation ? (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#2196F3' }]} />
                <ThemedText type="caption" color="secondary">You</ThemedText>
              </View>
            ) : null}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
              <ThemedText type="caption" color="secondary">Pickup</ThemedText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F44336' }]} />
              <ThemedText type="caption" color="secondary">Delivery</ThemedText>
            </View>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.noMapContainer, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name="map" size={24} color={theme.secondaryText} />
        <ThemedText type="small" color="secondary">Map preview unavailable</ThemedText>
      </View>
    );
  }

  useEffect(() => {
    if (mapRef.current) {
      const coordinates: Array<{ latitude: number; longitude: number }> = [];
      
      if (hasPickup && pickupLat && pickupLng) {
        coordinates.push({ latitude: pickupLat, longitude: pickupLng });
      }
      if (hasDropoff && dropoffLat && dropoffLng) {
        coordinates.push({ latitude: dropoffLat, longitude: dropoffLng });
      }
      if (driverLocation) {
        coordinates.push(driverLocation);
      }
      
      if (coordinates.length >= 2) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(coordinates, {
            edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
            animated: false,
          });
        }, 100);
      }
    }
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, driverLocation, hasPickup, hasDropoff]);

  const initialRegion = driverLocation 
    ? {
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      }
    : hasPickup 
    ? {
        latitude: pickupLat!,
        longitude: pickupLng!,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : {
        latitude: dropoffLat!,
        longitude: dropoffLng!,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  return (
    <View style={[styles.mapContainer, { backgroundColor: theme.backgroundSecondary }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        liteMode={Platform.OS === 'android'}
        onMapReady={() => console.log('[MapPreview] Map ready')}
        onError={(e: any) => {
          console.log('[MapPreview] Map error, falling back to static map:', e);
          setMapError(true);
        }}
      >
        {driverLocation ? (
          <Marker
            coordinate={driverLocation}
            title="Your Location"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.driverMarker}>
              <View style={styles.driverMarkerInner}>
                <Feather name="navigation" size={14} color="#fff" />
              </View>
            </View>
          </Marker>
        ) : null}
        {hasPickup ? (
          <Marker
            coordinate={{ latitude: pickupLat!, longitude: pickupLng! }}
            title="Pickup"
            pinColor="#4CAF50"
          />
        ) : null}
        {hasDropoff ? (
          <Marker
            coordinate={{ latitude: dropoffLat!, longitude: dropoffLng! }}
            title="Delivery"
            pinColor="#F44336"
          />
        ) : null}
        {routePoints.length > 0 ? (
          <Polyline
            coordinates={routePoints}
            strokeColor="#2196F3"
            strokeWidth={3}
          />
        ) : null}
      </MapView>
      <View style={styles.mapLegend}>
        {driverLocation ? (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#2196F3' }]} />
            <ThemedText type="caption" color="secondary">You</ThemedText>
          </View>
        ) : null}
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
          <ThemedText type="caption" color="secondary">Pickup</ThemedText>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F44336' }]} />
          <ThemedText type="caption" color="secondary">Delivery</ThemedText>
        </View>
        {routeInfo ? (
          <View style={styles.legendItem}>
            <Feather name="clock" size={10} color={theme.secondaryText} />
            <ThemedText type="caption" color="secondary">{routeInfo.duration}</ThemedText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: 180,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  map: {
    flex: 1,
  },
  noMapContainer: {
    height: 80,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  mapLegend: {
    position: 'absolute',
    bottom: Spacing.xs,
    left: Spacing.xs,
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  driverMarker: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverMarkerInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
});
