import { motion } from '@onlyswap/tokens';
import * as ExpoRouter from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { sheet as sheetCopy } from '@/strings';
import { LAYOUT, useLayout } from '@/theme/layout';
import { animateTo, resolveMotion } from '@/theme/motion';
import { useReducedMotion } from '@/theme/reducedMotion';

import { Text } from './Text';

const FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

/** Pan-to-close rule: past 30% of the sheet height or a fast downward fling. */
export function shouldCloseSheet(translationY: number, velocityY: number, height: number): boolean {
  'worklet';
  return translationY > height * 0.3 || velocityY > 800;
}

type BlurSource = { addListener?: (event: 'blur', cb: () => void) => () => void } | null;

/** The screen's navigation, or null when the sheet renders outside a navigator (tests, root). */
const useNavigationOrNull: () => BlurSource = ExpoRouter.useNavigation
  ? () => {
      try {
        return ExpoRouter.useNavigation() as unknown as BlurSource;
      } catch {
        return null;
      }
    }
  : () => null;

/**
 * QA H4: a sheet is a native Modal, so it stays on top when its screen is left
 * (a push, a deep link, a notification tap). Close it when the screen blurs.
 */
function useCloseOnBlur(visible: boolean, onClose: () => void): void {
  const navigation = useNavigationOrNull();
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!visible || typeof navigation?.addListener !== 'function') return undefined;
    return navigation.addListener('blur', () => close.current());
  }, [visible, navigation]);
}

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  testID?: string;
};

/**
 * Bottom sheet (DESIGN_SYSTEM §6). Modal gives the focus trap and Android back;
 * spring open (fade with reduce motion); drag down to close; keyboard aware.
 * On iPad (regular and wide windows) it floats as a centered card no wider
 * than `LAYOUT.sheetMax` instead of spanning the screen (P17-FEAT-02).
 */
export function Sheet({ visible, onClose, title, children, testID }: Props) {
  const { height: screenH } = useWindowDimensions();
  const floating = useLayout().tablet;
  const reduced = useReducedMotion();
  useCloseOnBlur(visible, onClose);
  const [mounted, setMounted] = useState(visible);
  const [panelH, setPanelH] = useState(screenH);
  const y = useSharedValue(screenH);
  const fade = useSharedValue(0);

  // Mount as soon as it opens; unmount after the close animation finishes.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      fade.set(animateTo(1, resolveMotion('fade', true)));
      y.set(reduced ? 0 : animateTo(0, resolveMotion('sheet', false)));
      return undefined;
    }
    fade.set(animateTo(0, resolveMotion('fade', true)));
    y.set(animateTo(reduced ? 0 : panelH, resolveMotion('fade', true)));
    const t = setTimeout(() => setMounted(false), motion.fade.duration + 20);
    return () => clearTimeout(t);
  }, [visible, reduced, panelH, y, fade]);

  // Resolved on the JS thread; the gesture callbacks run as worklets on the UI thread.
  const snapBack = resolveMotion('sheet', reduced);
  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      y.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (shouldCloseSheet(e.translationY, e.velocityY, panelH)) {
        runOnJS(onClose)();
      } else {
        y.set(animateTo(0, snapBack));
      }
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: reduced ? fade.value : 1,
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  if (!mounted) return null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[styles.fill, scrimStyle]}>
          <Pressable
            testID={testID ? `${testID}-scrim` : undefined}
            accessibilityRole="button"
            accessibilityLabel={sheetCopy.close}
            onPress={onClose}
            style={styles.scrim}
          />
        </Animated.View>
        <KeyboardAvoidingView
          behavior="padding"
          style={floating ? styles.center : styles.bottom}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={pan}>
            <Animated.View
              testID={testID}
              accessibilityViewIsModal
              onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
              style={[styles.slot, floating ? styles.floatingSlot : null, panelStyle]}
            >
              <View style={[styles.panel, floating ? styles.floatingPanel : null]}>
                <View style={styles.grabber} accessible={false} />
                {title ? (
                  <Text variant="heading" accessibilityRole="header">
                    {title}
                  </Text>
                ) : null}
                {children}
              </View>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  fill: FILL,
  scrim: { flex: 1, backgroundColor: theme.colors.overlay },
  // The top inset keeps the grabber and title out from under the status bar
  // and Dynamic Island when the keyboard pushes a tall sheet up.
  bottom: { flex: 1, justifyContent: 'flex-end', paddingTop: rt.insets.top + theme.space.sm },
  // Never taller than the space left; the panel then shrinks, and a ScrollView
  // inside it (with flexShrink: 1) scrolls instead of the sheet running off screen.
  slot: { maxHeight: '100%' },
  center: { flex: 1, justifyContent: 'center', padding: theme.space.xl },
  floatingSlot: { width: '100%', maxWidth: LAYOUT.sheetMax, alignSelf: 'center' },
  floatingPanel: {
    borderRadius: theme.radius.sheet,
    paddingBottom: theme.space.xl,
    shadowOffset: { width: 0, height: theme.elevation.soft.offsetY },
  },
  panel: {
    flexShrink: 1,
    backgroundColor: theme.colors.bg,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    paddingHorizontal: theme.space.screen,
    paddingTop: theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.lg,
    gap: theme.space.md,
    shadowColor: theme.elevation.soft.color,
    shadowOpacity: theme.elevation.soft.opacity,
    shadowRadius: theme.elevation.soft.blur,
    shadowOffset: { width: 0, height: -theme.elevation.soft.offsetY },
  },
  grabber: {
    alignSelf: 'center',
    width: theme.space['2xl'] + theme.space.xs,
    height: theme.space.xs + 1,
    borderRadius: theme.radius.chip,
    backgroundColor: theme.colors.line2,
    marginBottom: theme.space.xs,
  },
}));

type Action = { label: string; onPress: () => void; destructive?: boolean };

/**
 * List of actions plus Cancel, built on Sheet. Rows are 52 pt with a bg2
 * pressed fill; Cancel sits apart in its own rounded bg2 block, as on iOS.
 */
export function ActionSheet({
  visible,
  onClose,
  title,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: Action[];
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={actionStyles.stack}>
        <View>
          {actions.map((a, i) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => {
                onClose();
                a.onPress();
              }}
              style={({ pressed }) => [
                actionStyles.row,
                i < actions.length - 1 && actionStyles.divider,
                pressed && actionStyles.pressed,
              ]}
            >
              <Text variant="bodyStrong" tone={a.destructive ? 'red' : 'ink'}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sheetCopy.cancel}
          onPress={onClose}
          style={({ pressed }) => [actionStyles.cancel, pressed && actionStyles.cancelPressed]}
        >
          <Text variant="bodyStrong" tone="ink2">
            {sheetCopy.cancel}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const actionStyles = StyleSheet.create((theme) => ({
  // Cancel sits 8 pt under the list.
  stack: { gap: theme.space.sm },
  row: {
    minHeight: theme.space.rowMin,
    justifyContent: 'center',
    // Bleed the pressed fill past the text by the same inset the text keeps.
    marginHorizontal: -theme.space.md,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.thumb,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  pressed: { backgroundColor: theme.colors.bg2 },
  cancel: {
    minHeight: theme.space.rowMin,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
  },
  cancelPressed: { backgroundColor: theme.colors.bg3 },
}));
