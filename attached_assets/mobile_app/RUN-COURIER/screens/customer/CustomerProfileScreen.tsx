import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Alert, TextInput, Platform, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ScreenKeyboardAwareScrollView } from '@/components/ScreenKeyboardAwareScrollView';
import { ThemedText } from '@/components/ThemedText';
import { Card } from '@/components/Card';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/context/AuthContext';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';

export function CustomerProfileScreen() {
  const { theme } = useTheme();
  const { customerProfile, userRole, updateCustomerProfile, signOut, deleteCustomerAccount } = useAuth();
  
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(customerProfile?.full_name || '');
  const [phone, setPhone] = useState(customerProfile?.phone || '');
  const [address, setAddress] = useState(customerProfile?.address || '');
  const [postcode, setPostcode] = useState(customerProfile?.postcode || '');
  const [companyName, setCompanyName] = useState(customerProfile?.company_name || '');
  const [companyRegNumber, setCompanyRegNumber] = useState(customerProfile?.company_reg_number || '');
  const [companyAddress, setCompanyAddress] = useState(customerProfile?.company_address || '');
  const [contactPersonName, setContactPersonName] = useState(customerProfile?.contact_person_name || '');
  const [contactPersonPhone, setContactPersonPhone] = useState(customerProfile?.contact_person_phone || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: any = {
        full_name: fullName,
        phone,
        address,
        postcode: postcode.toUpperCase(),
      };

      if (userRole === 'business') {
        updates.company_name = companyName;
        updates.company_reg_number = companyRegNumber;
        updates.company_address = companyAddress;
        updates.contact_person_name = contactPersonName;
        updates.contact_person_phone = contactPersonPhone;
      }

      const { error } = await updateCustomerProfile(updates);
      
      if (error) {
        Alert.alert('Error', 'Failed to update profile');
      } else {
        setIsEditing(false);
        Alert.alert('Success', 'Profile updated successfully');
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    console.log('Sign out button pressed');
    
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to sign out?');
      if (confirmed) {
        console.log('Confirming sign out...');
        try {
          await signOut();
          console.log('Sign out successful');
        } catch (error) {
          console.error('Sign out error:', error);
        }
      }
    } else {
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Sign Out', 
            style: 'destructive', 
            onPress: async () => {
              console.log('Confirming sign out...');
              try {
                await signOut();
                console.log('Sign out successful');
              } catch (error) {
                console.error('Sign out error:', error);
              }
            }
          },
        ]
      );
    }
  };

  const handleDeleteAccount = async () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('This will permanently delete your account and all associated data. This action cannot be undone. Are you sure?');
      if (confirmed) {
        const { error } = await deleteCustomerAccount();
        if (error) {
          window.alert('Failed to delete account');
        }
      }
    } else {
      Alert.alert(
        'Delete Account',
        'This will permanently delete your account and all associated data. This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Delete', 
            style: 'destructive', 
            onPress: async () => {
              const { error } = await deleteCustomerAccount();
              if (error) {
                Alert.alert('Error', 'Failed to delete account');
              }
            }
          },
        ]
      );
    }
  };

  const handleWhatsAppSupport = async () => {
    // Use wa.me universal link format - App Store and Play Store compliant
    // Phone number format: country code + number without + or spaces
    const phoneNumber = '447311121217';
    const message = 'Hi, I need help with my Run Courier order.';
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    
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
      Alert.alert('Error', 'Unable to open WhatsApp. Please try again.');
    }
  };

  const inputStyle = [
    styles.input, 
    { 
      backgroundColor: isEditing ? theme.backgroundSecondary : theme.backgroundTertiary, 
      color: theme.text, 
      borderColor: theme.border 
    }
  ];

  return (
    <ScreenKeyboardAwareScrollView hasTabBar={true}>
      <Card style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText style={styles.sectionTitle}>Personal Information</ThemedText>
          {!isEditing ? (
            <Pressable onPress={() => setIsEditing(true)}>
              <Feather name="edit-2" size={20} color={theme.primary} />
            </Pressable>
          ) : null}
        </View>
        
        <View style={styles.field}>
          <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Email</ThemedText>
          <ThemedText style={styles.value}>{customerProfile?.email}</ThemedText>
        </View>
        
        <View style={styles.field}>
          <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Full Name</ThemedText>
          {isEditing ? (
            <TextInput
              style={inputStyle}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full Name"
              placeholderTextColor={theme.placeholder}
            />
          ) : (
            <ThemedText style={styles.value}>{customerProfile?.full_name || 'Not set'}</ThemedText>
          )}
        </View>
        
        <View style={styles.field}>
          <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Phone</ThemedText>
          {isEditing ? (
            <TextInput
              style={inputStyle}
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone Number"
              placeholderTextColor={theme.placeholder}
              keyboardType="phone-pad"
            />
          ) : (
            <ThemedText style={styles.value}>{customerProfile?.phone || 'Not set'}</ThemedText>
          )}
        </View>
        
        <View style={styles.field}>
          <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Address</ThemedText>
          {isEditing ? (
            <TextInput
              style={inputStyle}
              value={address}
              onChangeText={setAddress}
              placeholder="Address"
              placeholderTextColor={theme.placeholder}
            />
          ) : (
            <ThemedText style={styles.value}>{customerProfile?.address || 'Not set'}</ThemedText>
          )}
        </View>
        
        <View style={styles.field}>
          <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Postcode</ThemedText>
          {isEditing ? (
            <TextInput
              style={inputStyle}
              value={postcode}
              onChangeText={setPostcode}
              placeholder="Postcode"
              placeholderTextColor={theme.placeholder}
              autoCapitalize="characters"
            />
          ) : (
            <ThemedText style={styles.value}>{customerProfile?.postcode || 'Not set'}</ThemedText>
          )}
        </View>
      </Card>

      {userRole === 'business' ? (
        <Card style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Company Information</ThemedText>
          
          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Company Name</ThemedText>
            {isEditing ? (
              <TextInput
                style={inputStyle}
                value={companyName}
                onChangeText={setCompanyName}
                placeholder="Company Name"
                placeholderTextColor={theme.placeholder}
              />
            ) : (
              <ThemedText style={styles.value}>{customerProfile?.company_name || 'Not set'}</ThemedText>
            )}
          </View>
          
          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Registration Number</ThemedText>
            {isEditing ? (
              <TextInput
                style={inputStyle}
                value={companyRegNumber}
                onChangeText={setCompanyRegNumber}
                placeholder="Company Registration Number"
                placeholderTextColor={theme.placeholder}
              />
            ) : (
              <ThemedText style={styles.value}>{customerProfile?.company_reg_number || 'Not set'}</ThemedText>
            )}
          </View>
          
          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Company Address</ThemedText>
            {isEditing ? (
              <TextInput
                style={inputStyle}
                value={companyAddress}
                onChangeText={setCompanyAddress}
                placeholder="Company Address"
                placeholderTextColor={theme.placeholder}
              />
            ) : (
              <ThemedText style={styles.value}>{customerProfile?.company_address || 'Not set'}</ThemedText>
            )}
          </View>
          
          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Contact Person</ThemedText>
            {isEditing ? (
              <TextInput
                style={inputStyle}
                value={contactPersonName}
                onChangeText={setContactPersonName}
                placeholder="Contact Person Name"
                placeholderTextColor={theme.placeholder}
              />
            ) : (
              <ThemedText style={styles.value}>{customerProfile?.contact_person_name || 'Not set'}</ThemedText>
            )}
          </View>
          
          <View style={styles.field}>
            <ThemedText style={[styles.label, { color: theme.secondaryText }]}>Contact Phone</ThemedText>
            {isEditing ? (
              <TextInput
                style={inputStyle}
                value={contactPersonPhone}
                onChangeText={setContactPersonPhone}
                placeholder="Contact Person Phone"
                placeholderTextColor={theme.placeholder}
                keyboardType="phone-pad"
              />
            ) : (
              <ThemedText style={styles.value}>{customerProfile?.contact_person_phone || 'Not set'}</ThemedText>
            )}
          </View>
        </Card>
      ) : null}

      {isEditing ? (
        <View style={styles.editButtons}>
          <Pressable
            style={[styles.cancelButton, { borderColor: theme.border }]}
            onPress={() => setIsEditing(false)}
          >
            <ThemedText>Cancel</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.saveButton, { backgroundColor: theme.primary }, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <ThemedText style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Save Changes'}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      <Card style={styles.supportSection}>
        <ThemedText style={styles.supportTitle}>Need Help?</ThemedText>
        <Pressable
          style={[styles.whatsappButton, { backgroundColor: '#25D366' }]}
          onPress={handleWhatsAppSupport}
        >
          <Feather name="message-circle" size={20} color="#fff" />
          <ThemedText style={styles.whatsappButtonText}>Chat with Run Courier on WhatsApp</ThemedText>
        </Pressable>
      </Card>

      <View style={styles.accountSection}>
        <Pressable
          style={[styles.signOutButton, { borderColor: theme.border }]}
          onPress={handleSignOut}
        >
          <Feather name="log-out" size={20} color={theme.text} />
          <ThemedText>Sign Out</ThemedText>
        </Pressable>
        
        <Pressable
          style={[styles.deleteButton, { borderColor: theme.error }]}
          onPress={handleDeleteAccount}
        >
          <Feather name="trash-2" size={16} color={theme.error} />
          <ThemedText style={[styles.deleteButtonText, { color: theme.error }]}>Delete Account</ThemedText>
        </Pressable>
      </View>
    </ScreenKeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  section: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.h4,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.caption,
    marginBottom: Spacing.xs,
  },
  value: {
    ...Typography.body,
  },
  input: {
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    ...Typography.body,
  },
  editButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing['2xl'],
  },
  cancelButton: {
    flex: 1,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flex: 2,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    ...Typography.button,
    color: '#fff',
  },
  accountSection: {
    gap: Spacing.md,
    marginBottom: Spacing['3xl'],
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 40,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  deleteButtonText: {
    ...Typography.caption,
  },
  supportSection: {
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  supportTitle: {
    ...Typography.h4,
    marginBottom: Spacing.md,
  },
  whatsappButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
  },
  whatsappButtonText: {
    ...Typography.button,
    color: '#fff',
  },
});
