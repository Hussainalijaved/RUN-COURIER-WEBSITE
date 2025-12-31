import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
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

interface Props {
  postcodeValue: string;
  addressValue: string;
  onPostcodeChange: (postcode: string) => void;
  onAddressChange: (address: string) => void;
  onAddressSelect: (address: string, postcode: string) => void;
  onPlaceSelected?: (details: PlaceDetails) => void;
  onPlaceInvalidated?: () => void;
  hasValidPlace?: boolean;
  label?: string;
}

const getGoogleMapsApiKey = (): string => {
  try {
    const extra = Constants.expoConfig?.extra || (Constants as any).manifest?.extra || {};
    return extra.googleMapsApiKey || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  } catch {
    return '';
  }
};

declare global {
  interface Window {
    google?: any;
    initGoogleMapsCallback?: () => void;
  }
}

let googleMapsLoaded = false;
let googleMapsLoading = false;
const loadCallbacks: (() => void)[] = [];

const loadGoogleMapsScript = (apiKey: string): Promise<void> => {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web') {
      resolve();
      return;
    }

    if (googleMapsLoaded && window.google?.maps?.places) {
      resolve();
      return;
    }

    loadCallbacks.push(resolve);

    if (googleMapsLoading) {
      return;
    }

    googleMapsLoading = true;

    window.initGoogleMapsCallback = () => {
      googleMapsLoaded = true;
      googleMapsLoading = false;
      loadCallbacks.forEach(cb => cb());
      loadCallbacks.length = 0;
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMapsCallback`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  });
};

export function PostcodeAddressInput({
  postcodeValue,
  addressValue,
  onPostcodeChange,
  onAddressChange,
  onAddressSelect,
  onPlaceSelected,
  onPlaceInvalidated,
  hasValidPlace = false,
  label = 'Address',
}: Props) {
  const { theme } = useTheme();
  const [postcodeFocused, setPostcodeFocused] = useState(false);
  const [addressFocused, setAddressFocused] = useState(false);
  const [predictions, setPredictions] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const postcodeInputRef = useRef<TextInput>(null);
  const sessionTokenRef = useRef<string>(generateSessionToken());
  const autocompleteServiceRef = useRef<any>(null);
  const placesServiceRef = useRef<any>(null);
  const webSessionTokenRef = useRef<any>(null);

  function generateSessionToken(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  useEffect(() => {
    if (Platform.OS === 'web') {
      const apiKey = getGoogleMapsApiKey();
      if (apiKey) {
        loadGoogleMapsScript(apiKey).then(() => {
          if (window.google?.maps?.places) {
            autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
            const dummyDiv = document.createElement('div');
            placesServiceRef.current = new window.google.maps.places.PlacesService(dummyDiv);
            webSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
            setGoogleReady(true);
          }
        });
      }
    }
  }, []);

  const fetchAutocompleteWeb = useCallback(async (input: string) => {
    if (!autocompleteServiceRef.current || input.trim().length < 2) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);

    try {
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: input.trim(),
          componentRestrictions: { country: 'gb' },
          sessionToken: webSessionTokenRef.current,
        },
        (results: any[], status: string) => {
          setLoading(false);
          if (status === 'OK' && results) {
            const formatted: PlaceResult[] = results.map((r) => ({
              place_id: r.place_id,
              description: r.description,
              structured_formatting: r.structured_formatting,
            }));
            setPredictions(formatted);
            setShowDropdown(formatted.length > 0);
          } else {
            console.log('[PLACES WEB] Status:', status);
            setPredictions([]);
            setShowDropdown(false);
          }
        }
      );
    } catch (e: any) {
      console.log('[PLACES WEB] Error:', e.message);
      setLoading(false);
      setPredictions([]);
      setShowDropdown(false);
    }
  }, []);

  const fetchAutocompleteNative = useCallback(async (input: string) => {
    const apiKey = getGoogleMapsApiKey();
    if (!apiKey || input.trim().length < 2) {
      setPredictions([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams({
        input: input.trim(),
        key: apiKey,
        components: 'country:gb',
        sessiontoken: sessionTokenRef.current,
      });

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'OK' && data.predictions) {
          setPredictions(data.predictions);
          setShowDropdown(data.predictions.length > 0);
        } else {
          console.log('[PLACES NATIVE] Status:', data.status);
          setPredictions([]);
          setShowDropdown(false);
        }
      } else {
        console.log('[PLACES NATIVE] Failed:', response.status);
        setPredictions([]);
        setShowDropdown(false);
      }
    } catch (e: any) {
      console.log('[PLACES NATIVE] Error:', e.message);
      setPredictions([]);
      setShowDropdown(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAutocomplete = useCallback((input: string) => {
    if (Platform.OS === 'web') {
      fetchAutocompleteWeb(input);
    } else {
      fetchAutocompleteNative(input);
    }
  }, [fetchAutocompleteWeb, fetchAutocompleteNative]);

  const handlePostcodeChange = (text: string) => {
    const formatted = text.toUpperCase();
    onPostcodeChange(formatted);

    if (onPlaceInvalidated) {
      onPlaceInvalidated();
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchAutocomplete(formatted);
    }, 300);
  };

  const handleSelectPlaceWeb = async (place: PlaceResult) => {
    if (!placesServiceRef.current) {
      console.log('[PLACES WEB] PlacesService not ready');
      return;
    }

    setFetchingDetails(true);
    setShowDropdown(false);
    Keyboard.dismiss();

    try {
      placesServiceRef.current.getDetails(
        {
          placeId: place.place_id,
          fields: ['formatted_address', 'geometry', 'address_components'],
          sessionToken: webSessionTokenRef.current,
        },
        (result: any, status: string) => {
          setFetchingDetails(false);
          
          if (status === 'OK' && result) {
            const lat = result.geometry?.location?.lat();
            const lng = result.geometry?.location?.lng();
            const formattedAddress = result.formatted_address || '';

            let postcode = '';
            if (result.address_components) {
              for (const component of result.address_components) {
                if (component.types?.includes('postal_code')) {
                  postcode = component.long_name;
                  break;
                }
              }
            }

            if (!postcode && postcodeValue) {
              postcode = postcodeValue;
            }

            console.log('[PLACES WEB] Got details:', formattedAddress, lat, lng, postcode);

            if (postcode) {
              onPostcodeChange(postcode);
            }
            if (formattedAddress) {
              onAddressChange(formattedAddress);
              onAddressSelect(formattedAddress, postcode);
            }

            if (onPlaceSelected && lat && lng) {
              onPlaceSelected({
                formatted_address: formattedAddress,
                lat,
                lng,
                postcode,
              });
            }

            webSessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
          } else {
            console.log('[PLACES WEB] Details status:', status);
          }
        }
      );
    } catch (e: any) {
      console.log('[PLACES WEB] Details error:', e.message);
      setFetchingDetails(false);
    }
  };

  const handleSelectPlaceNative = async (place: PlaceResult) => {
    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      console.log('[PLACES NATIVE] No API key');
      return;
    }

    setFetchingDetails(true);
    setShowDropdown(false);
    Keyboard.dismiss();

    try {
      const params = new URLSearchParams({
        place_id: place.place_id,
        key: apiKey,
        fields: 'formatted_address,geometry,address_components',
        sessiontoken: sessionTokenRef.current,
      });

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
      );

      if (response.ok) {
        const data = await response.json();

        if (data.status === 'OK' && data.result) {
          const result = data.result;
          const lat = result.geometry?.location?.lat;
          const lng = result.geometry?.location?.lng;
          const formattedAddress = result.formatted_address || '';

          let postcode = '';
          if (result.address_components) {
            for (const component of result.address_components) {
              if (component.types?.includes('postal_code')) {
                postcode = component.long_name;
                break;
              }
            }
          }

          if (!postcode && postcodeValue) {
            postcode = postcodeValue;
          }

          console.log('[PLACES NATIVE] Got details:', formattedAddress, lat, lng, postcode);

          if (postcode) {
            onPostcodeChange(postcode);
          }
          if (formattedAddress) {
            onAddressChange(formattedAddress);
            onAddressSelect(formattedAddress, postcode);
          }

          if (onPlaceSelected && lat && lng) {
            onPlaceSelected({
              formatted_address: formattedAddress,
              lat,
              lng,
              postcode,
            });
          }

          sessionTokenRef.current = generateSessionToken();
        } else {
          console.log('[PLACES NATIVE] Details status:', data.status);
        }
      } else {
        console.log('[PLACES NATIVE] Details failed:', response.status);
      }
    } catch (e: any) {
      console.log('[PLACES NATIVE] Details error:', e.message);
    } finally {
      setFetchingDetails(false);
    }
  };

  const handleSelectPlace = (place: PlaceResult) => {
    if (Platform.OS === 'web') {
      handleSelectPlaceWeb(place);
    } else {
      handleSelectPlaceNative(place);
    }
  };

  const handlePostcodeFocus = () => {
    setPostcodeFocused(true);
    if (predictions.length > 0 && postcodeValue.length >= 2) {
      setShowDropdown(true);
    }
  };

  const handlePostcodeBlur = () => {
    setPostcodeFocused(false);
    setTimeout(() => {
      setShowDropdown(false);
    }, 200);
  };

  const handleClearPostcode = () => {
    onPostcodeChange('');
    onAddressChange('');
    setPredictions([]);
    setShowDropdown(false);
    if (onPlaceInvalidated) {
      onPlaceInvalidated();
    }
    postcodeInputRef.current?.focus();
  };

  return (
    <View style={styles.container}>
      <ThemedText style={[styles.label, { color: theme.secondaryText }]}>
        {label} Postcode
      </ThemedText>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.backgroundSecondary,
            borderColor: hasValidPlace ? theme.success : postcodeFocused ? theme.primary : theme.border,
            borderWidth: hasValidPlace ? 2 : 1,
          },
        ]}
      >
        <Feather
          name="navigation"
          size={18}
          color={hasValidPlace ? theme.success : postcodeFocused ? theme.primary : theme.secondaryText}
          style={styles.inputIcon}
        />
        <TextInput
          ref={postcodeInputRef}
          style={[styles.input, { color: theme.text }]}
          value={postcodeValue}
          onChangeText={handlePostcodeChange}
          placeholder="Enter postcode (e.g., SW1A 1AA)"
          placeholderTextColor={theme.placeholder}
          onFocus={handlePostcodeFocus}
          onBlur={handlePostcodeBlur}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {(loading || fetchingDetails) ? (
          <ActivityIndicator size="small" color={theme.primary} />
        ) : postcodeValue.length > 0 ? (
          <Pressable onPress={handleClearPostcode} hitSlop={8}>
            <Feather name="x-circle" size={18} color={theme.secondaryText} />
          </Pressable>
        ) : null}
      </View>

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

      {hasValidPlace && addressValue ? (
        <View style={styles.addressDisplay}>
          <Feather name="check-circle" size={14} color={theme.success} />
          <ThemedText style={[styles.addressText, { color: theme.secondaryText }]} numberOfLines={2}>
            {addressValue}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
    zIndex: 1000,
  },
  label: {
    fontSize: Typography.small.fontSize,
    fontWeight: '500',
    marginBottom: Spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    height: 48,
  },
  inputIcon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: Typography.body.fontSize,
    height: '100%',
  },
  dropdown: {
    position: 'absolute',
    top: 76,
    left: 0,
    right: 0,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    maxHeight: 200,
    zIndex: 1001,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      },
      default: {
        elevation: 8,
      },
    }),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  dropdownTextContainer: {
    flex: 1,
  },
  dropdownMainText: {
    fontSize: Typography.small.fontSize,
    fontWeight: '500',
  },
  dropdownSecondaryText: {
    fontSize: Typography.caption.fontSize,
    marginTop: 2,
  },
  addressDisplay: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: Spacing.xs,
    gap: Spacing.xs,
  },
  addressText: {
    flex: 1,
    fontSize: Typography.small.fontSize,
  },
});
