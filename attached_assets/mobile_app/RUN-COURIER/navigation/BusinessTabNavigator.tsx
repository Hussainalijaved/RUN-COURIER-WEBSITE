import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { getCommonScreenOptions } from './screenOptions';
import { HeaderTitle } from '@/components/HeaderTitle';
import { CustomerDashboardScreen } from '@/screens/customer/CustomerDashboardScreen';
import { NewBookingScreen } from '@/screens/customer/NewBookingScreen';
import { OrdersScreen } from '@/screens/customer/OrdersScreen';
import { OrderDetailScreen } from '@/screens/customer/OrderDetailScreen';
import { TrackingScreen } from '@/screens/customer/TrackingScreen';
import { PaymentScreen } from '@/screens/customer/PaymentScreen';
import { CustomerProfileScreen } from '@/screens/customer/CustomerProfileScreen';
import { InvoicesScreen } from '@/screens/customer/InvoicesScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeStack() {
  const { theme, isDark } = useTheme();
  
  return (
    <Stack.Navigator screenOptions={getCommonScreenOptions({ theme, isDark })}>
      <Stack.Screen 
        name="DashboardMain" 
        component={CustomerDashboardScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Run Courier" />,
        }}
      />
      <Stack.Screen 
        name="NewBooking" 
        component={NewBookingScreen}
        options={{
          title: 'New Booking',
        }}
      />
      <Stack.Screen 
        name="OrderDetail" 
        component={OrderDetailScreen}
        options={{
          title: 'Order Details',
        }}
      />
      <Stack.Screen 
        name="Tracking" 
        component={TrackingScreen}
        options={{
          title: 'Track Delivery',
        }}
      />
      <Stack.Screen 
        name="Payment" 
        component={PaymentScreen}
        options={{
          title: 'Payment',
        }}
      />
    </Stack.Navigator>
  );
}

function OrdersStack() {
  const { theme, isDark } = useTheme();
  
  return (
    <Stack.Navigator screenOptions={getCommonScreenOptions({ theme, isDark })}>
      <Stack.Screen 
        name="OrdersMain" 
        component={OrdersScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Orders" showIcon={false} />,
        }}
      />
      <Stack.Screen 
        name="OrderDetail" 
        component={OrderDetailScreen}
        options={{
          title: 'Order Details',
        }}
      />
      <Stack.Screen 
        name="Tracking" 
        component={TrackingScreen}
        options={{
          title: 'Track Delivery',
        }}
      />
      <Stack.Screen 
        name="Payment" 
        component={PaymentScreen}
        options={{
          title: 'Payment',
        }}
      />
    </Stack.Navigator>
  );
}

function InvoicesStack() {
  const { theme, isDark } = useTheme();
  
  return (
    <Stack.Navigator screenOptions={getCommonScreenOptions({ theme, isDark })}>
      <Stack.Screen 
        name="InvoicesMain" 
        component={InvoicesScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Invoices" showIcon={false} />,
        }}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  const { theme, isDark } = useTheme();
  
  return (
    <Stack.Navigator screenOptions={getCommonScreenOptions({ theme, isDark })}>
      <Stack.Screen 
        name="ProfileMain" 
        component={CustomerProfileScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Profile" showIcon={false} />,
        }}
      />
    </Stack.Navigator>
  );
}

export function BusinessTabNavigator() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
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
          fontSize: 11,
          fontWeight: '600',
          marginTop: 4,
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <Feather name="home" size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="OrdersTab"
        component={OrdersStack}
        options={{
          title: 'Orders',
          tabBarIcon: ({ color }) => (
            <Feather name="package" size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="InvoicesTab"
        component={InvoicesStack}
        options={{
          title: 'Invoices',
          tabBarIcon: ({ color }) => (
            <Feather name="file-text" size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <Feather name="user" size={24} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
