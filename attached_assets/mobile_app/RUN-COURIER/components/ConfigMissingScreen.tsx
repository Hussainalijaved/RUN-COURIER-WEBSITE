import React from 'react';
import { View, Text, StyleSheet, Pressable, SafeAreaView, Image, Linking, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';

type ConfigMissingScreenProps = {
  missingItems: string[];
  onRetry: () => void;
};

export function ConfigMissingScreen({ missingItems, onRetry }: ConfigMissingScreenProps) {
  const handleContactSupport = () => {
    Linking.openURL('mailto:support@runcourier.co.uk?subject=Run%20Courier%20App%20Setup%20Issue');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Feather name="truck" size={48} color="#007AFF" />
          </View>
        </View>
        
        <Text style={styles.appName}>Run Courier</Text>
        <Text style={styles.title}>Connection Issue</Text>
        
        <Text style={styles.description}>
          We're having trouble connecting to our servers. This is usually temporary. Please check your internet connection and try again.
        </Text>
        
        <View style={styles.troubleshootList}>
          <Text style={styles.troubleshootLabel}>Try these steps:</Text>
          <View style={styles.troubleshootItem}>
            <Feather name="wifi" size={16} color="#007AFF" />
            <Text style={styles.troubleshootText}>Check your internet connection</Text>
          </View>
          <View style={styles.troubleshootItem}>
            <Feather name="refresh-cw" size={16} color="#007AFF" />
            <Text style={styles.troubleshootText}>Close and reopen the app</Text>
          </View>
          <View style={styles.troubleshootItem}>
            <Feather name="clock" size={16} color="#007AFF" />
            <Text style={styles.troubleshootText}>Wait a moment and try again</Text>
          </View>
        </View>
        
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <Feather name="refresh-cw" size={20} color="#fff" />
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
        
        <Pressable style={styles.supportButton} onPress={handleContactSupport}>
          <Feather name="mail" size={18} color="#007AFF" />
          <Text style={styles.supportButtonText}>Contact Support</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoContainer: {
    marginBottom: 16,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#E8F2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#007AFF',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  troubleshootList: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 32,
  },
  troubleshootLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  troubleshootItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  troubleshootText: {
    fontSize: 14,
    color: '#444',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  supportButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
});
