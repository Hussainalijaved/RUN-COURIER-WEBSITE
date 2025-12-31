import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Switch, Alert, Platform, Modal, TextInput, ActivityIndicator, ScrollView, Linking } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ScreenScrollView } from '@/components/ScreenScrollView';
import { Spacing, BorderRadius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useSoundAlarm, setSoundEnabled as setGlobalSoundEnabled } from '@/hooks/useSoundAlarm';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL || '';

const SUPPORT_PHONE = '+447311121217';
const SUPPORT_EMAIL = 'support@runcourier.co.uk';

export function SettingsScreen({ navigation }: any) {
  const { theme } = useTheme();
  const { user, driver, signOut } = useAuth();
  const { testAlarm } = useSoundAlarm();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [testingSound, setTestingSound] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const showError = (message: string) => {
    if (Platform.OS === 'web') {
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(''), 4000);
    } else {
      Alert.alert('Error', message);
    }
  };

  const showSuccess = (message: string, callback?: () => void) => {
    if (Platform.OS === 'web') {
      setSuccessMessage(message);
      setTimeout(() => {
        setSuccessMessage('');
        if (callback) callback();
      }, 2000);
    } else {
      Alert.alert('Success', message, [
        { text: 'OK', onPress: callback }
      ]);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      showError('Please enter a new password');
      return;
    }

    if (newPassword.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        console.error('Password update error:', error);
        showError(error.message || 'Failed to update password');
        return;
      }

      showSuccess('Password updated successfully!', () => {
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      });
    } catch (error: any) {
      console.error('Password change error:', error);
      showError(error.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const openChangePasswordModal = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrorMessage('');
    setSuccessMessage('');
    setShowPasswordModal(true);
  };

  const openDeleteModal = () => {
    setDeleteConfirmText('');
    setErrorMessage('');
    setShowDeleteModal(true);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toUpperCase() !== 'DELETE') {
      showError('Please type DELETE to confirm');
      return;
    }

    setDeletingAccount(true);

    try {
      // Get the current session token
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        showError('Session expired. Please sign in again.');
        return;
      }

      // Call backend API to delete account from auth.users
      // This ensures the user can re-register with the same email
      if (API_URL) {
        console.log('[DELETE ACCOUNT] Calling API to delete from auth.users...');
        
        const response = await fetch(`${API_URL}/api/account/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          console.error('[DELETE ACCOUNT] API error:', result.error);
          showError('Unable to delete account completely. Please contact support at support@runcourier.co.uk');
          setDeletingAccount(false);
          return;
        }
        
        console.log('[DELETE ACCOUNT] Success:', result.message);
        setShowDeleteModal(false);
        
        // Show success feedback before signing out
        if (Platform.OS === 'web') {
          setSuccessMessage('Your account has been permanently deleted.');
          setTimeout(async () => {
            setSuccessMessage('');
            await signOut();
          }, 2000);
        } else {
          Alert.alert(
            'Account Deleted',
            'Your account has been permanently deleted. You can re-register with the same email if you wish.',
            [{ text: 'OK', onPress: () => signOut() }]
          );
        }
      } else {
        // No API URL configured - cannot proceed safely
        console.error('[DELETE ACCOUNT] No API URL configured');
        showError('Account deletion is currently unavailable. Please contact support at support@runcourier.co.uk');
        setDeletingAccount(false);
        return;
      }
      
    } catch (error: any) {
      console.error('Delete account error:', error);
      showError(error.message || 'Failed to delete account. Please contact support.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleCallSupport = async () => {
    const phoneUrl = `tel:${SUPPORT_PHONE}`;
    try {
      const canOpen = await Linking.canOpenURL(phoneUrl);
      if (canOpen) {
        await Linking.openURL(phoneUrl);
      } else {
        if (Platform.OS === 'web') {
          showError('Phone calls are not supported on web. Please use the message option or call ' + SUPPORT_PHONE + ' directly.');
        } else {
          showError('Unable to make phone calls on this device.');
        }
      }
    } catch (error) {
      console.error('Error opening phone:', error);
      showError('Unable to open phone app.');
    }
  };

  const handleWhatsAppSupport = async (message?: string) => {
    // Use wa.me universal link format - App Store and Play Store compliant
    // Phone number format: country code + number without + or spaces
    const phoneNumber = '447311121217';
    let whatsappUrl = `https://wa.me/${phoneNumber}`;
    
    // Add pre-filled message if provided
    if (message) {
      whatsappUrl += `?text=${encodeURIComponent(message)}`;
    }
    
    try {
      if (Platform.OS === 'web') {
        window.open(whatsappUrl, '_blank');
        return;
      }
      
      // wa.me universal link works on both iOS and Android
      // Opens WhatsApp app if installed, otherwise opens WhatsApp Web
      await Linking.openURL(whatsappUrl);
    } catch (error) {
      console.error('Error opening WhatsApp:', error);
      showError('Unable to open WhatsApp. Please try again.');
    }
  };

  const handleMessageSupport = async () => {
    const smsUrl = `sms:${SUPPORT_PHONE}`;
    
    try {
      const canOpenSms = await Linking.canOpenURL(smsUrl);
      if (canOpenSms) {
        await Linking.openURL(smsUrl);
        return;
      }
      
      if (Platform.OS === 'web') {
        showError('SMS is not supported on web. Please use WhatsApp or call ' + SUPPORT_PHONE + ' directly.');
      } else {
        showError('Unable to open messaging app.');
      }
    } catch (error) {
      console.error('Error opening messaging:', error);
      showError('Unable to open messaging app.');
    }
  };

  const handleEmailSupport = async () => {
    const emailUrl = `mailto:${SUPPORT_EMAIL}`;
    try {
      const canOpen = await Linking.canOpenURL(emailUrl);
      if (canOpen) {
        await Linking.openURL(emailUrl);
      } else {
        if (Platform.OS === 'web') {
          window.open(emailUrl, '_blank');
        } else {
          showError('Unable to open email app. Please email ' + SUPPORT_EMAIL + ' directly.');
        }
      }
    } catch (error) {
      console.error('Error opening email:', error);
      showError('Unable to open email app. Please email ' + SUPPORT_EMAIL + ' directly.');
    }
  };

  return (
    <ScreenScrollView style={[styles.container, { backgroundColor: theme.backgroundRoot }]} hasTabBar={true}>
      <View style={styles.content}>
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Notifications</ThemedText>
          
          <ThemedView style={styles.settingItem} >
            <View style={styles.settingContent}>
              <Feather name="bell" size={20} color={theme.text} />
              <View style={styles.settingText}>
                <ThemedText style={styles.settingLabel}>Push Notifications</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: theme.secondaryText }]}>
                  Receive notifications for new jobs
                </ThemedText>
              </View>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={setPushEnabled}
              trackColor={{ false: theme.backgroundSecondary, true: theme.primary }}
              thumbColor="#fff"
            />
          </ThemedView>

          <ThemedView style={styles.settingItem} >
            <View style={styles.settingContent}>
              <Feather name="volume-2" size={20} color={theme.text} />
              <View style={styles.settingText}>
                <ThemedText style={styles.settingLabel}>Sound Alerts</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: theme.secondaryText }]}>
                  Play sound for new job alerts
                </ThemedText>
              </View>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={(value) => {
                setSoundEnabled(value);
                setGlobalSoundEnabled(value);
              }}
              trackColor={{ false: theme.backgroundSecondary, true: theme.primary }}
              thumbColor="#fff"
            />
          </ThemedView>

          <Pressable
            style={({ pressed }) => [
              styles.testSoundButton,
              { 
                backgroundColor: theme.primary,
                opacity: pressed || testingSound ? 0.7 : 1 
              }
            ]}
            onPress={async () => {
              setTestingSound(true);
              await testAlarm();
              setTimeout(() => setTestingSound(false), 1000);
            }}
            disabled={testingSound}
          >
            <Feather name="play-circle" size={20} color="#fff" />
            <ThemedText style={styles.testSoundButtonText}>
              {testingSound ? 'Playing...' : 'Test Alarm Sound'}
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Support</ThemedText>
          
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              { opacity: pressed ? 0.7 : 1 }
            ]}
            onPress={handleCallSupport}
          >
            <View style={styles.menuItemContent}>
              <Feather name="phone" size={20} color={theme.primary} />
              <View style={styles.settingText}>
                <ThemedText style={styles.menuLabel}>Call Support</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: theme.secondaryText }]}>
                  {SUPPORT_PHONE}
                </ThemedText>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={theme.secondaryText} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              { opacity: pressed ? 0.7 : 1 }
            ]}
            onPress={() => handleWhatsAppSupport('Hi, I need help with the Run Courier app.')}
          >
            <View style={styles.menuItemContent}>
              <Feather name="message-circle" size={20} color="#25D366" />
              <View style={styles.settingText}>
                <ThemedText style={styles.menuLabel}>Chat with Run Courier on WhatsApp</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: theme.secondaryText }]}>
                  Get instant support
                </ThemedText>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={theme.secondaryText} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              { opacity: pressed ? 0.7 : 1 }
            ]}
            onPress={handleMessageSupport}
          >
            <View style={styles.menuItemContent}>
              <Feather name="smartphone" size={20} color={theme.primary} />
              <View style={styles.settingText}>
                <ThemedText style={styles.menuLabel}>SMS Support</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: theme.secondaryText }]}>
                  Send a text message
                </ThemedText>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={theme.secondaryText} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              { opacity: pressed ? 0.7 : 1 }
            ]}
            onPress={handleEmailSupport}
          >
            <View style={styles.menuItemContent}>
              <Feather name="mail" size={20} color={theme.primary} />
              <View style={styles.settingText}>
                <ThemedText style={styles.menuLabel}>Email Support</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: theme.secondaryText }]}>
                  {SUPPORT_EMAIL}
                </ThemedText>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={theme.secondaryText} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Account</ThemedText>
          
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              { opacity: pressed ? 0.7 : 1 }
            ]}
            onPress={openChangePasswordModal}
          >
            <View style={styles.menuItemContent}>
              <Feather name="lock" size={20} color={theme.text} />
              <ThemedText style={styles.menuLabel}>Change Password</ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.secondaryText} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              { opacity: pressed ? 0.7 : 1 }
            ]}
            onPress={openDeleteModal}
          >
            <View style={styles.menuItemContent}>
              <Feather name="trash-2" size={20} color={theme.error} />
              <ThemedText style={[styles.menuLabel, { color: theme.error }]}>
                Delete Account
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.error} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>About</ThemedText>
          
          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              { opacity: pressed ? 0.7 : 1 }
            ]}
            onPress={() => setShowPrivacyModal(true)}
          >
            <View style={styles.menuItemContent}>
              <Feather name="shield" size={20} color={theme.text} />
              <ThemedText style={styles.menuLabel}>Privacy Policy</ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.secondaryText} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.menuItem,
              { opacity: pressed ? 0.7 : 1 }
            ]}
            onPress={() => setShowTermsModal(true)}
          >
            <View style={styles.menuItemContent}>
              <Feather name="file-text" size={20} color={theme.text} />
              <ThemedText style={styles.menuLabel}>Terms of Service</ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.secondaryText} />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={showPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowPasswordModal(false)}
        >
          <Pressable 
            style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Change Password</ThemedText>
              <Pressable onPress={() => setShowPasswordModal(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>

            {errorMessage ? (
              <View style={[styles.messageBanner, { backgroundColor: theme.error }]}>
                <Feather name="alert-circle" size={16} color="#fff" />
                <ThemedText style={styles.messageText}>{errorMessage}</ThemedText>
              </View>
            ) : null}

            {successMessage ? (
              <View style={[styles.messageBanner, { backgroundColor: theme.success }]}>
                <Feather name="check-circle" size={16} color="#fff" />
                <ThemedText style={styles.messageText}>{successMessage}</ThemedText>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.inputLabel, { color: theme.secondaryText }]}>
                New Password
              </ThemedText>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={[styles.passwordInput, { 
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    borderColor: theme.backgroundSecondary,
                  }]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor={theme.secondaryText}
                  secureTextEntry={!showNewPassword}
                />
                <Pressable 
                  style={styles.eyeButton}
                  onPress={() => setShowNewPassword(!showNewPassword)}
                >
                  <Feather 
                    name={showNewPassword ? "eye-off" : "eye"} 
                    size={20} 
                    color={theme.secondaryText} 
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.inputLabel, { color: theme.secondaryText }]}>
                Confirm New Password
              </ThemedText>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={[styles.passwordInput, { 
                    backgroundColor: theme.backgroundSecondary,
                    color: theme.text,
                    borderColor: theme.backgroundSecondary,
                  }]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor={theme.secondaryText}
                  secureTextEntry={!showConfirmPassword}
                />
                <Pressable 
                  style={styles.eyeButton}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  <Feather 
                    name={showConfirmPassword ? "eye-off" : "eye"} 
                    size={20} 
                    color={theme.secondaryText} 
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.cancelButton, { borderColor: theme.backgroundSecondary }]}
                onPress={() => setShowPasswordModal(false)}
                disabled={loading}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </Pressable>
              
              <Pressable
                style={[styles.saveButton, { backgroundColor: theme.primary, opacity: loading ? 0.7 : 1 }]}
                onPress={handleChangePassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.saveButtonText}>Update Password</ThemedText>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowDeleteModal(false)}
        >
          <Pressable 
            style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <ThemedText style={[styles.modalTitle, { color: theme.error }]}>Delete Account</ThemedText>
              <Pressable onPress={() => setShowDeleteModal(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>

            <View style={styles.deleteWarning}>
              <Feather name="alert-triangle" size={48} color={theme.error} />
              <ThemedText style={[styles.deleteWarningTitle, { color: theme.error }]}>
                This action cannot be undone
              </ThemedText>
              <ThemedText style={[styles.deleteWarningText, { color: theme.secondaryText }]}>
                Deleting your account will permanently remove all your data including your profile, documents, and job history.
              </ThemedText>
            </View>

            {errorMessage ? (
              <View style={[styles.messageBanner, { backgroundColor: theme.error }]}>
                <Feather name="alert-circle" size={16} color="#fff" />
                <ThemedText style={styles.messageText}>{errorMessage}</ThemedText>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <ThemedText style={[styles.inputLabel, { color: theme.secondaryText }]}>
                Type DELETE to confirm
              </ThemedText>
              <TextInput
                style={[styles.deleteInput, { 
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  borderColor: theme.error,
                }]}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder="Type DELETE"
                placeholderTextColor={theme.secondaryText}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.cancelButton, { borderColor: theme.backgroundSecondary }]}
                onPress={() => setShowDeleteModal(false)}
                disabled={deletingAccount}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </Pressable>
              
              <Pressable
                style={[styles.deleteButton, { backgroundColor: theme.error, opacity: deletingAccount ? 0.7 : 1 }]}
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText style={styles.deleteButtonText}>Delete Account</ThemedText>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showPrivacyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPrivacyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable 
            style={styles.modalOverlayTouchable} 
            onPress={() => setShowPrivacyModal(false)}
          />
          <View 
            style={[styles.policyModalContent, { backgroundColor: theme.backgroundDefault }]}
          >
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Privacy Policy</ThemedText>
              <Pressable onPress={() => setShowPrivacyModal(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView 
              style={styles.policyContent} 
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              bounces={true}
            >
              <ThemedText style={[styles.policyDate, { color: theme.secondaryText }]}>
                Last updated: December 2025
              </ThemedText>
              
              <ThemedText style={styles.policySection}>1. Information We Collect</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                We collect information you provide directly, including your name, email, phone number, location data, vehicle information, and documents required for driver verification.
              </ThemedText>

              <ThemedText style={styles.policySection}>2. How We Use Your Information</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                Your information is used to provide courier services, verify your identity, process payments, improve our services, and communicate with you about jobs and updates.
              </ThemedText>

              <ThemedText style={styles.policySection}>3. Location Data</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                We collect real-time location data during active deliveries to track progress and provide accurate ETAs to customers. Location tracking is only active during job execution.
              </ThemedText>

              <ThemedText style={styles.policySection}>4. Data Security</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                We implement industry-standard security measures to protect your personal information. Your documents and data are encrypted and stored securely.
              </ThemedText>

              <ThemedText style={styles.policySection}>5. Your Rights</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                Under applicable data protection laws, including the General Data Protection Regulation (GDPR), you have the right to access, rectify, port, and erase your personal data. You may exercise these rights directly within the app or by contacting us.
              </ThemedText>

              <ThemedText style={styles.policySection}>6. Account Deletion</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                You may delete your account at any time directly within the Run Courier app. No contact with support is required.
              </ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                To delete your account, navigate to: Settings, then scroll to Account, then tap Delete Account. Follow the on-screen confirmation steps.
              </ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                Upon deletion, your account and all associated personal data will be permanently removed from our systems. This includes your profile information, documents, delivery history, and any other data linked to your account.
              </ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                Please note that certain data may be retained for a limited period where required by law, such as financial records for tax purposes or data necessary to comply with legal obligations. Such retained data will be securely stored and deleted once the retention period expires.
              </ThemedText>

              <ThemedText style={styles.policySection}>7. Contact Us</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                For privacy inquiries, please contact us at support@runcourier.co.uk
              </ThemedText>
            </ScrollView>

            <Pressable
              style={[styles.policyCloseButton, { backgroundColor: theme.primary }]}
              onPress={() => setShowPrivacyModal(false)}
            >
              <ThemedText style={styles.policyCloseButtonText}>Close</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showTermsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable 
            style={styles.modalOverlayTouchable} 
            onPress={() => setShowTermsModal(false)}
          />
          <View 
            style={[styles.policyModalContent, { backgroundColor: theme.backgroundDefault }]}
          >
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Terms of Service</ThemedText>
              <Pressable onPress={() => setShowTermsModal(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView 
              style={styles.policyContent} 
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              bounces={true}
            >
              <ThemedText style={[styles.policyDate, { color: theme.secondaryText }]}>
                Last updated: November 2025
              </ThemedText>
              
              <ThemedText style={styles.policySection}>1. Acceptance of Terms</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                By using the Run Courier Driver app, you agree to these Terms of Service. If you do not agree, please do not use our services.
              </ThemedText>

              <ThemedText style={styles.policySection}>2. Driver Requirements</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                You must be at least 18 years old, hold a valid driving licence, have appropriate insurance, and pass our verification process to use this app as a driver.
              </ThemedText>

              <ThemedText style={styles.policySection}>3. Job Acceptance</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                Jobs are assigned by administrators. You may accept or reject assigned jobs. Once accepted, you are expected to complete the delivery professionally and on time.
              </ThemedText>

              <ThemedText style={styles.policySection}>4. Payment</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                Payment for completed jobs will be processed according to the agreed rates. Payments are made to the bank account you provide in your profile.
              </ThemedText>

              <ThemedText style={styles.policySection}>5. Conduct</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                You must conduct yourself professionally, handle packages with care, and maintain good communication with customers and support.
              </ThemedText>

              <ThemedText style={styles.policySection}>6. Termination</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                We reserve the right to suspend or terminate your account for violation of these terms or any misconduct.
              </ThemedText>

              <ThemedText style={styles.policySection}>7. Contact</ThemedText>
              <ThemedText style={[styles.policyText, { color: theme.secondaryText }]}>
                For questions about these terms, contact us at support@runcourier.co.uk
              </ThemedText>
            </ScrollView>

            <Pressable
              style={[styles.policyCloseButton, { backgroundColor: theme.primary }]}
              onPress={() => setShowTermsModal(false)}
            >
              <ThemedText style={styles.policyCloseButtonText}>Close</ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginBottom: Spacing['2xl'],
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  settingText: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    marginBottom: Spacing.xs,
  },
  settingDescription: {
    fontSize: 15,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  menuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  menuLabel: {
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalOverlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  messageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  messageText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '500',
    flex: 1,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: 17,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  passwordInputContainer: {
    position: 'relative',
  },
  passwordInput: {
    height: 50,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingRight: 50,
    fontSize: 16,
  },
  eyeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    height: 50,
    width: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    height: 50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    height: 50,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteWarning: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
  },
  deleteWarningTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  deleteWarningText: {
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 20,
  },
  deleteInput: {
    height: 50,
    borderWidth: 2,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  deleteButton: {
    flex: 1,
    height: 50,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  policyModalContent: {
    width: '100%',
    maxWidth: 400,
    height: '85%',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
  },
  policyContent: {
    flex: 1,
    marginBottom: Spacing.lg,
  },
  policyDate: {
    fontSize: 15,
    marginBottom: Spacing.lg,
  },
  policySection: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  policyText: {
    fontSize: 17,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  policyCloseButton: {
    height: 50,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  policyCloseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  testSoundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  testSoundButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
});
