import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ThemedText } from './ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';
import Constants from 'expo-constants';

type PlaceResult = {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
};

type PlaceDetails = {
  formatted_address: string;
  lat: number;
  lng: number;
  postcode: string;
};

interface PlacesAutocompleteProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  onPlaceSelected: (details: PlaceDetails) => void;
  onClear?: () => void;
  error?: string;
  hasSelectedPlace?: boolean;
}

const getApiUrl = (): string | null => {
  const extra = Constants.expoConfig?.extra as any;
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || extra?.apiUrl;
  return apiUrl || null;
};

export function PlacesAutocomplete({
  placeholder = 'Enter postcode or address',
  value,
  onChangeText,
  onPlaceSelected,
  onClear,
  error,
  hasSelectedPlace = false,
}: PlacesAutocompleteProps) {
  const { theme } = useTheme();
  const [predictions, setPredictions] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<TextInput>(null);

  const fetchAutocomplete = useCallback(async (input: string) => {
    const apiUrl = getApiUrl();
    if (!apiUrl || input.trim().length < 2) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    try {
      console.log('[PLACES] Fetching autocomplete for:', input);
      const response = await fetch(`${apiUrl}/api/places/autocomplete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[PLACES] Got predictions:', data.predictions?.length || 0);
        setPredictions(data.predictions || []);
        setShowDropdown(data.predictions?.length > 0);
      } else {
        console.log('[PLACES] Autocomplete failed:', response.status);
        setPredictions([]);
        setShowDropdown(false);
      }
    } catch (e: any) {
      console.log('[PLACES] Autocomplete error:', e.message);
      setPredictions([]);
      setShowDropdown(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTextChange = (text: string) => {
    onChangeText(text);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchAutocomplete(text);
    }, 300);
  };

  const handleSelectPlace = async (place: PlaceResult) => {
    const apiUrl = getApiUrl();
    if (!apiUrl) return;

    setFetchingDetails(true);
    setShowDropdown(false);
    Keyboard.dismiss();

    try {
      console.log('[PLACES] Fetching details for:', place.place_id);
      const response = await fetch(`${apiUrl}/api/places/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place_id: place.place_id }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[PLACES] Got details:', data.formatted_address, data.lat, data.lng);
        
        const displayText = data.postcode || data.formatted_address;
        onChangeText(displayText);
        
        onPlaceSelected({
          formatted_address: data.formatted_address,
          lat: data.lat,
          lng: data.lng,
          postcode: data.postcode || '',
        });
      } else {
        console.log('[PLACES] Details failed:', response.status);
      }
    } catch (e: any) {
      console.log('[PLACES] Details error:', e.message);
    } finally {
      setFetchingDetails(false);
    }
  };

  const handleClear = () => {
    onChangeText('');
    setPredictions([]);
    setShowDropdown(false);
    if (onClear) onClear();
    inputRef.current?.focus();
  };

  const handleFocus = () => {
    if (predictions.length > 0 && value.length >= 2) {
      setShowDropdown(true);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setShowDropdown(false);
    }, 200);
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.backgroundSecondary,
            borderColor: error ? theme.error : hasSelectedPlace ? theme.success : theme.border,
            borderWidth: hasSelectedPlace ? 2 : 1,
          },
        ]}
      >
        <Feather
          name="map-pin"
          size={18}
          color={hasSelectedPlace ? theme.success : theme.secondaryText}
          style={styles.icon}
        />
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: theme.text }]}
          placeholder={placeholder}
          placeholderTextColor={theme.placeholder}
          value={value}
          onChangeText={handleTextChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
        />
        {(loading || fetchingDetails) ? (
          <ActivityIndicator size="small" color={theme.primary} style={styles.clearButton} />
        ) : value.length > 0 ? (
          <Pressable onPress={handleClear} style={styles.clearButton}>
            <Feather name="x-circle" size={18} color={theme.secondaryText} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <ThemedText style={[styles.errorText, { color: theme.error }]}>
          {error}
        </ThemedText>
      ) : null}

      {showDropdown && predictions.length > 0 ? (
        <View
          style={[
            styles.dropdown,
            {
              backgroundColor: theme.backgroundDefault,
              borderColor: theme.border,
            },
          ]}
        >
          {predictions.map((item, index) => (
            <Pressable
              key={item.place_id}
              style={[
                styles.dropdownItem,
                index < predictions.length - 1 && {
                  borderBottomColor: theme.border,
                  borderBottomWidth: 1,
                },
              ]}
              onPress={() => handleSelectPlace(item)}
            >
              <Feather name="map-pin" size={14} color={theme.secondaryText} />
              <View style={styles.dropdownTextContainer}>
                <ThemedText style={styles.dropdownMainText} numberOfLines={1}>
                  {item.structured_formatting?.main_text || item.description}
                </ThemedText>
                {item.structured_formatting?.secondary_text ? (
                  <ThemedText
                    style={[styles.dropdownSecondaryText, { color: theme.secondaryText }]}
                    numberOfLines={1}
                  >
                    {item.structured_formatting.secondary_text}
                  </ThemedText>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    ...Typography.body,
    height: '100%',
  },
  clearButton: {
    padding: Spacing.xs,
  },
  errorText: {
    ...Typography.small,
    marginTop: Spacing.xs,
  },
  dropdown: {
    position: 'absolute',
    top: Spacing.inputHeight + Spacing.xs,
    left: 0,
    right: 0,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    maxHeight: 250,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      },
    }),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  dropdownTextContainer: {
    flex: 1,
  },
  dropdownMainText: {
    ...Typography.bodyMedium,
  },
  dropdownSecondaryText: {
    ...Typography.small,
    marginTop: 2,
  },
});
