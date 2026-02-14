import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Pressable, Platform, Dimensions, ActivityIndicator, BackHandler, Linking } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || 
                            process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || '';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface NavigationParams {
  destinationLat: number;
  destinationLng: number;
  destinationAddress: string;
  destinationType: 'pickup' | 'delivery';
  jobId: string;
  onNavigationComplete?: () => void;
}

interface RouteInfo {
  distance: string;
  duration: string;
  polylinePoints: Array<{ latitude: number; longitude: number }>;
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

export function InAppNavigationScreen({ route, navigation }: any) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<any>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  const params: NavigationParams = route.params || {};
  const { destinationLat, destinationLng, destinationAddress, destinationType, jobId } = params;

  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [followsUserLocation, setFollowsUserLocation] = useState(true);
  const [arrived, setArrived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<'checking' | 'granted' | 'denied' | 'undetermined'>('checking');
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);

  const ARRIVAL_THRESHOLD_METERS = 50;

  // Validate required params
  const hasValidDestination = typeof destinationLat === 'number' && 
                               typeof destinationLng === 'number' && 
                               !isNaN(destinationLat) && 
                               !isNaN(destinationLng);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleExitNavigation();
      return true;
    });
    return () => backHandler.remove();
  }, []);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const fetchRoute = useCallback(async (originLat: number, originLng: number) => {
    if (!destinationLat || !destinationLng) {
      setLoading(false);
      return;
    }

    try {
      const origin = `${originLat},${originLng}`;
      const destination = `${destinationLat},${destinationLng}`;
      
      let routeFound = false;
      
      if (API_URL) {
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              headers['Authorization'] = `Bearer ${session.access_token}`;
            }
          } catch (e) {
            console.log('[Navigation] Could not get auth token');
          }
          
          const url = `${API_URL}/api/mobile/v1/directions?origin=${origin}&destination=${destination}&mode=driving`;
          console.log('[Navigation] Fetching route from server proxy');
          const response = await fetch(url, { headers });
          
          if (response.ok) {
            const data = await response.json();
            if (data?.routes?.length > 0) {
              const routeData = data.routes[0];
              if (routeData.polyline) {
                setRouteInfo({
                  distance: routeData.distance?.text || '',
                  duration: routeData.duration?.text || '',
                  polylinePoints: decodePolyline(routeData.polyline),
                });
                routeFound = true;
              } else if (routeData.overview_polyline?.points) {
                const leg = routeData.legs?.[0];
                setRouteInfo({
                  distance: leg?.distance?.text || '',
                  duration: leg?.duration?.text || '',
                  polylinePoints: decodePolyline(routeData.overview_polyline.points),
                });
                routeFound = true;
              }
            }
          } else {
            console.log('[Navigation] Server proxy failed:', response.status, await response.text().catch(() => ''));
          }
        } catch (e) {
          console.log('[Navigation] Server proxy error:', e);
        }
      }
      
      if (!routeFound && GOOGLE_MAPS_API_KEY) {
        try {
          const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;
          console.log('[Navigation] Falling back to direct Google Maps API');
          const response = await fetch(url);
          const data = await response.json();
          
          if (data.status === 'OK' && data.routes?.length > 0) {
            const routeData = data.routes[0];
            const leg = routeData.legs[0];
            setRouteInfo({
              distance: leg.distance.text,
              duration: leg.duration.text,
              polylinePoints: decodePolyline(routeData.overview_polyline.points),
            });
            routeFound = true;
          } else {
            console.log('[Navigation] Google Maps API error:', data.status, data.error_message);
          }
        } catch (e) {
          console.log('[Navigation] Google Maps fallback error:', e);
        }
      }
      
      if (!routeFound) {
        setError('Route unavailable');
      }
    } catch (err) {
      console.error('[Navigation] Error fetching route:', err);
      setError('Failed to load route');
    } finally {
      setLoading(false);
    }
  }, [destinationLat, destinationLng]);

  // Check existing permission status on mount - DO NOT request permission yet
  // This complies with Apple App Store Guidelines 5.1.1
  useEffect(() => {
    const checkPermissionAndStart = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        
        if (status === 'granted') {
          setLocationPermissionStatus('granted');
          await startLocationTracking();
        } else if (status === 'denied') {
          setLocationPermissionStatus('denied');
          setLoading(false);
        } else {
          // Permission undetermined - show prompt for user to opt-in
          setLocationPermissionStatus('undetermined');
          setShowPermissionPrompt(true);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error checking permission:', error);
        setLocationPermissionStatus('denied');
        setLoading(false);
      }
    };

    checkPermissionAndStart();

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, []);

  // User-initiated location tracking - only called when user taps "Enable Location" button
  const startLocationTracking = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const driverPos = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setDriverLocation(driverPos);
      setLoading(false);
      fetchRoute(driverPos.latitude, driverPos.longitude);

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 10,
        },
        (newLocation) => {
          const newPos = {
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
          };
          setDriverLocation(newPos);
          
          if (destinationLat && destinationLng) {
            const distanceToDestination = calculateDistance(
              newPos.latitude,
              newPos.longitude,
              destinationLat,
              destinationLng
            );
            
            if (distanceToDestination <= ARRIVAL_THRESHOLD_METERS && !arrived) {
              setArrived(true);
            }
          }
        }
      );
    } catch (error) {
      console.error('Error starting location tracking:', error);
      setLoading(false);
    }
  };

  // Handle user opting in to location permission
  const handleEnableLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationPermissionStatus('granted');
        setShowPermissionPrompt(false);
        setLoading(true);
        await startLocationTracking();
      } else {
        setLocationPermissionStatus('denied');
        setShowPermissionPrompt(false);
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
      setLocationPermissionStatus('denied');
      setShowPermissionPrompt(false);
    }
  };

  useEffect(() => {
    if (driverLocation && !loading) {
      const intervalId = setInterval(() => {
        fetchRoute(driverLocation.latitude, driverLocation.longitude);
      }, 30000);
      
      return () => clearInterval(intervalId);
    }
  }, [driverLocation, loading, fetchRoute]);

  const handleRecenter = () => {
    if (mapRef.current && driverLocation) {
      mapRef.current.animateToRegion({
        ...driverLocation,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
      setFollowsUserLocation(true);
    }
  };

  const handleFitRoute = () => {
    if (mapRef.current && driverLocation && destinationLat && destinationLng) {
      const coordinates = [
        driverLocation,
        { latitude: destinationLat, longitude: destinationLng },
      ];
      
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 100, right: 60, bottom: 250, left: 60 },
        animated: true,
      });
      setFollowsUserLocation(false);
    }
  };

  const handleExitNavigation = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    navigation.goBack();
  };

  const handleArrived = () => {
    if (params.onNavigationComplete) {
      params.onNavigationComplete();
    }
    handleExitNavigation();
  };

  // Show error screen if destination coordinates are missing
  if (!hasValidDestination) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.webPlaceholder}>
          <Feather name="alert-circle" size={48} color={theme.error} />
          <ThemedText type="h3" style={styles.webText}>
            Location Not Available
          </ThemedText>
          <ThemedText type="body" color="secondary" style={styles.webSubtext}>
            The destination coordinates could not be loaded. Please try again or use an external navigation app.
          </ThemedText>
          <Pressable
            style={[styles.webBackButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.goBack()}
          >
            <ThemedText style={styles.webBackButtonText}>Go Back</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.webPlaceholder}>
          <Feather name="map" size={48} color={theme.secondaryText} />
          <ThemedText type="h3" style={styles.webText}>
            Navigation available in mobile app
          </ThemedText>
          <ThemedText type="body" color="secondary" style={styles.webSubtext}>
            Use Expo Go to access in-app navigation
          </ThemedText>
          <Pressable
            style={[styles.webBackButton, { backgroundColor: theme.primary }]}
            onPress={() => navigation.goBack()}
          >
            <ThemedText style={styles.webBackButtonText}>Go Back</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Show permission prompt - user must tap to enable location (Apple Guideline 5.1.1)
  if (showPermissionPrompt) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.webPlaceholder}>
          <Feather name="navigation" size={48} color={theme.primary} />
          <ThemedText type="h3" style={styles.webText}>
            Enable Location for Navigation
          </ThemedText>
          <ThemedText type="body" color="secondary" style={styles.webSubtext}>
            Location access allows us to show your position on the map and provide turn-by-turn directions to {destinationAddress || 'your destination'}.
          </ThemedText>
          <Pressable
            style={[styles.webBackButton, { backgroundColor: theme.primary }]}
            onPress={handleEnableLocation}
          >
            <ThemedText style={styles.webBackButtonText}>Enable Location</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.webBackButton, { backgroundColor: theme.backgroundSecondary, marginTop: Spacing.md }]}
            onPress={() => navigation.goBack()}
          >
            <ThemedText style={[styles.webBackButtonText, { color: theme.text }]}>Go Back</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Show denied state with fallback - user can still see destination address
  if (locationPermissionStatus === 'denied') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.webPlaceholder}>
          <Feather name="map-pin" size={48} color={theme.warning} />
          <ThemedText type="h3" style={styles.webText}>
            Location Access Needed
          </ThemedText>
          <ThemedText type="body" color="secondary" style={styles.webSubtext}>
            Location access improves navigation accuracy. You can enable it anytime in Settings.
          </ThemedText>
          <ThemedText style={[styles.addressDisplay, { color: theme.text, backgroundColor: theme.backgroundSecondary }]}>
            {destinationAddress || 'Destination'}
          </ThemedText>
          <Pressable
            style={[styles.webBackButton, { backgroundColor: theme.primary }]}
            onPress={async () => {
              try {
                await Linking.openSettings();
              } catch (e) {}
            }}
          >
            <ThemedText style={styles.webBackButtonText}>Open Settings</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.webBackButton, { backgroundColor: theme.backgroundSecondary, marginTop: Spacing.md }]}
            onPress={() => navigation.goBack()}
          >
            <ThemedText style={[styles.webBackButtonText, { color: theme.text }]}>Go Back</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const MapView = require('react-native-maps').default;
  const { Marker, Polyline, PROVIDER_GOOGLE } = require('react-native-maps');

  const initialRegion = driverLocation ? {
    ...driverLocation,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  } : {
    latitude: destinationLat || 51.5074,
    longitude: destinationLng || -0.1278,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        showsUserLocation={locationPermissionStatus === 'granted'}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        showsBuildings={false}
        showsTraffic={true}
        showsIndoors={false}
        toolbarEnabled={false}
        followsUserLocation={locationPermissionStatus === 'granted' && followsUserLocation}
        onPanDrag={() => setFollowsUserLocation(false)}
      >
        {destinationLat && destinationLng ? (
          <Marker
            coordinate={{ latitude: destinationLat, longitude: destinationLng }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={styles.customMarker}>
              <View style={[
                styles.markerPin, 
                { backgroundColor: destinationType === 'pickup' ? '#4CAF50' : '#F44336' }
              ]}>
                <Feather 
                  name={destinationType === 'pickup' ? 'package' : 'flag'} 
                  size={18} 
                  color="#fff" 
                />
              </View>
              <View style={[
                styles.markerStem, 
                { backgroundColor: destinationType === 'pickup' ? '#4CAF50' : '#F44336' }
              ]} />
            </View>
          </Marker>
        ) : null}

        {routeInfo && routeInfo.polylinePoints.length > 0 ? (
          <Polyline
            coordinates={routeInfo.polylinePoints}
            strokeColor="#2196F3"
            strokeWidth={5}
            lineDashPattern={[0]}
          />
        ) : null}
      </MapView>

      <SafeAreaView style={styles.overlayContainer} edges={['top']}>
        <Pressable
          style={[styles.exitButton, { backgroundColor: theme.backgroundDefault }]}
          onPress={handleExitNavigation}
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
      </SafeAreaView>

      <View style={[styles.controlsContainer, { right: Spacing.lg }]}>
        <Pressable
          style={[styles.controlButton, { backgroundColor: theme.backgroundDefault }]}
          onPress={handleFitRoute}
        >
          <Feather name="maximize-2" size={22} color={theme.text} />
        </Pressable>
        <Pressable
          style={[styles.controlButton, { backgroundColor: followsUserLocation ? theme.primary : theme.backgroundDefault }]}
          onPress={handleRecenter}
        >
          <Feather name="navigation" size={22} color={followsUserLocation ? '#fff' : theme.text} />
        </Pressable>
      </View>

      <View style={[styles.bottomPanel, { backgroundColor: theme.backgroundDefault, paddingBottom: insets.bottom + Spacing.lg }]}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <ThemedText type="body" color="secondary" style={styles.loadingText}>
              Getting route...
            </ThemedText>
          </View>
        ) : (
          <>
            <View style={styles.destinationInfo}>
              <View style={[
                styles.destinationIcon, 
                { backgroundColor: destinationType === 'pickup' ? '#E8F5E9' : '#FFEBEE' }
              ]}>
                <Feather 
                  name={destinationType === 'pickup' ? 'package' : 'flag'} 
                  size={24} 
                  color={destinationType === 'pickup' ? '#4CAF50' : '#F44336'} 
                />
              </View>
              <View style={styles.destinationDetails}>
                <ThemedText type="caption" color="secondary">
                  {destinationType === 'pickup' ? 'Navigating to Pickup' : 'Navigating to Delivery'}
                </ThemedText>
                <ThemedText type="bodyMedium" numberOfLines={2} style={styles.addressText}>
                  {destinationAddress || 'Unknown address'}
                </ThemedText>
              </View>
            </View>

            {routeInfo ? (
              <View style={styles.etaContainer}>
                <View style={styles.etaItem}>
                  <Feather name="clock" size={18} color={theme.primary} />
                  <ThemedText type="h4" style={[styles.etaValue, { color: theme.primary }]}>
                    {routeInfo.duration}
                  </ThemedText>
                </View>
                <View style={styles.etaDivider} />
                <View style={styles.etaItem}>
                  <Feather name="navigation" size={18} color={theme.secondaryText} />
                  <ThemedText type="body" color="secondary">
                    {routeInfo.distance}
                  </ThemedText>
                </View>
              </View>
            ) : null}

            {arrived ? (
              <Pressable
                style={[styles.arrivedButton, { backgroundColor: '#4CAF50' }]}
                onPress={handleArrived}
              >
                <Feather name="check-circle" size={22} color="#fff" />
                <ThemedText style={styles.arrivedButtonText}>
                  {destinationType === 'pickup' ? "I've Arrived at Pickup" : "I've Arrived at Delivery"}
                </ThemedText>
              </Pressable>
            ) : (
              <View style={styles.navigationHint}>
                <Feather name="info" size={16} color={theme.secondaryText} />
                <ThemedText type="caption" color="secondary" style={styles.hintText}>
                  Follow the route. You'll be notified when you arrive.
                </ThemedText>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  exitButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  controlsContainer: {
    position: 'absolute',
    top: '40%',
    gap: Spacing.sm,
  },
  controlButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
  },
  destinationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  destinationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  destinationDetails: {
    flex: 1,
  },
  addressText: {
    marginTop: 2,
  },
  etaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
    backgroundColor: 'rgba(33, 150, 243, 0.08)',
    borderRadius: BorderRadius.md,
  },
  etaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  etaValue: {
    fontWeight: '700',
  },
  etaDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#ddd',
    marginHorizontal: Spacing.xl,
  },
  arrivedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  arrivedButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  navigationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  hintText: {
    textAlign: 'center',
  },
  customMarker: {
    alignItems: 'center',
  },
  markerPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    height: 12,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  webPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  webText: {
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  webSubtext: {
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  addressDisplay: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    fontSize: 16,
    textAlign: 'center',
  },
  webBackButton: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
  },
  webBackButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
