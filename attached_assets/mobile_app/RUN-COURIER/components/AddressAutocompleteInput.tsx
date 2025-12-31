import React, { useState, useRef, useCallback, useEffect } from 'react';
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
import Constants from 'expo-constants';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/hooks/useTheme';
import { Spacing, BorderRadius, Typography } from '@/constants/theme';

interface AddressPrediction {
  place_id: string;
  description: string;
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
}

interface AddressDetails {
  formatted_address: string;
  postcode: string;
}

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onAddressSelect: (address: string, postcode: string) => void;
  placeholder?: string;
  postcodeValue?: string;
  onPostcodeChange?: (postcode: string) => void;
}

const getGoogleMapsApiKey = (): string => {
  try {
    const extra =
      Constants.expoConfig?.extra ||
      (Constants as any).manifest?.extra ||
      (Constants as any).manifest2?.extra?.expoClient?.extra ||
      {};
    return extra.googleMapsApiKey || '';
  } catch {
    return '';
  }
};

const GOOGLE_MAPS_API_KEY = getGoogleMapsApiKey();

export function AddressAutocompleteInput({
  value,
  onChangeText,
  onAddressSelect,
  placeholder = 'Enter address',
  postcodeValue,
  onPostcodeChange,
}: Props) {
  const { theme } = useTheme();
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<string>(generateSessionToken());

  function generateSessionToken(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  const fetchPredictions = useCallback(async (input: string) => {
    if (!GOOGLE_MAPS_API_KEY || input.length < 3) {
      setPredictions([]);
      return;
    }

    setLoading(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
        input
      )}&components=country:gb&types=address&sessiontoken=${sessionTokenRef.current}&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.predictions) {
        setPredictions(data.predictions.slice(0, 5));
        setShowDropdown(true);
      } else {
        setPredictions([]);
      }
    } catch (error) {
      console.warn('Failed to fetch address predictions:', error);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTextChange = (text: string) => {
    onChangeText(text);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (text.length >= 3 && GOOGLE_MAPS_API_KEY) {
      debounceRef.current = setTimeout(() => {
        fetchPredictions(text);
      }, 300);
    } else {
      setPredictions([]);
      setShowDropdown(false);
    }
  };

  const fetchPlaceDetails = async (placeId: string): Promise<AddressDetails | null> => {
    if (!GOOGLE_MAPS_API_KEY) return null;

    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_address,address_components&sessiontoken=${sessionTokenRef.current}&key=${GOOGLE_MAPS_API_KEY}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.result) {
        const addressComponents = data.result.address_components || [];
        let postcode = '';

        for (const component of addressComponents) {
          if (component.types.includes('postal_code')) {
            postcode = component.long_name;
            break;
          }
        }

        sessionTokenRef.current = generateSessionToken();

        return {
          formatted_address: data.result.formatted_address || '',
          postcode,
        };
      }
    } catch (error) {
      console.warn('Failed to fetch place details:', error);
    }
    return null;
  };

  const handleSelectPrediction = async (prediction: AddressPrediction) => {
    Keyboard.dismiss();
    setShowDropdown(false);
    setPredictions([]);
    setLoading(true);

    const details = await fetchPlaceDetails(prediction.place_id);
    setLoading(false);

    if (details) {
      const addressWithoutPostcode = details.formatted_address
        .replace(new RegExp(`,?\\s*${details.postcode}`, 'gi'), '')
        .replace(/, UK$/, '')
        .trim();

      onChangeText(addressWithoutPostcode);
      onAddressSelect(addressWithoutPostcode, details.postcode);

      if (onPostcodeChange && details.postcode) {
        onPostcodeChange(details.postcode);
      }
    } else {
      onChangeText(prediction.description);
      onAddressSelect(prediction.description, '');
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (predictions.length > 0) {
      setShowDropdown(true);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setTimeout(() => {
      setShowDropdown(false);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const hasApiKey = !!GOOGLE_MAPS_API_KEY;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.backgroundSecondary,
            borderColor: isFocused ? theme.primary : theme.border,
          },
        ]}
      >
        <Feather
          name="map-pin"
          size={18}
          color={isFocused ? theme.primary : theme.secondaryText}
          style={styles.inputIcon}
        />
        <TextInput
          style={[
            styles.input,
            { color: theme.text },
          ]}
          value={value}
          onChangeText={handleTextChange}
          placeholder={placeholder}
          placeholderTextColor={theme.placeholder}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {loading && (
          <ActivityIndicator
            size="small"
            color={theme.primary}
            style={styles.loader}
          />
        )}
      </View>

      {showDropdown && predictions.length > 0 && (
        <View
          style={[
            styles.dropdown,
            {
              backgroundColor: theme.backgroundDefault,
              borderColor: theme.border,
            },
          ]}
        >
          {predictions.map((prediction, index) => (
            <Pressable
              key={prediction.place_id}
              style={[
                styles.predictionItem,
                index < predictions.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                },
              ]}
              onPress={() => handleSelectPrediction(prediction)}
            >
              <Feather
                name="map-pin"
                size={16}
                color={theme.secondaryText}
                style={styles.predictionIcon}
              />
              <View style={styles.predictionTextContainer}>
                <ThemedText
                  style={[styles.predictionMainText, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {prediction.structured_formatting?.main_text ||
                    prediction.description.split(',')[0]}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.predictionSecondaryText,
                    { color: theme.secondaryText },
                  ]}
                  numberOfLines={1}
                >
                  {prediction.structured_formatting?.secondary_text ||
                    prediction.description.split(',').slice(1).join(',')}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {!hasApiKey && Platform.OS === 'web' && (
        <ThemedText style={[styles.hint, { color: theme.warning }]}>
          Address suggestions require the app. Run in Expo Go for autocomplete.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 1000,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    ...Typography.body,
    paddingVertical: 0,
  },
  loader: {
    marginLeft: Spacing.sm,
  },
  dropdown: {
    position: 'absolute',
    top: Spacing.inputHeight + 4,
    left: 0,
    right: 0,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    maxHeight: 250,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    zIndex: 1001,
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  predictionIcon: {
    marginRight: Spacing.sm,
  },
  predictionTextContainer: {
    flex: 1,
  },
  predictionMainText: {
    ...Typography.body,
    fontWeight: '500',
  },
  predictionSecondaryText: {
    ...Typography.caption,
    marginTop: 2,
  },
  hint: {
    ...Typography.caption,
    marginTop: Spacing.xs,
  },
});
