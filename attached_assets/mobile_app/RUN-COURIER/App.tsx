import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Platform, View, ActivityIndicator } from 'react-native';
import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { navigationRef } from '@/lib/navigationRef';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { PendingJobsProvider } from '@/context/PendingJobsContext';
import { AuthNavigator } from '@/navigation/AuthNavigator';
import { DriverTabNavigator } from '@/navigation/DriverTabNavigator';
import { CustomerTabNavigator } from '@/navigation/CustomerTabNavigator';
import { BusinessTabNavigator } from '@/navigation/BusinessTabNavigator';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConfigMissingScreen } from '@/components/ConfigMissingScreen';
import { supabase, getConfigStatus, refreshConfig } from '@/lib/supabase';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';

const RootStack = createNativeStackNavigator();

const linking: LinkingOptions<any> = {
  prefixes: [Linking.createURL('/'), 'runcourier://'],
  config: {
    screens: {
      Auth: {
        screens: {
          ResetPassword: 'reset-password',
          Login: 'login',
        },
      },
    },
  },
};

function RootNavigator() {
  const { session, loading, isPasswordRecovery, setPasswordRecoveryMode, userRole } = useAuth();

  useEffect(() => {
    console.log(`[NAV] RootNavigator state - loading: ${loading}, session: ${!!session}, userRole: ${userRole}, isPasswordRecovery: ${isPasswordRecovery}`);
  }, [loading, session, userRole, isPasswordRecovery]);

  // CRITICAL: Use userRole for navigation, NOT session
  // This allows fallback driver state to keep users in Home even when session is temporarily null
  const hasValidRole = userRole !== null;

  useEffect(() => {
    const handleDeepLink = async (url: string | null) => {
      if (!url) return;
      
      console.log('Handling deep link:', url);
      
      // Supabase uses # for query params in password recovery links
      // Replace # with ? to parse properly
      const parsedUrl = url.replace('#', '?');
      
      try {
        // Extract query params
        const queryString = parsedUrl.split('?')[1];
        if (!queryString) return;
        
        const params = new URLSearchParams(queryString);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const type = params.get('type');
        
        console.log('Deep link type:', type);
        
        // If this is a password recovery link with tokens, set the session
        if (accessToken && refreshToken && type === 'recovery') {
          console.log('Setting session from recovery link');
          setPasswordRecoveryMode(true);
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          
          if (error) {
            console.error('Error setting session from recovery link:', error);
            setPasswordRecoveryMode(false);
          }
        }
      } catch (err) {
        console.error('Error handling deep link:', err);
      }
    };
    
    // On web, also check the window.location.hash for tokens
    if (typeof window !== 'undefined' && window.location && window.location.hash) {
      const hash = window.location.hash.substring(1); // Remove the #
      console.log('Checking window hash:', hash);
      
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');
      
      if (accessToken && refreshToken && type === 'recovery') {
        console.log('Setting session from hash fragment');
        setPasswordRecoveryMode(true);
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).then(({ error }: any) => {
          if (error) {
            console.error('Error setting session from hash:', error);
            setPasswordRecoveryMode(false);
          } else {
            // Clear the hash from URL after processing
            if (window.history && window.location) {
              window.history.replaceState(null, '', window.location.pathname);
            }
          }
        });
      }
    }

    // Handle initial URL when app opens
    Linking.getInitialURL().then(handleDeepLink);

    // Listen for incoming URLs while app is open
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => subscription.remove();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // CRITICAL: Gate navigation on userRole, NOT session
  // This allows fallback driver state to keep users in Home even when session is temporarily null
  // Only show Auth if:
  // 1. No valid role (user not logged in or new user needing setup), OR
  // 2. User is in password recovery mode
  const showAuth = !hasValidRole || isPasswordRecovery;

  const renderMainNavigator = () => {
    switch (userRole) {
      case 'driver':
        return (
          <RootStack.Screen name="DriverTabs" component={DriverTabNavigator} />
        );
      case 'individual':
        return (
          <RootStack.Screen name="CustomerTabs" component={CustomerTabNavigator} />
        );
      case 'business':
        return (
          <RootStack.Screen name="BusinessTabs" component={BusinessTabNavigator} />
        );
      default:
        return (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        );
    }
  };

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {showAuth ? (
        <RootStack.Screen name="Auth" component={AuthNavigator} />
      ) : (
        renderMainNavigator()
      )}
    </RootStack.Navigator>
  );
}

function AppContent() {
  const [configStatus, setConfigStatus] = useState(() => getConfigStatus());
  const [isChecking, setIsChecking] = useState(false);

  const handleRetryConfig = useCallback(() => {
    setIsChecking(true);
    setTimeout(() => {
      const newStatus = refreshConfig();
      setConfigStatus(newStatus);
      setIsChecking(false);
    }, 500);
  }, []);

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationNavigation(response.notification.request.content.data);
      }
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationNavigation(response.notification.request.content.data);
    });

    return () => subscription.remove();
  }, []);

  if (isChecking) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!configStatus.isValid && !__DEV__) {
    return (
      <ConfigMissingScreen
        missingItems={configStatus.missingItems}
        onRetry={handleRetryConfig}
      />
    );
  }

  return (
    <AuthProvider>
      <PendingJobsProvider>
        <NavigationContainer ref={navigationRef} linking={linking}>
          <RootNavigator />
        </NavigationContainer>
      </PendingJobsProvider>
    </AuthProvider>
  );
}

function handleNotificationNavigation(data: any) {
  if (!data) return;
  try {
    if (navigationRef.isReady()) {
      navigationRef.navigate('HomeTab' as never);
    }
  } catch (err) {
    console.warn('[Notification] Navigation failed:', err);
  }
}

function ConditionalKeyboardProvider({ children }: { children: React.ReactNode }) {
  const isTablet = Platform.OS === 'ios' && Device.deviceType === Device.DeviceType.TABLET;
  
  if (isTablet || Platform.OS === 'web') {
    return <>{children}</>;
  }
  
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

export default function App() {
  const handleAppError = (error: Error, stackTrace: string) => {
    console.error('=== APP ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Component stack:', stackTrace);
    console.error('=================');
  };

  return (
    <ErrorBoundary onError={handleAppError}>
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.root}>
          <ConditionalKeyboardProvider>
            <AppContent />
            <StatusBar style="auto" />
          </ConditionalKeyboardProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
