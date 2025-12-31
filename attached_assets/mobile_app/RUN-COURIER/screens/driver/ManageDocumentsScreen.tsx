import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchDriverDocuments,
  getRequiredDocuments,
  calculateCompletionPercentage,
  getDocumentDisplayStatus,
  DriverDocument,
  DocumentDefinition,
  DocumentCategory,
} from '@/services/documentService';

type DocumentWithStatus = DocumentDefinition & {
  status: 'verified' | 'pending' | 'rejected' | 'not_uploaded';
  file_url?: string;
  expiry_date?: string;
  uploaded_at?: string;
};

export function ManageDocumentsScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { driver, user } = useAuth();
  
  const [documents, setDocuments] = useState<DocumentWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completionStats, setCompletionStats] = useState({ verified: 0, total: 0, percentage: 0 });

  const driverId = driver?.id || user?.id || '';
  const vehicleType = driver?.vehicle_type || 'car';
  const nationality = (driver as any)?.nationality || 'British';

  const loadDocuments = useCallback(async () => {
    if (!driverId) {
      setLoading(false);
      return;
    }

    try {
      const requiredDocs = getRequiredDocuments(vehicleType, nationality);
      const uploadedDocs = await fetchDriverDocuments(driverId);
      
      const mergedDocs: DocumentWithStatus[] = requiredDocs.map((reqDoc) => {
        const uploaded = uploadedDocs.find((d) => {
          const docType = d.document_type || d.type || '';
          if (docType === reqDoc.type) return true;
          if (reqDoc.multiPhoto && docType.startsWith(reqDoc.type + '_')) return true;
          return false;
        });
        
        return {
          ...reqDoc,
          status: (uploaded?.status as any) || 'not_uploaded',
          file_url: uploaded?.file_url || uploaded?.url,
          expiry_date: uploaded?.expiry_date,
          uploaded_at: uploaded?.uploaded_at || uploaded?.created_at,
        };
      });

      setDocuments(mergedDocs);
      
      const stats = calculateCompletionPercentage(uploadedDocs, requiredDocs);
      setCompletionStats(stats);
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [driverId, vehicleType, nationality]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  useFocusEffect(
    useCallback(() => {
      loadDocuments();
    }, [loadDocuments])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDocuments();
  }, [loadDocuments]);

  const handleDocumentPress = (doc: DocumentWithStatus) => {
    navigation.navigate('DocumentDetail', { documentDef: doc });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified':
      case 'approved':
        return theme.success;
      case 'pending':
        return theme.warning;
      case 'rejected':
        return theme.error;
      default:
        return theme.secondaryText;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
      case 'approved':
        return 'check-circle';
      case 'pending':
        return 'clock';
      case 'rejected':
        return 'x-circle';
      default:
        return 'upload';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'verified':
      case 'approved':
        return 'Verified';
      case 'pending':
        return 'Pending Review';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Not Uploaded';
    }
  };

  const getCategoryTitle = (category: DocumentCategory): string => {
    switch (category) {
      case 'personal':
        return 'Personal Documents';
      case 'vehicle_photos':
        return 'Vehicle Photos';
      case 'vehicle_details':
        return 'Vehicle Details';
      case 'insurance':
        return 'Insurance Documents';
      default:
        return 'Other';
    }
  };

  const groupedDocuments = documents.reduce((acc, doc) => {
    if (!acc[doc.category]) {
      acc[doc.category] = [];
    }
    acc[doc.category].push(doc);
    return acc;
  }, {} as Record<DocumentCategory, DocumentWithStatus[]>);

  const categories: DocumentCategory[] = ['personal', 'vehicle_photos', 'vehicle_details', 'insurance'];

  if (loading) {
    return (
      <SafeAreaView style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]} edges={['top', 'bottom', 'left', 'right']}>
        <ActivityIndicator size="large" color={theme.primary} />
        <ThemedText style={styles.loadingText}>Loading documents...</ThemedText>
      </SafeAreaView>
    );
  }

  return (
    <ScreenScrollView 
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      hasTabBar={true}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.primary}
        />
      }
    >
      <View style={styles.content}>
        <ThemedView style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Feather name="file-text" size={24} color={theme.primary} />
          </View>
          <View style={styles.summaryText}>
            <ThemedText style={styles.summaryTitle}>Document Status</ThemedText>
            <ThemedText style={[styles.summarySubtitle, { color: theme.secondaryText }]}>
              {completionStats.verified} of {completionStats.total} documents verified
            </ThemedText>
          </View>
          <View style={[styles.progressCircle, { borderColor: getProgressColor(completionStats.percentage, theme) }]}>
            <ThemedText style={[styles.progressText, { color: getProgressColor(completionStats.percentage, theme) }]}>
              {completionStats.percentage}%
            </ThemedText>
          </View>
        </ThemedView>

        {categories.map((category) => {
          const categoryDocs = groupedDocuments[category];
          if (!categoryDocs || categoryDocs.length === 0) return null;

          return (
            <View key={category} style={styles.categorySection}>
              <ThemedText style={styles.sectionTitle}>{getCategoryTitle(category)}</ThemedText>
              <View style={styles.documentsList}>
                {categoryDocs.map((doc) => (
                  <Pressable
                    key={doc.id}
                    onPress={() => handleDocumentPress(doc)}
                    style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
                  >
                    <ThemedView style={styles.documentCard}>
                      <View style={styles.documentInfo}>
                        <View style={[styles.docIcon, { backgroundColor: getStatusColor(doc.status) + '20' }]}>
                          <Feather 
                            name={getStatusIcon(doc.status) as any} 
                            size={20} 
                            color={getStatusColor(doc.status)} 
                          />
                        </View>
                        <View style={styles.docDetails}>
                          <ThemedText style={styles.docName}>{doc.name}</ThemedText>
                          <ThemedText style={[styles.docStatus, { color: getStatusColor(doc.status) }]}>
                            {getStatusLabel(doc.status)}
                          </ThemedText>
                          {doc.expiry_date ? (
                            <ThemedText style={[styles.docExpiry, { color: theme.secondaryText }]}>
                              Expires: {new Date(doc.expiry_date).toLocaleDateString()}
                            </ThemedText>
                          ) : null}
                        </View>
                      </View>
                      <Feather name="chevron-right" size={20} color={theme.secondaryText} />
                    </ThemedView>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}

        <View style={[styles.infoCard, { backgroundColor: theme.primary + '10' }]}>
          <Feather name="info" size={20} color={theme.primary} />
          <ThemedText style={[styles.infoText, { color: theme.text }]}>
            Keep your documents up to date to continue receiving job offers. Documents with expiry dates must be renewed before they expire.
          </ThemedText>
        </View>

        {vehicleType ? (
          <View style={[styles.vehicleInfo, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="truck" size={16} color={theme.secondaryText} />
            <ThemedText style={[styles.vehicleText, { color: theme.secondaryText }]}>
              Showing documents for: {vehicleType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </ScreenScrollView>
  );
}

function getProgressColor(percentage: number, theme: any): string {
  if (percentage >= 80) return theme.success;
  if (percentage >= 50) return theme.warning;
  return theme.primary;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: 16,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing['2xl'],
  },
  summaryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  summaryText: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  summarySubtitle: {
    fontSize: 17,
  },
  progressCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 17,
    fontWeight: '700',
  },
  categorySection: {
    marginBottom: Spacing['2xl'],
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  documentsList: {
    gap: Spacing.md,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  documentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  docIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  docDetails: {
    flex: 1,
  },
  docName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  docStatus: {
    fontSize: 17,
    fontWeight: '500',
  },
  docExpiry: {
    fontSize: 15,
    marginTop: Spacing.xs,
  },
  infoCard: {
    flexDirection: 'row',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  infoText: {
    fontSize: 17,
    flex: 1,
    lineHeight: 20,
  },
  vehicleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  vehicleText: {
    fontSize: 16,
  },
});
