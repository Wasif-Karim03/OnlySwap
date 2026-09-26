import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';
import { create } from 'zustand';

import { toast as toastCopy } from '@/strings/en';

import { Icon } from './icons/Icon';
import { Tappable } from './Tappable';
import { Text } from './Text';

export type ToastKind = 'info' | 'success' | 'error';

export const TOAST_MS = 4000;
export const UNDO_MS = 5000;

type ToastItem = { id: number; kind: ToastKind; message: string; onUndo?: () => void };

type ToastState = {
  current?: ToastItem;
  show: (kind: ToastKind, message: string) => void;
  showUndo: (message: string, onUndo: () => void) => void;
  dismiss: (id?: number) => void;
};

let nextId = 1;

/** One toast at a time; a new one replaces the old (DESIGN_SYSTEM §6). */
export const useToastStore = create<ToastState>((set, get) => ({
  current: undefined,
  show: (kind, message) => set({ current: { id: nextId++, kind, message } }),
  showUndo: (message, onUndo) => set({ current: { id: nextId++, kind: 'info', message, onUndo } }),
  dismiss: (id) => {
    if (id === undefined || get().current?.id === id) set({ current: undefined });
  },
}));

const ICON = { info: 'info', success: 'check', error: 'alert' } as const;

/** Mount once near the root. Auto-dismiss 4 s, undo toasts 5 s. */
export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const dismiss = useToastStore((s) => s.dismiss);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!current) return undefined;
    timer.current = setTimeout(() => dismiss(current.id), current.onUndo ? UNDO_MS : TOAST_MS);
    return () => clearTimeout(timer.current);
  }, [current, dismiss]);

  if (!current) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      style={styles.host}
      pointerEvents="box-none"
    >
      <View
        style={styles.toast}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        testID="toast"
      >
        <Icon
          name={ICON[current.kind]}
          size={20}
          tone={current.kind === 'error' ? 'red' : current.kind === 'success' ? 'green' : 'inverse'}
        />
        <Text variant="label" tone="inverse" style={styles.message}>
          {current.message}
        </Text>
        {current.onUndo ? (
          <Tappable
            accessibilityRole="button"
            accessibilityLabel={toastCopy.undo}
            onPress={() => {
              current.onUndo?.();
              dismiss(current.id);
            }}
          >
            <View style={styles.undo}>
              <Text variant="label" tone="inverse" style={styles.undoText}>
                {toastCopy.undo}
              </Text>
            </View>
          </Tappable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  host: {
    position: 'absolute',
    left: theme.space.lg,
    right: theme.space.lg,
    bottom: rt.insets.bottom + theme.space['2xl'] * 2,
  },
  toast: {
    minHeight: theme.size.buttonL,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.ink,
    shadowColor: theme.elevation.soft.color,
    shadowOpacity: theme.elevation.soft.opacity,
    shadowRadius: theme.elevation.soft.blur,
    shadowOffset: { width: 0, height: theme.elevation.soft.offsetY },
  },
  message: { flex: 1 },
  undo: { minHeight: theme.size.hit, justifyContent: 'center', paddingHorizontal: theme.space.sm },
  undoText: { textDecorationLine: 'underline' },
}));
