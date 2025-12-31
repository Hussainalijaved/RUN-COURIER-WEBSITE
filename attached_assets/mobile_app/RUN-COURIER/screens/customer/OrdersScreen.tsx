import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { ScreenFlatList } from '@/components/ScreenFlatList';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/Card';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { customerService } from '@/services/customerService';
import { CustomerBooking, BookingStatus } from '@/lib/customer-types';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';

type FilterType = 'all' | 'active' | 'completed' | 'cancelled';

export function OrdersScreen() {
  const { theme } = useTheme();
  const { customerProfile, userRole } = useAuth();
  const navigation = useNavigation<any>();
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  const getPaymentBadge = (item: CustomerBooking): { label: string; color: string; icon: string } | null => {
    if (item.status === 'delivered' || item.status === 'cancelled') return null;
    
    if (item.status === 'paid') {
      return { label: 'Paid', color: theme.success, icon: 'check-circle' };
    }
    
    if (item.status === 'pending_payment') {
      return { label: 'Pending Payment', color: theme.warning, icon: 'clock' };
    }
    
    if (item.payment_option === 'pay_later') {
      return { label: 'Pay Later - Weekly Invoice', color: theme.primary, icon: 'file-text' };
    }
    
    return null;
  };

  const handlePayNow = (item: CustomerBooking) => {
    navigation.navigate('Payment', { 
      bookingId: item.id,
      trackingNumber: item.tracking_number,
      amount: item.price_final || item.price_estimate || 0,
      paymentOption: 'pay_now'
    });
  };

  const fetchBookings = useCallback(async () => {
    if (!customerProfile) return;
    
    try {
      let statusFilter: BookingStatus[] | undefined;
      
      switch (filter) {
        case 'active':
          statusFilter = ['confirmed', 'assigned', 'picked_up', 'in_transit'];
          break;
        case 'completed':
          statusFilter = ['delivered'];
          break;
        case 'cancelled':
          statusFilter = ['cancelled'];
          break;
        default:
          statusFilter = undefined;
      }
      
      const data = await customerService.getCustomerBookings(customerProfile.id, statusFilter);
      setBookings(data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  }, [customerProfile, filter]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useFocusEffect(
    useCallback(() => {
      if (customerProfile) {
        fetchBookings();
      }
    }, [fetchBookings, customerProfile])
  );

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
      case 'pending_payment': return theme.warning;
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

  const renderFilterButton = (filterType: FilterType, label: string) => (
    <Pressable
      style={[
        styles.filterButton,
        { 
          backgroundColor: filter === filterType ? theme.primary : theme.backgroundSecondary,
          borderColor: filter === filterType ? theme.primary : theme.border,
        },
      ]}
      onPress={() => setFilter(filterType)}
    >
      <ThemedText style={[styles.filterText, filter === filterType && { color: '#fff' }]}>
        {label}
      </ThemedText>
    </Pressable>
  );

  const renderBookingItem = ({ item }: { item: CustomerBooking }) => {
    const paymentBadge = getPaymentBadge(item);
    const showPayNowButton = item.status === 'pending_payment';
    
    const navigateToDetail = () => {
      navigation.navigate('OrderDetail', { bookingId: item.id });
    };
    
    return (
      <Card style={styles.bookingCard}>
        <Pressable onPress={navigateToDetail}>
          <View style={styles.bookingHeader}>
            <ThemedText style={styles.trackingNumber}>
              {item.tracking_number}
            </ThemedText>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
              <ThemedText style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                {getStatusLabel(item.status)}
              </ThemedText>
            </View>
          </View>
          
          {paymentBadge ? (
            <View style={[styles.paymentBadge, { backgroundColor: paymentBadge.color + '15', borderColor: paymentBadge.color }]}>
              <Feather name={paymentBadge.icon as any} size={14} color={paymentBadge.color} />
              <ThemedText style={[styles.paymentBadgeText, { color: paymentBadge.color }]}>
                {paymentBadge.label}
              </ThemedText>
            </View>
          ) : null}
          
          <View style={styles.addressSection}>
            <View style={styles.addressRow}>
              <View style={[styles.dot, { backgroundColor: theme.success }]} />
              <View style={styles.addressInfo}>
                <ThemedText style={[styles.addressLabel, { color: theme.secondaryText }]}>From</ThemedText>
                <ThemedText style={styles.postcodeText}>{item.pickup_postcode}</ThemedText>
                <ThemedText style={[styles.addressText, { color: theme.secondaryText }]} numberOfLines={1}>{item.pickup_address}</ThemedText>
              </View>
            </View>
            <View style={[styles.addressLine, { backgroundColor: theme.border }]} />
            <View style={styles.addressRow}>
              <View style={[styles.dot, { backgroundColor: theme.error }]} />
              <View style={styles.addressInfo}>
                <ThemedText style={[styles.addressLabel, { color: theme.secondaryText }]}>To</ThemedText>
                <ThemedText style={styles.postcodeText}>{item.delivery_postcode}</ThemedText>
                <ThemedText style={[styles.addressText, { color: theme.secondaryText }]} numberOfLines={1}>{item.delivery_address}</ThemedText>
              </View>
            </View>
          </View>
          
          <View style={styles.bookingFooter}>
            <View style={styles.footerLeft}>
              <Feather name="calendar" size={14} color={theme.secondaryText} />
              <ThemedText style={[styles.dateText, { color: theme.secondaryText }]}>
                {new Date(item.scheduled_date).toLocaleDateString()}
              </ThemedText>
            </View>
            {item.price_final || item.price_estimate ? (
              <ThemedText style={[styles.priceText, { color: theme.primary }]}>
                {'\u00A3'}{(item.price_final || item.price_estimate)?.toFixed(2)}
              </ThemedText>
            ) : null}
          </View>
        </Pressable>
        
        {showPayNowButton ? (
          <Pressable
            style={[styles.payNowButton, { backgroundColor: theme.primary }]}
            onPress={() => handlePayNow(item)}
          >
            <Feather name="credit-card" size={16} color="#fff" />
            <ThemedText style={styles.payNowButtonText}>Pay Now</ThemedText>
          </Pressable>
        ) : null}
      </Card>
    );
  };

  const ListHeader = () => (
    <View style={styles.filterContainer}>
      {renderFilterButton('all', 'All')}
      {renderFilterButton('active', 'Active')}
      {renderFilterButton('completed', 'Completed')}
      {renderFilterButton('cancelled', 'Cancelled')}
    </View>
  );

  const ListEmpty = () => (
    <Card style={styles.emptyCard}>
      <Feather name="package" size={48} color={theme.secondaryText} />
      <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>No orders found</ThemedText>
      <ThemedText style={[styles.emptyText, { color: theme.secondaryText }]}>
        {filter === 'all' 
          ? 'Book your first delivery to get started'
          : `No ${filter} orders to display`
        }
      </ThemedText>
      {filter === 'all' ? (
        <Pressable
          style={[styles.newBookingButton, { backgroundColor: theme.primary }]}
          onPress={() => navigation.navigate('HomeTab', { screen: 'NewBooking' })}
        >
          <ThemedText style={styles.newBookingText}>Book a Delivery</ThemedText>
        </Pressable>
      ) : null}
    </Card>
  );

  return (
    <ScreenFlatList
      hasTabBar={true}
      data={bookings}
      keyExtractor={(item) => item.id}
      renderItem={renderBookingItem}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={ListEmpty}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={bookings.length === 0 ? styles.emptyContainer : undefined}
    />
  );
}

const styles = StyleSheet.create({
  filterContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    flexWrap: 'wrap',
  },
  filterButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  filterText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  bookingCard: {
    marginBottom: Spacing.md,
    padding: Spacing.lg,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
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
  addressSection: {
    marginBottom: Spacing.md,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    height: 20,
    marginLeft: 5,
    marginVertical: Spacing.xs,
  },
  addressInfo: {
    flex: 1,
  },
  addressLabel: {
    ...Typography.caption,
  },
  addressText: {
    ...Typography.body,
  },
  postcodeText: {
    ...Typography.caption,
  },
  bookingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dateText: {
    ...Typography.caption,
  },
  priceText: {
    ...Typography.bodyMedium,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyCard: {
    padding: Spacing['3xl'],
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing['2xl'],
  },
  emptyTitle: {
    ...Typography.h4,
  },
  emptyText: {
    ...Typography.body,
    textAlign: 'center',
  },
  newBookingButton: {
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  newBookingText: {
    ...Typography.button,
    color: '#fff',
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginBottom: Spacing.md,
    alignSelf: 'flex-start',
  },
  paymentBadgeText: {
    ...Typography.caption,
    fontWeight: '600',
  },
  payNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  payNowButtonText: {
    ...Typography.button,
    color: '#fff',
  },
});
