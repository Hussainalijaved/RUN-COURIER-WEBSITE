import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, Alert, Linking, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/Card';
import { useTheme } from '@/hooks/useTheme';
import { customerService } from '@/services/customerService';
import { CustomerBooking, BookingStatus } from '@/lib/customer-types';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';

export function OrderDetailScreen() {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const [booking, setBooking] = useState<CustomerBooking | null>(null);
  const [loading, setLoading] = useState(true);

  const bookingId = route.params?.bookingId;

  useEffect(() => {
    if (bookingId) {
      fetchBooking();
      const subscription = customerService.subscribeToBookingUpdates(bookingId, (updatedBooking) => {
        setBooking(updatedBooking);
      });
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [bookingId]);

  const fetchBooking = async () => {
    try {
      const data = await customerService.getBookingById(bookingId);
      setBooking(data);
    } catch (error) {
      console.error('Error fetching booking:', error);
    } finally {
      setLoading(false);
    }
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

  const handleCancelBooking = async () => {
    if (!booking) return;
    
    const deletableStatuses: BookingStatus[] = ['draft', 'pending_payment', 'paid', 'confirmed', 'cancelled'];
    if (!deletableStatuses.includes(booking.status)) {
      if (Platform.OS === 'web') {
        window.alert('This order can no longer be deleted as it is already in progress or delivered.');
      } else {
        Alert.alert('Cannot Delete', 'This order can no longer be deleted as it is already in progress or delivered.');
      }
      return;
    }

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to cancel and delete this order? This action cannot be undone.');
      if (confirmed) {
        const success = await customerService.deleteBooking(booking.id);
        if (success) {
          window.alert('Your order has been deleted.');
          navigation.goBack();
        } else {
          window.alert('Failed to delete order');
        }
      }
    } else {
      Alert.alert(
        'Delete Order',
        'Are you sure you want to cancel and delete this order? This action cannot be undone.',
        [
          { text: 'No', style: 'cancel' },
          { 
            text: 'Yes, Delete', 
            style: 'destructive',
            onPress: async () => {
              const success = await customerService.deleteBooking(booking.id);
              if (success) {
                Alert.alert('Order Deleted', 'Your order has been deleted.');
                navigation.goBack();
              } else {
                Alert.alert('Error', 'Failed to delete order');
              }
            }
          },
        ]
      );
    }
  };

  const handleTrackDelivery = () => {
    navigation.navigate('Tracking', { bookingId });
  };

  const handlePayNow = () => {
    if (!booking) return;
    navigation.navigate('Payment', { 
      bookingId: booking.id,
      trackingNumber: booking.tracking_number,
      amount: booking.price_final || booking.price_estimate || 0,
      paymentOption: 'pay_now'
    });
  };

  const getPaymentBadge = (): { label: string; color: string; icon: string } | null => {
    if (!booking) return null;
    if (booking.status === 'delivered' || booking.status === 'cancelled') return null;
    
    if (booking.status === 'paid') {
      return { label: 'Paid', color: theme.success, icon: 'check-circle' };
    }
    
    if (booking.status === 'pending_payment') {
      return { label: 'Pending Payment', color: theme.warning, icon: 'clock' };
    }
    
    if (booking.payment_option === 'pay_later') {
      return { label: 'Pay Later - Weekly Invoice', color: theme.primary, icon: 'file-text' };
    }
    
    return null;
  };

  if (loading || !booking) {
    return (
      <ScreenScrollView hasTabBar={true}>
        <View style={styles.loadingContainer}>
          <ThemedText style={{ color: theme.secondaryText }}>Loading...</ThemedText>
        </View>
      </ScreenScrollView>
    );
  }

  const isDelivered = booking.status === 'delivered';
  const isActive = ['assigned', 'picked_up', 'in_transit'].includes(booking.status);

  return (
    <ScreenScrollView hasTabBar={true}>
      <Card style={styles.headerCard}>
        <View style={styles.trackingRow}>
          <ThemedText style={styles.trackingNumber}>{booking.tracking_number}</ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) + '20' }]}>
            <ThemedText style={[styles.statusText, { color: getStatusColor(booking.status) }]}>
              {getStatusLabel(booking.status)}
            </ThemedText>
          </View>
        </View>
        
        {(() => {
          const paymentBadge = getPaymentBadge();
          return paymentBadge ? (
            <View style={[styles.paymentBadge, { backgroundColor: paymentBadge.color + '15', borderColor: paymentBadge.color }]}>
              <Feather name={paymentBadge.icon as any} size={14} color={paymentBadge.color} />
              <ThemedText style={[styles.paymentBadgeText, { color: paymentBadge.color }]}>
                {paymentBadge.label}
              </ThemedText>
            </View>
          ) : null;
        })()}
        
        {booking.status === 'pending_payment' ? (
          <Pressable
            style={[styles.payNowButton, { backgroundColor: theme.primary }]}
            onPress={handlePayNow}
          >
            <Feather name="credit-card" size={20} color="#fff" />
            <ThemedText style={styles.payNowButtonText}>Pay Now</ThemedText>
          </Pressable>
        ) : isActive ? (
          <Pressable
            style={[styles.trackButton, { backgroundColor: theme.primary }]}
            onPress={handleTrackDelivery}
          >
            <Feather name="map-pin" size={20} color="#fff" />
            <ThemedText style={styles.trackButtonText}>Track Delivery</ThemedText>
          </Pressable>
        ) : null}
      </Card>

      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Delivery Details</ThemedText>
        
        <View style={styles.addressSection}>
          <View style={styles.addressRow}>
            <View style={[styles.dot, { backgroundColor: theme.success }]} />
            <View style={styles.addressInfo}>
              <ThemedText style={[styles.addressLabel, { color: theme.secondaryText }]}>Pickup</ThemedText>
              <ThemedText style={styles.postcodeText}>{booking.pickup_postcode}</ThemedText>
              <ThemedText style={[styles.addressText, { color: theme.secondaryText }]}>{booking.pickup_address}</ThemedText>
              {booking.sender_name ? (
                <ThemedText style={[styles.contactText, { color: theme.secondaryText }]}>
                  {booking.sender_name} - {booking.sender_phone}
                </ThemedText>
              ) : null}
            </View>
          </View>
          
          <View style={[styles.addressLine, { backgroundColor: theme.border }]} />
          
          <View style={styles.addressRow}>
            <View style={[styles.dot, { backgroundColor: theme.error }]} />
            <View style={styles.addressInfo}>
              <ThemedText style={[styles.addressLabel, { color: theme.secondaryText }]}>Delivery</ThemedText>
              <ThemedText style={styles.postcodeText}>{booking.delivery_postcode}</ThemedText>
              <ThemedText style={[styles.addressText, { color: theme.secondaryText }]}>{booking.delivery_address}</ThemedText>
              {booking.recipient_name ? (
                <ThemedText style={[styles.contactText, { color: theme.secondaryText }]}>
                  {booking.recipient_name} - {booking.recipient_phone}
                </ThemedText>
              ) : null}
            </View>
          </View>
        </View>
      </Card>

      <Card style={styles.section}>
        <ThemedText style={styles.sectionTitle}>Booking Information</ThemedText>
        
        <View style={styles.infoRow}>
          <ThemedText style={[styles.infoLabel, { color: theme.secondaryText }]}>Scheduled Date</ThemedText>
          <ThemedText>{new Date(booking.scheduled_date).toLocaleDateString()}</ThemedText>
        </View>
        
        <View style={styles.infoRow}>
          <ThemedText style={[styles.infoLabel, { color: theme.secondaryText }]}>Vehicle Type</ThemedText>
          <ThemedText style={{ textTransform: 'capitalize' }}>{booking.vehicle_type?.replace('_', ' ')}</ThemedText>
        </View>
        
        {booking.parcel_weight ? (
          <View style={styles.infoRow}>
            <ThemedText style={[styles.infoLabel, { color: theme.secondaryText }]}>Weight</ThemedText>
            <ThemedText>{booking.parcel_weight} kg</ThemedText>
          </View>
        ) : null}
        
        {booking.parcel_description ? (
          <View style={styles.infoRow}>
            <ThemedText style={[styles.infoLabel, { color: theme.secondaryText }]}>Description</ThemedText>
            <ThemedText>{booking.parcel_description}</ThemedText>
          </View>
        ) : null}
        
        {booking.notes ? (
          <View style={styles.infoRow}>
            <ThemedText style={[styles.infoLabel, { color: theme.secondaryText }]}>Notes</ThemedText>
            <ThemedText>{booking.notes}</ThemedText>
          </View>
        ) : null}
        
        <View style={[styles.infoRow, styles.priceRow]}>
          <ThemedText style={styles.priceLabel}>Total</ThemedText>
          <ThemedText style={[styles.priceValue, { color: theme.primary }]}>
            {'\u00A3'}{(booking.price_final || booking.price_estimate)?.toFixed(2)}
          </ThemedText>
        </View>
      </Card>

      {isDelivered && (booking.pod_photo_url || booking.pod_photos?.length || booking.pod_signature_url) ? (
        <Card style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Proof of Delivery</ThemedText>
          
          {booking.delivered_at ? (
            <View style={styles.infoRow}>
              <ThemedText style={[styles.infoLabel, { color: theme.secondaryText }]}>Delivered At</ThemedText>
              <ThemedText>{new Date(booking.delivered_at).toLocaleString()}</ThemedText>
            </View>
          ) : null}
          
          {booking.pod_notes ? (
            <View style={styles.infoRow}>
              <ThemedText style={[styles.infoLabel, { color: theme.secondaryText }]}>Delivery Notes</ThemedText>
              <ThemedText>{booking.pod_notes}</ThemedText>
            </View>
          ) : null}
          
          {booking.pod_signature_url ? (
            <View style={styles.podItem}>
              <ThemedText style={[styles.podLabel, { color: theme.secondaryText }]}>Signature</ThemedText>
              <Image
                source={{ uri: booking.pod_signature_url }}
                style={styles.signatureImage}
                contentFit="contain"
              />
            </View>
          ) : null}
          
          {(booking.pod_photos?.length || booking.pod_photo_url) ? (
            <View style={styles.podItem}>
              <ThemedText style={[styles.podLabel, { color: theme.secondaryText }]}>Photos</ThemedText>
              <View style={styles.photosGrid}>
                {(booking.pod_photos || [booking.pod_photo_url]).filter(Boolean).map((photo, index) => (
                  <Image
                    key={index}
                    source={{ uri: photo }}
                    style={styles.podPhoto}
                    contentFit="cover"
                  />
                ))}
              </View>
            </View>
          ) : null}
        </Card>
      ) : null}

      {['draft', 'pending_payment', 'paid', 'confirmed', 'cancelled'].includes(booking.status) ? (
        <Pressable
          style={[styles.cancelButton, { borderColor: theme.error }]}
          onPress={handleCancelBooking}
        >
          <Feather name="trash-2" size={20} color={theme.error} />
          <ThemedText style={{ color: theme.error }}>Delete Order</ThemedText>
        </Pressable>
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
  headerCard: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  trackingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trackingNumber: {
    ...Typography.h3,
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    ...Typography.bodyMedium,
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
  },
  trackButtonText: {
    ...Typography.button,
    color: '#fff',
  },
  section: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h4,
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
  contactText: {
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  infoLabel: {
    ...Typography.body,
    flex: 1,
  },
  priceRow: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  priceLabel: {
    ...Typography.bodyMedium,
  },
  priceValue: {
    ...Typography.h3,
  },
  podItem: {
    marginBottom: Spacing.lg,
  },
  podLabel: {
    ...Typography.caption,
    marginBottom: Spacing.sm,
  },
  signatureImage: {
    width: '100%',
    height: 150,
    backgroundColor: '#f5f5f5',
    borderRadius: BorderRadius.sm,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  podPhoto: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.sm,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing['3xl'],
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginTop: Spacing.md,
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
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
  },
  payNowButtonText: {
    ...Typography.button,
    color: '#fff',
  },
});
