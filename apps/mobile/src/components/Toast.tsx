import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';
import { create } from 'zustand';

import { useScreenReader } from '@/lib/a11y';
import { toast as toastCopy } from '@/strings';

import { Icon } from './icons/Icon';
import { Tappable } from './Tappable';
import { Text } from './Text';

export type ToastKind = 'info' | 'success' | 'error';

export const TOAST_MS = 4000;
export const UNDO_MS = 5000;
/** With VoiceOver or TalkBack on, a toast stays long enough to hear and act on. */
export const SCREEN_READER_TOAST_MS = 10_000;

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

/**
 * Mount once near the root. Auto-dismiss 4 s, undo toasts 5 s, or tap to
 * dismiss. Sits high enough to clear a docked 54 pt button on any screen.
 */
export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const dismiss = useToastStore((s) => s.dismiss);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const screenReader = useScreenReader();

  useEffect(() => {
    if (!current) return undefined;
    // iOS ignores accessibilityLiveRegion, so VoiceOver never read toasts
    // (UX audit 2026-10-25). Android announces through the live region.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(current.message);
    const ms = screenReader ? SCREEN_READER_TOAST_MS : current.onUndo ? UNDO_MS : TOAST_MS;
    timer.current = setTimeout(() => dismiss(current.id), ms);
    return () => clearTimeout(timer.current);
  }, [current, dismiss, screenReader]);

  if (!current) return null;
  return (
    <Animated.View
      // Entering only: an exiting animation leaves a ghost view that crashed
      // Android when the next toast mounted (see OfflineBanner).
      key={current.id}
      entering={FadeIn.duration(150)}
      style={styles.host}
      pointerEvents="box-none"
    >
      {/* Tap the pill to dismiss it, except an undo toast, where a stray tap
        would throw away the Undo before its window ends. */}
      <Pressable
        accessible={false}
        onPress={current.onUndo ? undefined : () => dismiss(current.id)}
      >
        <View
          style={styles.toast}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          testID="toast"
        >
          {/* Inverse for every kind: green and red on the ink pill fail 3:1 in
            dark mode. The glyph (check, alert) carries the meaning (DEC 142). */}
          <Icon name={ICON[current.kind]} size={20} tone="inverse" />
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
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  host: {
    position: 'absolute',
    left: theme.space.lg,
    right: theme.space.lg,
    // One fixed offset above a docked L button and its padding (display only).
    bottom: rt.insets.bottom + theme.size.buttonL + theme.space.lg * 2,
  },
  toast: {
    minHeight: theme.size.buttonL,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.chip,
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
