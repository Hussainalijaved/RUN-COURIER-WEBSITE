import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/Card';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || '';

interface DriverNotice {
  id: string;
  notice_id: string;
  driver_id: string;
  driver_email: string | null;
  viewed_at: string | null;
  acknowledged_at: string | null;
  status: string;
  delivery_channel: string;
  notice: {
    id: string;
    title: string;
    subject: string;
    message: string;
    category: string;
    requires_acknowledgement: boolean;
    sent_by: string;
    sent_at: string;
    status: string;
    image_url?: string | null;
    image_urls?: string[] | null;
  };
}

async function getAuthToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getCategoryColor(category: string, theme: any): string {
  switch (category?.toLowerCase()) {
    case 'urgent': return theme.error || '#dc2626';
    case 'safety': return '#f59e0b';
    case 'payment': return '#10b981';
    case 'schedule': return '#6366f1';
    default: return theme.primary || '#2563eb';
  }
}

export function AlertsScreen() {
  const { theme } = useTheme();
  const [notices, setNotices] = useState<DriverNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<DriverNotice | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  const fetchNoticesRef = useRef<() => Promise<void>>();

  const fetchNotices = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token || !API_URL) return;

      const resp = await fetch(`${API_URL}/api/driver/notices`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!resp.ok) return;
      const data: DriverNotice[] = await resp.json();

      const sorted = (data || []).sort((a, b) => {
        const aDate = a.notice?.sent_at || '';
        const bDate = b.notice?.sent_at || '';
        return bDate.localeCompare(aDate);
      });

      setNotices(sorted);

      // Mark unread ones as viewed (fire and forget)
      const unread = sorted.filter(n => !n.viewed_at);
      if (unread.length > 0) {
        for (const n of unread) {
          fetch(`${API_URL}/api/driver/notices/${n.notice_id}/view`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}` },
          }).catch(() => {});
        }
        // Update local state to mark as viewed
        setNotices(prev => prev.map(n =>
          !n.viewed_at ? { ...n, viewed_at: new Date().toISOString(), status: 'viewed' } : n
        ));
      }
    } catch (err) {
      console.error('[AlertsScreen] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  fetchNoticesRef.current = fetchNotices;

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchNoticesRef.current?.();
    }, [])
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNoticesRef.current?.();
  }, []);

  const handleAcknowledge = useCallback(async (notice: DriverNotice) => {
    setAcknowledging(true);
    try {
      const token = await getAuthToken();
      if (!token || !API_URL) return;

      const resp = await fetch(`${API_URL}/api/driver/notices/${notice.notice_id}/acknowledge`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (resp.ok) {
        setNotices(prev => prev.map(n =>
          n.notice_id === notice.notice_id
            ? { ...n, acknowledged_at: new Date().toISOString(), status: 'acknowledged' }
            : n
        ));
        setSelectedNotice(prev => prev?.notice_id === notice.notice_id
          ? { ...prev, acknowledged_at: new Date().toISOString(), status: 'acknowledged' }
          : prev
        );
      }
    } catch (err) {
      console.error('[AlertsScreen] acknowledge error:', err);
    } finally {
      setAcknowledging(false);
    }
  }, []);

  const openNotice = useCallback((notice: DriverNotice) => {
    setSelectedNotice(notice);
  }, []);

  const unreadCount = notices.filter(n => !n.viewed_at).length;

  const styles = StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.background,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
    },
    badge: {
      backgroundColor: theme.error || '#dc2626',
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    badgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    centerContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.xl,
    },
    emptyIcon: {
      marginBottom: Spacing.md,
      opacity: 0.4,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.text,
      marginBottom: Spacing.xs,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.textSecondary,
      textAlign: 'center',
    },
    noticeCard: {
      marginHorizontal: Spacing.md,
      marginVertical: Spacing.xs,
      borderRadius: BorderRadius.md,
      overflow: 'hidden',
    },
    noticeCardInner: {
      padding: Spacing.md,
    },
    noticeRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.sm,
    },
    categoryDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: 5,
      flexShrink: 0,
    },
    noticeContent: {
      flex: 1,
    },
    noticeTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    noticeTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
      flex: 1,
      marginRight: Spacing.xs,
    },
    noticeDate: {
      fontSize: 12,
      color: theme.textSecondary,
      flexShrink: 0,
    },
    noticeSubject: {
      fontSize: 13,
      color: theme.textSecondary,
      marginBottom: 4,
    },
    noticeMessage: {
      fontSize: 14,
      color: theme.textSecondary,
      lineHeight: 20,
    },
    noticeMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      marginTop: Spacing.sm,
    },
    categoryPill: {
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    categoryText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#fff',
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.primary,
      marginTop: 2,
    },
    requiresAckBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    requiresAckText: {
      fontSize: 11,
      color: theme.error || '#dc2626',
      fontWeight: '600',
    },
    // Modal styles
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: theme.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '85%',
    },
    modalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      alignSelf: 'center',
      marginTop: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: theme.text,
      flex: 1,
      marginRight: Spacing.sm,
    },
    modalBody: {
      padding: Spacing.lg,
    },
    modalSubject: {
      fontSize: 14,
      color: theme.textSecondary,
      marginBottom: Spacing.sm,
      fontStyle: 'italic',
    },
    modalMessage: {
      fontSize: 15,
      color: theme.text,
      lineHeight: 23,
    },
    modalMeta: {
      marginTop: Spacing.md,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      gap: Spacing.xs,
    },
    modalMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
    },
    modalMetaText: {
      fontSize: 13,
      color: theme.textSecondary,
    },
    ackButton: {
      backgroundColor: theme.primary,
      borderRadius: BorderRadius.md,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: Spacing.lg,
      marginHorizontal: Spacing.lg,
      marginBottom: Spacing.lg,
    },
    ackButtonDone: {
      backgroundColor: '#10b981',
    },
    ackButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <ThemedText style={styles.headerTitle}>Alerts</ThemedText>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>{unreadCount}</ThemedText>
          </View>
        )}
      </View>

      <ScreenScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {notices.length === 0 ? (
          <View style={styles.centerContainer}>
            <Feather name="bell" size={56} color={theme.textSecondary} style={styles.emptyIcon} />
            <ThemedText style={styles.emptyTitle}>No alerts yet</ThemedText>
            <ThemedText style={styles.emptySubtitle}>
              Messages from your operations team will appear here
            </ThemedText>
          </View>
        ) : (
          notices.map(item => {
            const isUnread = !item.viewed_at;
            const needsAck = item.notice?.requires_acknowledgement && !item.acknowledged_at;
            const catColor = getCategoryColor(item.notice?.category, theme);

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => openNotice(item)}
                activeOpacity={0.75}
              >
                <Card style={styles.noticeCard}>
                  <View style={styles.noticeCardInner}>
                    <View style={styles.noticeRow}>
                      {isUnread && <View style={styles.unreadDot} />}
                      <View style={[
                        styles.categoryDot,
                        { backgroundColor: catColor },
                        isUnread ? {} : { opacity: 0.5 },
                      ]} />
                      <View style={styles.noticeContent}>
                        <View style={styles.noticeTitleRow}>
                          <ThemedText style={[
                            styles.noticeTitle,
                            isUnread ? {} : { fontWeight: '500', opacity: 0.8 },
                          ]} numberOfLines={1}>
                            {item.notice?.title}
                          </ThemedText>
                          <ThemedText style={styles.noticeDate}>
                            {item.notice?.sent_at ? formatDate(item.notice.sent_at) : ''}
                          </ThemedText>
                        </View>
                        {item.notice?.subject ? (
                          <ThemedText style={styles.noticeSubject} numberOfLines={1}>
                            {item.notice.subject}
                          </ThemedText>
                        ) : null}
                        <ThemedText style={styles.noticeMessage} numberOfLines={2}>
                          {item.notice?.message}
                        </ThemedText>
                        <View style={styles.noticeMeta}>
                          <View style={[styles.categoryPill, { backgroundColor: catColor }]}>
                            <ThemedText style={styles.categoryText}>
                              {(item.notice?.category || 'general').toUpperCase()}
                            </ThemedText>
                          </View>
                          {needsAck && (
                            <View style={styles.requiresAckBadge}>
                              <Feather name="alert-circle" size={12} color={theme.error || '#dc2626'} />
                              <ThemedText style={styles.requiresAckText}>
                                Action required
                              </ThemedText>
                            </View>
                          )}
                          {item.acknowledged_at && (
                            <View style={styles.requiresAckBadge}>
                              <Feather name="check-circle" size={12} color="#10b981" />
                              <ThemedText style={[styles.requiresAckText, { color: '#10b981' }]}>
                                Acknowledged
                              </ThemedText>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScreenScrollView>

      {/* Notice Detail Modal */}
      <Modal
        visible={!!selectedNotice}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedNotice(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setSelectedNotice(null)}
          />
          <View style={styles.modalContainer}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>
                {selectedNotice?.notice?.title}
              </ThemedText>
              <TouchableOpacity onPress={() => setSelectedNotice(null)}>
                <Feather name="x" size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <View style={styles.modalBody}>
                {selectedNotice?.notice?.subject ? (
                  <ThemedText style={styles.modalSubject}>
                    {selectedNotice.notice.subject}
                  </ThemedText>
                ) : null}
                <ThemedText style={styles.modalMessage}>
                  {selectedNotice?.notice?.message}
                </ThemedText>
                <View style={styles.modalMeta}>
                  <View style={styles.modalMetaRow}>
                    <Feather name="user" size={14} color={theme.textSecondary} />
                    <ThemedText style={styles.modalMetaText}>
                      From: {selectedNotice?.notice?.sent_by || 'Operations Team'}
                    </ThemedText>
                  </View>
                  {selectedNotice?.notice?.sent_at && (
                    <View style={styles.modalMetaRow}>
                      <Feather name="clock" size={14} color={theme.textSecondary} />
                      <ThemedText style={styles.modalMetaText}>
                        {new Date(selectedNotice.notice.sent_at).toLocaleString('en-GB', {
                          day: 'numeric', month: 'long', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </ThemedText>
                    </View>
                  )}
                  <View style={styles.modalMetaRow}>
                    <Feather
                      name={getCategoryColor(selectedNotice?.notice?.category || '', theme) ? 'tag' : 'tag'}
                      size={14}
                      color={theme.textSecondary}
                    />
                    <ThemedText style={styles.modalMetaText}>
                      {(selectedNotice?.notice?.category || 'general').charAt(0).toUpperCase() +
                        (selectedNotice?.notice?.category || 'general').slice(1)}
                    </ThemedText>
                  </View>
                </View>
              </View>
            </ScrollView>
            {selectedNotice?.notice?.requires_acknowledgement && (
              <TouchableOpacity
                style={[
                  styles.ackButton,
                  selectedNotice.acknowledged_at ? styles.ackButtonDone : {},
                ]}
                onPress={() => !selectedNotice.acknowledged_at && handleAcknowledge(selectedNotice)}
                disabled={!!selectedNotice.acknowledged_at || acknowledging}
              >
                {acknowledging ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <ThemedText style={styles.ackButtonText}>
                    {selectedNotice.acknowledged_at ? 'Acknowledged' : 'Acknowledge'}
                  </ThemedText>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
