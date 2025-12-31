import React, { useRef, useState, useImperativeHandle, forwardRef, useEffect } from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { ThemedText } from '@/components/ThemedText';
import { Feather } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';
import { captureRef } from 'react-native-view-shot';

export interface SignaturePadRef {
  clear: () => void;
  isEmpty: () => boolean;
  getSignatureData: () => Promise<string | null>;
}

interface SignaturePadProps {
  onSignatureChange?: (hasSignature: boolean) => void;
  height?: number;
}

const WebFallbackSignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  ({ onSignatureChange, height = 200 }, ref) => {
    const { theme } = useTheme();
    const [hasDrawn, setHasDrawn] = useState(false);

    useImperativeHandle(ref, () => ({
      clear: () => {
        setHasDrawn(false);
        onSignatureChange?.(false);
      },
      isEmpty: () => !hasDrawn,
      getSignatureData: async () => hasDrawn ? 'web-signature-placeholder' : null,
    }));

    return (
      <View style={styles.container}>
        <View style={[styles.canvasContainer, { borderColor: theme.backgroundSecondary, height }]}>
          <View style={styles.placeholder}>
            <Feather name="edit-3" size={32} color={theme.secondaryText} />
            <ThemedText style={[styles.placeholderText, { color: theme.secondaryText, marginTop: Spacing.sm }]}>
              Signature capture available in Expo Go
            </ThemedText>
            <ThemedText style={[styles.placeholderSubtext, { color: theme.secondaryText }]}>
              (Optional - tap below to mark as signed)
            </ThemedText>
          </View>
        </View>
        <Pressable 
          onPress={() => {
            setHasDrawn(!hasDrawn);
            onSignatureChange?.(!hasDrawn);
          }} 
          style={[styles.clearButton, hasDrawn ? { backgroundColor: theme.primary + '20' } : undefined]}
        >
          <Feather name={hasDrawn ? "check-circle" : "edit"} size={16} color={hasDrawn ? theme.primary : theme.secondaryText} />
          <ThemedText style={[styles.clearText, { color: hasDrawn ? theme.primary : theme.secondaryText }]}>
            {hasDrawn ? 'Signed (tap to clear)' : 'Mark as Signed'}
          </ThemedText>
        </Pressable>
      </View>
    );
  }
);

