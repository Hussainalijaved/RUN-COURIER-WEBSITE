import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Pressable, Platform, Linking, Alert, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/Card';
import { useTheme } from '@/hooks/useTheme';
import { customerService } from '@/services/customerService';
import { CustomerBooking, BookingStatus } from '@/lib/customer-types';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
let PROVIDER_GOOGLE: any = null;

if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
  Polyline = Maps.Polyline;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = 250;

type DriverLocation = {
  latitude: number;
  longitude: number;
  updated_at: string;
};

export function TrackingScreen() {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const navigation = useNavigation();
  const mapRef = useRef<any>(null);
  const [booking, setBooking] = useState<CustomerBooking | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const bookingId = route.params?.bookingId;

  useEffect(() => {
    if (bookingId) {
      fetchBookingData();
      
      const bookingSubscription = customerService.subscribeToBookingUpdates(bookingId, (updatedBooking) => {
        setBooking(updatedBooking);
      });

      return () => {
        bookingSubscription.unsubscribe();
      };
    }
  }, [bookingId]);

  useEffect(() => {
    if (booking?.driver_job_id) {
      fetchDriverLocation();
      
      const channel = supabase
        .channel(`driver-location-${booking.driver_job_id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `id=eq.${booking.driver_job_id}`,
        }, (payload: any) => {
          if (payload.new?.current_latitude && payload.new?.current_longitude) {
            const newLocation = {
              latitude: payload.new.current_latitude,
              longitude: payload.new.current_longitude,
              updated_at: payload.new.location_updated_at || new Date().toISOString(),
            };
            setDriverLocation(newLocation);
            setLastUpdate(new Date());
            animateToLocation(newLocation);
          }
        })
        .subscribe();

      const interval = setInterval(fetchDriverLocation, 15000);

      return () => {
        channel.unsubscribe();
        clearInterval(interval);
      };
    }
  }, [booking?.driver_job_id]);

  const animateToLocation = (location: DriverLocation) => {
    if (mapRef.current && location) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  };

  const fetchBookingData = async () => {
    try {
      const data = await customerService.getBookingById(bookingId);
      setBooking(data);
    } catch (error) {
      console.error('Error fetching booking:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDriverLocation = useCallback(async () => {
    if (!booking?.driver_job_id) return;
    
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('current_latitude, current_longitude, location_updated_at')
        .eq('id', booking.driver_job_id)
        .single();
      
      if (data && data.current_latitude && data.current_longitude) {
        const newLocation = {
          latitude: data.current_latitude,
          longitude: data.current_longitude,
          updated_at: data.location_updated_at || new Date().toISOString(),
        };
        setDriverLocation(newLocation);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Error fetching driver location:', error);
    }
  }, [booking?.driver_job_id]);

  const getStatusColor = (status: BookingStatus) => {
    switch (status) {
      case 'delivered': return theme.success;
      case 'in_transit': return theme.primary;
      case 'picked_up': return theme.primary;
      case 'assigned': return theme.warning;
      default: return theme.secondaryText;
    }
  };

  const getStatusLabel = (status: BookingStatus) => {
    switch (status) {
      case 'assigned': return 'Driver Assigned';
      case 'picked_up': return 'Parcel Picked Up';
      case 'in_transit': return 'On the Way';
      case 'delivered': return 'Delivered';
      default: return status;
    }
  };

  const getStatusDescription = (status: BookingStatus) => {
    switch (status) {
      case 'assigned':
        return 'A driver has been assigned to your delivery and will pick up the parcel soon.';
      case 'picked_up':
        return 'The driver has collected your parcel and is preparing to start the delivery.';
      case 'in_transit':
        return 'Your parcel is on its way to the delivery address.';
      case 'delivered':
        return 'Your parcel has been successfully delivered.';
      default:
        return '';
    }
  };

  const getProgressSteps = () => {
    const steps = [
      { key: 'assigned', label: 'Assigned', icon: 'user-check' as const },
      { key: 'picked_up', label: 'Picked Up', icon: 'package' as const },
      { key: 'in_transit', label: 'In Transit', icon: 'truck' as const },
      { key: 'delivered', label: 'Delivered', icon: 'check-circle' as const },
    ];
    
    const statusOrder = ['assigned', 'picked_up', 'in_transit', 'delivered'];
    const currentIndex = statusOrder.indexOf(booking?.status || '');
    
    return steps.map((step, index) => ({
      ...step,
      completed: index <= currentIndex,
      current: step.key === booking?.status,
    }));
  };

  const openInMaps = () => {
    if (!driverLocation) {
      Alert.alert('Location Unavailable', 'Driver location is not available yet.');
      return;
    }

    const { latitude, longitude } = driverLocation;
    const label = 'Driver Location';

    const urls = Platform.select({
      ios: {
        google: `comgooglemaps://?q=${latitude},${longitude}`,
        apple: `maps://maps.apple.com/?ll=${latitude},${longitude}&q=${label}`,
      },
      android: {
        google: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${label})`,
      },
      default: {
        google: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      },
    });

    const url = urls?.google || `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    
    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
      }
    });
  };

  const formatTime = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const formatRelativeTime = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 120) return '1 minute ago';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    return formatTime(date);
  };

  const getMapRegion = () => {
    if (driverLocation) {
      return {
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    
    if (booking?.delivery_lat && booking?.delivery_lng) {
      return {
        latitude: booking.delivery_lat,
        longitude: booking.delivery_lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    
    return {
      latitude: 51.5074,
      longitude: -0.1278,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
  };

  const renderMap = () => {
    if (Platform.OS === 'web') {
      return (
        <View style={[styles.mapPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="map" size={48} color={theme.secondaryText} />
          <ThemedText style={[styles.mapPlaceholderText, { color: theme.secondaryText }]}>
            {driverLocation ? 'Driver is being tracked' : 'Waiting for driver location...'}
          </ThemedText>
          {driverLocation ? (
            <ThemedText style={[styles.coordinatesText, { color: theme.secondaryText }]}>
              {driverLocation.latitude.toFixed(6)}, {driverLocation.longitude.toFixed(6)}
            </ThemedText>
          ) : null}
        </View>
      );
    }

    return (
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={getMapRegion()}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          zoomEnabled={true}
          scrollEnabled={true}
        >
          {driverLocation ? (
            <Marker
              coordinate={{
                latitude: driverLocation.latitude,
                longitude: driverLocation.longitude,
              }}
              title="Driver"
              description="Current driver location"
            >
              <View style={[styles.driverMarker, { backgroundColor: theme.primary }]}>
                <Feather name="truck" size={16} color="#fff" />
              </View>
            </Marker>
          ) : null}

          {booking?.pickup_lat && booking?.pickup_lng ? (
            <Marker
              coordinate={{
                latitude: booking.pickup_lat,
                longitude: booking.pickup_lng,
              }}
              title="Pickup"
              description={booking.pickup_address}
              pinColor="green"
            />
          ) : null}

          {booking?.delivery_lat && booking?.delivery_lng ? (
            <Marker
              coordinate={{
                latitude: booking.delivery_lat,
                longitude: booking.delivery_lng,
              }}
              title="Delivery"
              description={booking.delivery_address}
              pinColor="red"
            />
          ) : null}

          {driverLocation && booking?.delivery_lat && booking?.delivery_lng ? (
            <Polyline
              coordinates={[
                { latitude: driverLocation.latitude, longitude: driverLocation.longitude },
                { latitude: booking.delivery_lat, longitude: booking.delivery_lng },
              ]}
              strokeColor={theme.primary}
              strokeWidth={3}
              lineDashPattern={[5, 5]}
            />
          ) : null}
        </MapView>

        <Pressable
          style={[styles.recenterButton, { backgroundColor: theme.backgroundRoot }]}
          onPress={() => driverLocation && animateToLocation(driverLocation)}
        >
          <Feather name="crosshair" size={20} color={theme.primary} />
        </Pressable>
      </View>
    );
  };

  if (loading) {
    return (
      <ScreenScrollView hasTabBar={true}>
        <View style={styles.loadingContainer}>
          <ThemedText style={{ color: theme.secondaryText }}>Loading tracking info...</ThemedText>
        </View>
      </ScreenScrollView>
    );
  }

  if (!booking) {
    return (
      <ScreenScrollView hasTabBar={true}>
        <View style={styles.loadingContainer}>
          <ThemedText style={{ color: theme.secondaryText }}>Booking not found</ThemedText>
        </View>
      </ScreenScrollView>
    );
  }

  const isActive = ['assigned', 'picked_up', 'in_transit'].includes(booking.status);
  const progressSteps = getProgressSteps();

  return (
    <ScreenScrollView hasTabBar={true}>
      <Card style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View style={[styles.statusIcon, { backgroundColor: getStatusColor(booking.status) + '20' }]}>
            <Feather 
              name={booking.status === 'in_transit' ? 'truck' : booking.status === 'delivered' ? 'check-circle' : 'package'} 
              size={32} 
              color={getStatusColor(booking.status)} 
            />
          </View>
          <View style={styles.statusInfo}>
            <ThemedText style={styles.statusLabel}>{getStatusLabel(booking.status)}</ThemedText>
            <ThemedText style={[styles.trackingNumber, { color: theme.secondaryText }]}>
              {booking.tracking_number}
            </ThemedText>
          </View>
        </View>
        
        <ThemedText style={[styles.statusDescription, { color: theme.secondaryText }]}>
          {getStatusDescription(booking.status)}
        </ThemedText>
      </Card>

      <Card style={styles.progressCard}>
        <ThemedText style={styles.sectionTitle}>Delivery Progress</ThemedText>
        
        <View style={styles.progressContainer}>
          {progressSteps.map((step, index) => (
            <View key={step.key} style={styles.progressStep}>
              <View style={styles.progressIconContainer}>
                <View 
                  style={[
                    styles.progressIcon, 
                    { 
                      backgroundColor: step.completed ? theme.primary : theme.backgroundSecondary,
                      borderColor: step.current ? theme.primary : 'transparent',
                      borderWidth: step.current ? 2 : 0,
                    }
                  ]}
                >
                  <Feather 
                    name={step.icon} 
                    size={16} 
                    color={step.completed ? '#fff' : theme.secondaryText} 
                  />
                </View>
                {index < progressSteps.length - 1 ? (
                  <View 
                    style={[
                      styles.progressLine, 
                      { backgroundColor: step.completed && progressSteps[index + 1].completed ? theme.primary : theme.border }
                    ]} 
                  />
                ) : null}
              </View>
              <ThemedText 
                style={[
                  styles.progressLabel, 
                  { color: step.completed ? theme.text : theme.secondaryText }
                ]}
              >
                {step.label}
              </ThemedText>
            </View>
          ))}
        </View>
      </Card>

      {isActive ? (
        <Card style={styles.locationCard}>
          <View style={styles.locationHeader}>
            <ThemedText style={styles.sectionTitle}>Driver Location</ThemedText>
            {lastUpdate ? (
              <ThemedText style={[styles.lastUpdate, { color: theme.secondaryText }]}>
                Updated {formatRelativeTime(lastUpdate)}
              </ThemedText>
            ) : null}
          </View>

          {renderMap()}

          {driverLocation ? (
            <Pressable
              style={[styles.mapButton, { backgroundColor: theme.primary }]}
              onPress={openInMaps}
            >
              <Feather name="navigation" size={20} color="#fff" />
              <ThemedText style={styles.mapButtonText}>Open in Maps</ThemedText>
            </Pressable>
          ) : (
            <View style={styles.waitingContainer}>
              <Feather name="loader" size={20} color={theme.secondaryText} />
              <ThemedText style={[styles.waitingText, { color: theme.secondaryText }]}>
                Waiting for driver to start tracking...
              </ThemedText>
            </View>
          )}
        </Card>
      ) : null}

      <Card style={styles.addressCard}>
        <ThemedText style={styles.sectionTitle}>Delivery Route</ThemedText>
        
        <View style={styles.addressSection}>
          <View style={styles.addressRow}>
            <View style={[styles.dot, { backgroundColor: theme.success }]} />
            <View style={styles.addressInfo}>
              <ThemedText style={[styles.addressLabel, { color: theme.secondaryText }]}>From</ThemedText>
              <ThemedText style={styles.postcodeText}>{booking.pickup_postcode}</ThemedText>
              <ThemedText style={[styles.addressText, { color: theme.secondaryText }]}>{booking.pickup_address}</ThemedText>
            </View>
          </View>
          
          <View style={[styles.addressLine, { backgroundColor: theme.border }]} />
          
          <View style={styles.addressRow}>
            <View style={[styles.dot, { backgroundColor: theme.primary }]} />
            <View style={styles.addressInfo}>
              <ThemedText style={[styles.addressLabel, { color: theme.secondaryText }]}>To</ThemedText>
              <ThemedText style={styles.postcodeText}>{booking.delivery_postcode}</ThemedText>
              <ThemedText style={[styles.addressText, { color: theme.secondaryText }]}>{booking.delivery_address}</ThemedText>
            </View>
          </View>
        </View>
      </Card>

      {booking.status === 'delivered' ? (
        <Card style={styles.deliveredCard}>
          <View style={styles.deliveredHeader}>
            <Feather name="check-circle" size={48} color={theme.success} />
            <ThemedText style={[styles.deliveredTitle, { color: theme.success }]}>
              Delivery Complete
            </ThemedText>
          </View>
          {booking.delivered_at ? (
            <ThemedText style={[styles.deliveredTime, { color: theme.secondaryText }]}>
              Delivered at {new Date(booking.delivered_at).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </ThemedText>
          ) : null}
        </Card>
      ) : null}
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  statusCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statusIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    ...Typography.h3,
    marginBottom: Spacing.xs,
  },
  trackingNumber: {
    ...Typography.caption,
  },
  statusDescription: {
    ...Typography.body,
    lineHeight: 22,
  },
  progressCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h4,
    marginBottom: Spacing.lg,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressStep: {
    alignItems: 'center',
    flex: 1,
  },
  progressIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  progressIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressLine: {
    height: 2,
    flex: 1,
    marginHorizontal: -4,
  },
  progressLabel: {
    ...Typography.caption,
    textAlign: 'center',
  },
  locationCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  lastUpdate: {
    ...Typography.caption,
  },
  mapContainer: {
    height: MAP_HEIGHT,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapPlaceholder: {
    height: MAP_HEIGHT,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  mapPlaceholderText: {
    ...Typography.bodyMedium,
    marginTop: Spacing.sm,
  },
  coordinatesText: {
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
  driverMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  recenterButton: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
  },
  mapButtonText: {
    ...Typography.button,
    color: '#fff',
  },
  waitingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  waitingText: {
    ...Typography.body,
  },
  addressCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  addressSection: {
    marginBottom: Spacing.md,
  },
  addressRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  addressLine: {
    width: 2,
    height: 30,
    marginLeft: 5,
    marginVertical: Spacing.sm,
  },
  addressInfo: {
    flex: 1,
  },
  addressLabel: {
    ...Typography.caption,
    marginBottom: Spacing.xs,
  },
  addressText: {
    ...Typography.body,
  },
  postcodeText: {
    ...Typography.caption,
  },
  deliveredCard: {
    padding: Spacing.xl,
    marginBottom: Spacing['3xl'],
    alignItems: 'center',
  },
  deliveredHeader: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  deliveredTitle: {
    ...Typography.h3,
    marginTop: Spacing.md,
  },
  deliveredTime: {
    ...Typography.body,
  },
});
