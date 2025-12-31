import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';
import { Spacing } from '@/constants/theme';
import { JobOffersScreen } from '@/screens/driver/JobOffersScreen';
import { ActiveJobScreen } from '@/screens/driver/ActiveJobScreen';
import { CompletedJobsScreen } from '@/screens/driver/CompletedJobsScreen';
import { ProfileScreen } from '@/screens/driver/ProfileScreen';
import { SettingsScreen } from '@/screens/driver/SettingsScreen';
import { EditProfileScreen } from '@/screens/driver/EditProfileScreen';
import { ManageDocumentsScreen } from '@/screens/driver/ManageDocumentsScreen';
import { DocumentDetailScreen } from '@/screens/driver/DocumentDetailScreen';
import { BankDetailsScreen } from '@/screens/driver/BankDetailsScreen';
import { InAppNavigationScreen } from '@/screens/driver/InAppNavigationScreen';
import { useTheme } from '@/hooks/useTheme';
import { usePendingJobs } from '@/context/PendingJobsContext';
import { getCommonScreenOptions } from './screenOptions';
import { HeaderTitle } from '@/components/HeaderTitle';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function ProfileStack() {
  const { theme, isDark } = useTheme();
  
  return (
    <Stack.Navigator screenOptions={getCommonScreenOptions({ theme, isDark })}>
      <Stack.Screen 
        name="ProfileMain" 
        component={ProfileScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Profile" showIcon={false} />,
        }}
      />
      <Stack.Screen 
        name="EditProfile" 
        component={EditProfileScreen}
        options={{
          title: 'Edit Profile',
        }}
      />
      <Stack.Screen 
        name="ManageDocuments" 
        component={ManageDocumentsScreen}
        options={{
          title: 'Manage Documents',
        }}
      />
      <Stack.Screen 
        name="DocumentDetail" 
        component={DocumentDetailScreen}
        options={({ route }: any) => ({
          title: route.params?.documentDef?.name || 'Document',
        })}
      />
      <Stack.Screen 
        name="BankDetails" 
        component={BankDetailsScreen}
        options={{
          title: 'Bank Details',
        }}
      />
      <Stack.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{
          title: 'Settings',
        }}
      />
    </Stack.Navigator>
  );
}

function HomeStack() {
  const { theme, isDark } = useTheme();
  
  return (
    <Stack.Navigator screenOptions={getCommonScreenOptions({ theme, isDark })}>
      <Stack.Screen 
        name="JobOffersMain" 
        component={JobOffersScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Run Courier" />,
        }}
      />
    </Stack.Navigator>
  );
}

function ActiveJobStack() {
  const { theme, isDark } = useTheme();
  
  return (
    <Stack.Navigator screenOptions={getCommonScreenOptions({ theme, isDark })}>
      <Stack.Screen 
        name="ActiveJobMain" 
        component={ActiveJobScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Active Job" showIcon={false} />,
        }}
      />
      <Stack.Screen 
        name="InAppNavigation" 
        component={InAppNavigationScreen}
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack.Navigator>
  );
}

function CompletedStack() {
  const { theme, isDark } = useTheme();
  
  return (
    <Stack.Navigator screenOptions={getCommonScreenOptions({ theme, isDark })}>
      <Stack.Screen 
        name="CompletedMain" 
        component={CompletedJobsScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Completed" showIcon={false} />,
        }}
      />
    </Stack.Navigator>
  );
}

export function DriverTabNavigator() {
  const { theme, isDark } = useTheme();
  const { pendingJobCount } = usePendingJobs();

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        tabBarActiveTintColor: '#000000',
        tabBarInactiveTintColor: '#555555',
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          height: Platform.OS === 'ios' ? 88 : 72,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginTop: 4,
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
        headerShown: false,
        tabBarBadgeStyle: {
          backgroundColor: theme.error,
          color: '#fff',
          fontSize: 14,
          fontWeight: '600',
          minWidth: 18,
          height: 18,
          borderRadius: 9,
          marginLeft: 4,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => (
            <Feather name="list" size={26} color={color} />
          ),
          tabBarBadge: pendingJobCount > 0 ? pendingJobCount : undefined,
        }}
      />
      <Tab.Screen
        name="ActiveJobTab"
        component={ActiveJobStack}
        options={{
          title: 'Active',
          tabBarIcon: ({ color }) => (
            <Feather name="navigation" size={26} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="CompletedTab"
        component={CompletedStack}
        options={{
          title: 'Done',
          tabBarIcon: ({ color }) => (
            <Feather name="check-circle" size={26} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <Feather name="user" size={26} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
