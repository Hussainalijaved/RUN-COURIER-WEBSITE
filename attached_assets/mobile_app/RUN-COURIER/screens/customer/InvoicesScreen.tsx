import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemedText } from '@/components/ThemedText';
import { ScreenFlatList } from '@/components/ScreenFlatList';
import { Card } from '@/components/Card';
import { Spacing, BorderRadius } from '@/constants/theme';
import { CustomerInvoice } from '@/lib/customer-types';
import { customerService } from '@/services/customerService';

type FilterType = 'all' | 'pending' | 'paid';

export function InvoicesScreen() {
  const { customerProfile } = useAuth();
  const { theme } = useTheme();
  const [invoices, setInvoices] = useState<CustomerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  const fetchInvoices = useCallback(async () => {
    if (!customerProfile) return;
    
    try {
      const data = await customerService.getCustomerInvoices(customerProfile.id);
      setInvoices(data);
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [customerProfile]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchInvoices();
  }, [fetchInvoices]);

  const filteredInvoices = invoices.filter(invoice => {
    if (filter === 'all') return true;
    if (filter === 'pending') return invoice.status === 'pending' || invoice.status === 'sent';
    if (filter === 'paid') return invoice.status === 'paid';
    return true;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return theme.success;
      case 'pending':
      case 'sent':
        return theme.warning;
      case 'overdue':
        return theme.error;
      default:
        return theme.secondaryText;
    }
  };

  const formatCurrency = (amount: number) => {
    return `£${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderFilterButton = (filterType: FilterType, label: string) => (
    <Pressable
      onPress={() => setFilter(filterType)}
      style={[
        styles.filterButton,
        {
          backgroundColor: filter === filterType ? theme.primary : 'transparent',
          borderColor: filter === filterType ? theme.primary : theme.border,
        },
      ]}
    >
      <ThemedText
        style={[
          styles.filterButtonText,
          { color: filter === filterType ? '#FFFFFF' : theme.secondaryText },
        ]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );

  const renderInvoice = ({ item }: { item: CustomerInvoice }) => {
    const statusColor = getStatusColor(item.status);
    
    return (
      <Card variant="glass" style={styles.invoiceCard}>
        <View style={styles.invoiceHeader}>
          <View style={styles.invoiceInfo}>
            <ThemedText style={styles.invoiceNumber}>
              Invoice #{item.invoice_number || item.id.slice(0, 8).toUpperCase()}
            </ThemedText>
            <ThemedText style={[styles.invoiceDate, { color: theme.secondaryText }]}>
              Week ending {formatDate(item.week_ending || item.week_end_date)}
            </ThemedText>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <ThemedText style={[styles.statusText, { color: statusColor }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </ThemedText>
          </View>
        </View>

        <View style={styles.invoiceDetails}>
          <View style={styles.detailRow}>
            <ThemedText style={[styles.detailLabel, { color: theme.secondaryText }]}>
              Total Jobs
            </ThemedText>
            <ThemedText style={styles.detailValue}>
              {item.total_jobs || 0}
            </ThemedText>
          </View>
          <View style={styles.detailRow}>
            <ThemedText style={[styles.detailLabel, { color: theme.secondaryText }]}>
              Subtotal
            </ThemedText>
            <ThemedText style={styles.detailValue}>
              {formatCurrency(item.subtotal || item.total_amount)}
            </ThemedText>
          </View>
          {item.vat_amount && item.vat_amount > 0 ? (
            <View style={styles.detailRow}>
              <ThemedText style={[styles.detailLabel, { color: theme.secondaryText }]}>
                VAT (20%)
              </ThemedText>
              <ThemedText style={styles.detailValue}>
                {formatCurrency(item.vat_amount)}
              </ThemedText>
            </View>
          ) : null}
        </View>

        <View style={[styles.invoiceFooter, { borderTopColor: theme.border }]}>
          <ThemedText style={styles.totalLabel}>Total Amount</ThemedText>
          <ThemedText style={[styles.totalAmount, { color: theme.primary }]}>
            {formatCurrency(item.total_amount)}
          </ThemedText>
        </View>

        {item.due_date ? (
          <View style={styles.dueDateContainer}>
            <Feather name="calendar" size={14} color={theme.secondaryText} />
            <ThemedText style={[styles.dueDate, { color: theme.secondaryText }]}>
              Due: {formatDate(item.due_date)}
            </ThemedText>
          </View>
        ) : null}
      </Card>
    );
  };

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Feather name="file-text" size={64} color={theme.secondaryText} />
      <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>
        No Invoices Yet
      </ThemedText>
      <ThemedText style={[styles.emptySubtitle, { color: theme.secondaryText }]}>
        Your weekly invoices will appear here once you start completing deliveries.
      </ThemedText>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.filterContainer}>
        {renderFilterButton('all', 'All')}
        {renderFilterButton('pending', 'Pending')}
        {renderFilterButton('paid', 'Paid')}
      </View>

      {invoices.length > 0 ? (
        <Card style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <ThemedText style={[styles.summaryLabel, { color: theme.secondaryText }]}>
                Total Invoices
              </ThemedText>
              <ThemedText style={styles.summaryValue}>
                {invoices.length}
              </ThemedText>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />
            <View style={styles.summaryItem}>
              <ThemedText style={[styles.summaryLabel, { color: theme.secondaryText }]}>
                Outstanding
              </ThemedText>
              <ThemedText style={[styles.summaryValue, { color: theme.warning }]}>
                {formatCurrency(
                  invoices
                    .filter(i => i.status !== 'paid')
                    .reduce((sum, i) => sum + i.total_amount, 0)
                )}
              </ThemedText>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />
            <View style={styles.summaryItem}>
              <ThemedText style={[styles.summaryLabel, { color: theme.secondaryText }]}>
                Paid
              </ThemedText>
              <ThemedText style={[styles.summaryValue, { color: theme.success }]}>
                {formatCurrency(
                  invoices
                    .filter(i => i.status === 'paid')
                    .reduce((sum, i) => sum + i.total_amount, 0)
                )}
              </ThemedText>
            </View>
          </View>
        </Card>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ThemedText>Loading invoices...</ThemedText>
      </View>
    );
  }

  return (
    <ScreenFlatList
      hasTabBar={true}
      data={filteredInvoices}
      renderItem={renderInvoice}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={renderHeader}
      ListEmptyComponent={renderEmptyList}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.primary}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing['2xl'],
  },
  headerContainer: {
    marginBottom: Spacing.md,
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  filterButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryCard: {
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    height: 40,
  },
  summaryLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  invoiceCard: {
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  invoiceInfo: {
    flex: 1,
  },
  invoiceNumber: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  invoiceDate: {
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  invoiceDetails: {
    marginBottom: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  invoiceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '700',
  },
  dueDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: 6,
  },
  dueDate: {
    fontSize: 13,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
