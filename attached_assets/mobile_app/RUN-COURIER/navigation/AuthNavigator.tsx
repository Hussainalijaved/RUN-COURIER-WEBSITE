import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { SignupScreen } from '@/screens/auth/SignupScreen';
import { CustomerSignupScreen } from '@/screens/auth/CustomerSignupScreen';
import { ProfileSetupScreen } from '@/screens/auth/ProfileSetupScreen';
import { DocumentsUploadScreen } from '@/screens/auth/DocumentsUploadScreen';
import { ResetPasswordScreen } from '@/screens/auth/ResetPasswordScreen';
import { useAuth } from '@/context/AuthContext';

const Stack = createNativeStackNavigator();

export function AuthNavigator() {
  const { isPasswordRecovery } = useAuth();
  
  // Start at ResetPassword screen if in recovery mode
  const initialRouteName = isPasswordRecovery ? 'ResetPassword' : 'Login';
  
  return (
    <Stack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="CustomerSignup" component={CustomerSignupScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen 
        name="ProfileSetup" 
        component={ProfileSetupScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen 
        name="DocumentsUpload" 
        component={DocumentsUploadScreen}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