function FallbackPadInner({ height, onSignatureChange }: { height: number; onSignatureChange?: (hasSignature: boolean) => void }) {
  const { theme } = useTheme();
  const [hasDrawn, setHasDrawn] = useState(false);

  return (
    <View style={styles.container}>
      <View style={[styles.canvasContainer, { borderColor: theme.backgroundSecondary, height }]}>
        <View style={styles.placeholder}>
          <Feather name="edit-3" size={32} color={theme.secondaryText} />
          <ThemedText style={[styles.placeholderText, { color: theme.secondaryText, marginTop: Spacing.sm }]}>
            Signature capture requires native build
          </ThemedText>
          <ThemedText style={[styles.placeholderSubtext, { color: theme.secondaryText }]}>
            (Optional - tap below to mark as signed)
          </ThemedText>
        </View>
      </View>
      <Pressable 
        onPress={() => {
          setHasDrawn(!hasDrawn);
          onSignatureChange?.(!hasDrawn);
        }} 
        style={[styles.clearButton, hasDrawn ? { backgroundColor: theme.primary + '20' } : undefined]}
      >
        <Feather name={hasDrawn ? "check-circle" : "edit"} size={16} color={hasDrawn ? theme.primary : theme.secondaryText} />
        <ThemedText style={[styles.clearText, { color: hasDrawn ? theme.primary : theme.secondaryText }]}>
          {hasDrawn ? 'Signed (tap to clear)' : 'Mark as Signed'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const NativeSignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  ({ onSignatureChange, height = 200 }, ref) => {
    const { theme } = useTheme();
    const [paths, setPaths] = useState<any[]>([]);
    const [skiaAvailable, setSkiaAvailable] = useState<boolean | null>(null);
    const [skiaError, setSkiaError] = useState<boolean>(false);
    const currentPath = useRef<any>(null);
    const canvasContainerRef = useRef<View>(null);
    const SkiaModules = useRef<any>(null);
    const GestureModules = useRef<any>(null);

    useEffect(() => {
      let mounted = true;
      const loadSkia = async () => {
        try {
          const skia = require('@shopify/react-native-skia');
          const gesture = require('react-native-gesture-handler');
          
          if (!skia?.Canvas || !skia?.Path || !skia?.Skia) {
            throw new Error('Skia modules not properly loaded');
          }
          if (!gesture?.Gesture || !gesture?.GestureDetector) {
            throw new Error('Gesture modules not properly loaded');
          }
          
          if (mounted) {
            SkiaModules.current = skia;
            GestureModules.current = gesture;
            setSkiaAvailable(true);
          }
        } catch (error) {
          console.log('Skia not available, using fallback:', error);
          if (mounted) {
            setSkiaAvailable(false);
            setSkiaError(true);
          }
        }
      };
      loadSkia();
      return () => { mounted = false; };
    }, []);

    useImperativeHandle(ref, () => ({
      clear: () => {
        setPaths([]);
        currentPath.current = null;
        onSignatureChange?.(false);
      },
      isEmpty: () => paths.length === 0,
      getSignatureData: async () => {
        if (paths.length === 0) return null;
        
        try {
          if (canvasContainerRef.current) {
            console.log('[SIGNATURE] Capturing signature via view-shot...');
            const uri = await captureRef(canvasContainerRef, {
              format: 'png',
              quality: 1,
              result: 'tmpfile',
            });
            console.log('[SIGNATURE] Captured to:', uri);
            return uri;
          }
          
          console.log('[SIGNATURE] Canvas ref not available');
          return null;
        } catch (error) {
          console.error('[SIGNATURE] Error capturing signature:', error);
          return null;
        }
      },
    }));

    const handleClear = () => {
      setPaths([]);
      currentPath.current = null;
      onSignatureChange?.(false);
    };

    if (skiaAvailable === null) {
      return (
        <View style={styles.container}>
          <View style={[styles.canvasContainer, { borderColor: theme.backgroundSecondary, height }]}>
            <View style={styles.placeholder}>
              <ThemedText style={[styles.placeholderText, { color: theme.secondaryText }]}>
                Loading signature pad...
              </ThemedText>
            </View>
          </View>
        </View>
      );
    }

    if (skiaAvailable === false || skiaError) {
      return <FallbackPadInner height={height} onSignatureChange={onSignatureChange} />;
    }

    try {
      const { Canvas, Path, Skia } = SkiaModules.current || {};
      const { Gesture, GestureDetector, GestureHandlerRootView } = GestureModules.current || {};

      if (!Canvas || !Path || !Skia || !Gesture || !GestureDetector || !GestureHandlerRootView) {
        return <FallbackPadInner height={height} onSignatureChange={onSignatureChange} />;
      }

      const pan = Gesture.Pan()
        .runOnJS(true)
        .onStart((e: any) => {
          try {
            const path = Skia.Path.Make();
            path.moveTo(e.x, e.y);
            currentPath.current = path;
            setPaths((prev: any[]) => [...prev, path]);
          } catch (err) {
            console.log('Skia path error:', err);
          }
        })
        .onUpdate((e: any) => {
          try {
            if (currentPath.current) {
              currentPath.current.lineTo(e.x, e.y);
              setPaths((prev: any[]) => [...prev]);
            }
          } catch (err) {
            console.log('Skia update error:', err);
          }
        })
        .onEnd(() => {
          if (currentPath.current) {
            currentPath.current = null;
            onSignatureChange?.(true);
          }
        })
        .minDistance(1);

      return (
        <View style={styles.container}>
          <View 
            ref={canvasContainerRef}
            style={[styles.canvasContainer, { borderColor: theme.backgroundSecondary, height, backgroundColor: '#FFFFFF' }]}
            collapsable={false}
          >
            <GestureHandlerRootView style={styles.gestureContainer}>
              <GestureDetector gesture={pan}>
                <Canvas style={styles.canvas}>
                  {paths.map((path: any, index: number) => (
                    <Path
                      key={index}
                      path={path}
                      color="#000000"
                      style="stroke"
                      strokeWidth={2}
                      strokeCap="round"
                      strokeJoin="round"
                    />
                  ))}
                </Canvas>
              </GestureDetector>
            </GestureHandlerRootView>
            {paths.length === 0 ? (
              <View style={[styles.placeholder, { pointerEvents: 'none' }]}>
                <ThemedText style={[styles.placeholderText, { color: theme.secondaryText }]}>
                  Sign here
                </ThemedText>
              </View>
            ) : null}
          </View>
          <Pressable onPress={handleClear} style={styles.clearButton}>
            <Feather name="trash-2" size={16} color={theme.error} />
            <ThemedText style={[styles.clearText, { color: theme.error }]}>Clear</ThemedText>
          </Pressable>
        </View>
      );
    } catch (error) {
      console.log('Skia render error, using fallback:', error);
      return <FallbackPadInner height={height} onSignatureChange={onSignatureChange} />;
    }
  }
);

export const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(
  (props, ref) => {
    if (Platform.OS === 'web') {
      return <WebFallbackSignaturePad {...props} ref={ref} />;
    }
    return <NativeSignaturePad {...props} ref={ref} />;
  }
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  canvasContainer: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  gestureContainer: {
    flex: 1,
  },
  canvas: {
    flex: 1,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 16,
    textAlign: 'center',
  },
  placeholderSubtext: {
    fontSize: 12,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  clearText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
