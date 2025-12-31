import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Pressable, RefreshControl, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Card } from '@/components/Card';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { customerService } from '@/services/customerService';
import { CustomerBooking, BookingStatus } from '@/lib/customer-types';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type TrackedOrder = {
  tracking_number: string;
  status: BookingStatus;
  pickup_postcode: string;
  delivery_postcode: string;
  scheduled_date: string;
};

export function CustomerDashboardScreen() {
  const { theme } = useTheme();
  const { customerProfile, userRole } = useAuth();
  const navigation = useNavigation<any>();
  const [activeBookings, setActiveBookings] = useState<CustomerBooking[]>([]);
  const [recentBookings, setRecentBookings] = useState<CustomerBooking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackedOrder, setTrackedOrder] = useState<TrackedOrder | null>(null);
  const [trackingError, setTrackingError] = useState('');

  const fetchBookings = useCallback(async () => {
    if (!customerProfile) return;
    
    try {
      const [active, recent] = await Promise.all([
        customerService.getActiveBookings(customerProfile.id),
        customerService.getCompletedBookings(customerProfile.id),
      ]);
      setActiveBookings(active);
      setRecentBookings(recent.slice(0, 5));
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }, [customerProfile]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBookings();
    setRefreshing(false);
  };

  const getStatusColor = (status: BookingStatus) => {
    switch (status) {
      case 'delivered': return theme.success;
      case 'in_transit': return theme.primary;
      case 'picked_up': return theme.primary;
      case 'assigned': return theme.warning;
      case 'confirmed': return theme.primaryLight;
      case 'cancelled': return theme.error;
      default: return theme.secondaryText;
    }
  };

  const getStatusLabel = (status: BookingStatus) => {
    switch (status) {
      case 'draft': return 'Draft';
      case 'pending_payment': return 'Pending Payment';
      case 'paid': return 'Paid';
      case 'confirmed': return 'Confirmed';
      case 'assigned': return 'Driver Assigned';
      case 'picked_up': return 'Picked Up';
      case 'in_transit': return 'In Transit';
      case 'delivered': return 'Delivered';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  };

  const searchTracking = async () => {
    const trimmed = trackingNumber.trim().toUpperCase();
    if (!trimmed) {
      setTrackingError('Please enter a booking number');
      return;
    }

    setTrackingLoading(true);
    setTrackingError('');
    setTrackedOrder(null);

    try {
      const { data, error } = await supabase
        .from('customer_bookings')
        .select('tracking_number, status, pickup_postcode, delivery_postcode, scheduled_date')
        .eq('tracking_number', trimmed)
        .single();

      if (error || !data) {
        setTrackingError('No order found with this booking number');
      } else {
        setTrackedOrder(data as TrackedOrder);
      }
    } catch (err) {
      setTrackingError('Unable to find this order');
    } finally {
      setTrackingLoading(false);
    }
  };

  const clearTracking = () => {
    setTrackingNumber('');
    setTrackedOrder(null);
    setTrackingError('');
  };

  const renderBookingCard = (booking: CustomerBooking) => (
    <Pressable
      key={booking.id}
      onPress={() => navigation.navigate('OrderDetail', { bookingId: booking.id })}
    >
      <Card style={styles.bookingCard}>
        <View style={styles.bookingHeader}>
          <ThemedText style={styles.trackingNumber}>
            {booking.tracking_number}
          </ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) + '20' }]}>
            <ThemedText style={[styles.statusText, { color: getStatusColor(booking.status) }]}>
              {getStatusLabel(booking.status)}
            </ThemedText>
          </View>
        </View>
        <View style={styles.addressRow}>
          <Feather name="map-pin" size={14} color={theme.secondaryText} />
          <ThemedText style={styles.addressText} numberOfLines={1}>
            {booking.pickup_postcode} to {booking.delivery_postcode}
          </ThemedText>
        </View>
        <View style={styles.bookingFooter}>
          <ThemedText style={styles.dateText}>
            {new Date(booking.scheduled_date).toLocaleDateString()}
          </ThemedText>
          {booking.price_final ? (
            <ThemedText style={[styles.priceText, { color: theme.primary }]}>
              {'\u00A3'}{booking.price_final.toFixed(2)}
            </ThemedText>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );

  return (
    <ScreenScrollView
      hasTabBar={true}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.welcomeSection}>
        <ThemedText style={styles.greeting}>
          Hello, {customerProfile?.full_name?.split(' ')[0] || 'there'}
        </ThemedText>
        <ThemedText style={[styles.subtitle, { color: theme.secondaryText }]}>
          {userRole === 'business' ? 'Business Account' : 'Personal Account'}
        </ThemedText>
      </View>

      <Pressable
        style={[styles.newBookingButton, { backgroundColor: theme.primary }]}
        onPress={() => navigation.navigate('NewBooking')}
      >
        <Feather name="plus" size={24} color="#fff" />
        <ThemedText style={styles.newBookingText}>Book a Delivery</ThemedText>
      </Pressable>

      <Card style={styles.trackingCard}>
        <ThemedText style={styles.trackingTitle}>Track Your Order</ThemedText>
        <ThemedText style={[styles.trackingSubtitle, { color: theme.secondaryText }]}>
          Enter your booking number to check status
        </ThemedText>
        
        <View style={styles.trackingInputRow}>
          <TextInput
            style={[
              styles.trackingInput,
              { 
                backgroundColor: theme.backgroundSecondary,
                color: theme.text,
                borderColor: trackingError ? theme.error : theme.border,
              }
            ]}
            placeholder="e.g. RC-ABC123"
            placeholderTextColor={theme.secondaryText}
            value={trackingNumber}
            onChangeText={(text) => {
              setTrackingNumber(text.toUpperCase());
              setTrackingError('');
            }}
            autoCapitalize="characters"
            returnKeyType="search"
            onSubmitEditing={searchTracking}
          />
          <Pressable
            style={[styles.trackingButton, { backgroundColor: theme.primary }]}
            onPress={searchTracking}
            disabled={trackingLoading}
          >
            {trackingLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="search" size={20} color="#fff" />
            )}
          </Pressable>
        </View>

        {trackingError ? (
          <ThemedText style={[styles.trackingErrorText, { color: theme.error }]}>
            {trackingError}
          </ThemedText>
        ) : null}

        {trackedOrder ? (
          <View style={[styles.trackedResult, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.trackedResultHeader}>
              <ThemedText style={styles.trackedNumber}>{trackedOrder.tracking_number}</ThemedText>
              <Pressable onPress={clearTracking}>
                <Feather name="x" size={18} color={theme.secondaryText} />
              </Pressable>
            </View>
            <View style={[styles.trackedStatusBadge, { backgroundColor: getStatusColor(trackedOrder.status) + '20' }]}>
              <Feather 
                name={trackedOrder.status === 'delivered' ? 'check-circle' : trackedOrder.status === 'in_transit' ? 'truck' : 'package'} 
                size={16} 
                color={getStatusColor(trackedOrder.status)} 
              />
              <ThemedText style={[styles.trackedStatusText, { color: getStatusColor(trackedOrder.status) }]}>
                {getStatusLabel(trackedOrder.status)}
              </ThemedText>
            </View>
            <View style={styles.trackedRoute}>
              <Feather name="map-pin" size={14} color={theme.secondaryText} />
              <ThemedText style={[styles.trackedRouteText, { color: theme.secondaryText }]}>
                {trackedOrder.pickup_postcode} to {trackedOrder.delivery_postcode}
              </ThemedText>
            </View>
            <ThemedText style={[styles.trackedDate, { color: theme.secondaryText }]}>
              Scheduled: {new Date(trackedOrder.scheduled_date).toLocaleDateString()}
            </ThemedText>
          </View>
        ) : null}
      </Card>

      {activeBookings.length > 0 ? (
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Active Deliveries</ThemedText>
          {activeBookings.map(renderBookingCard)}
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Recent Orders</ThemedText>
          <Pressable onPress={() => navigation.navigate('OrdersTab')}>
            <ThemedText style={[styles.viewAllText, { color: theme.primary }]}>
              View All
            </ThemedText>
          </Pressable>
        </View>
        {recentBookings.length > 0 ? (
          recentBookings.map(renderBookingCard)
        ) : (
          <Card style={styles.emptyCard}>
            <Feather name="package" size={40} color={theme.secondaryText} />
            <ThemedText style={[styles.emptyText, { color: theme.secondaryText }]}>
              No orders yet
            </ThemedText>
            <ThemedText style={[styles.emptySubtext, { color: theme.secondaryText }]}>
              Book your first delivery to get started
            </ThemedText>
          </Card>
        )}
      </View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  welcomeSection: {
    marginBottom: Spacing.xl,
  },
  greeting: {
    ...Typography.h2,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
  },
  newBookingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing['2xl'],
    gap: Spacing.sm,
  },
  newBookingText: {
    ...Typography.button,
    color: '#fff',
  },
  section: {
    marginBottom: Spacing['2xl'],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h4,
    marginBottom: Spacing.md,
  },
  viewAllText: {
    ...Typography.link,
  },
  bookingCard: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  trackingNumber: {
    ...Typography.bodyMedium,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  statusText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  addressText: {
    ...Typography.small,
    flex: 1,
  },
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    ...Typography.caption,
  },
  priceText: {
    ...Typography.bodyMedium,
  },
  emptyCard: {
    padding: Spacing['3xl'],
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyText: {
    ...Typography.h4,
  },
  emptySubtext: {
    ...Typography.body,
    textAlign: 'center',
  },
  trackingCard: {
    padding: Spacing.lg,
    marginBottom: Spacing['2xl'],
  },
  trackingTitle: {
    ...Typography.h4,
    marginBottom: Spacing.xs,
  },
  trackingSubtitle: {
    ...Typography.small,
    marginBottom: Spacing.md,
  },
  trackingInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  trackingInput: {
    flex: 1,
    height: 48,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    ...Typography.body,
  },
  trackingButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackingErrorText: {
    ...Typography.small,
    marginTop: Spacing.sm,
  },
  trackedResult: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  trackedResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  trackedNumber: {
    ...Typography.bodyMedium,
  },
  trackedStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  trackedStatusText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  trackedRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  trackedRouteText: {
    ...Typography.small,
  },
  trackedDate: {
    ...Typography.caption,
  },
});
