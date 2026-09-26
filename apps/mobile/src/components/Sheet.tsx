import { motion } from '@onlyswap/tokens';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { sheet as sheetCopy } from '@/strings/en';
import { animateTo, resolveMotion } from '@/theme/motion';
import { useReducedMotion } from '@/theme/reducedMotion';

import { Text } from './Text';

const FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

/** Pan-to-close rule: past 30% of the sheet height or a fast downward fling. */
export function shouldCloseSheet(translationY: number, velocityY: number, height: number): boolean {
  return translationY > height * 0.3 || velocityY > 800;
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
 */
export function Sheet({ visible, onClose, title, children, testID }: Props) {
  const { height: screenH } = useWindowDimensions();
  const reduced = useReducedMotion();
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

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      y.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (shouldCloseSheet(e.translationY, e.velocityY, panelH)) {
        runOnJS(onClose)();
      } else {
        y.set(animateTo(0, resolveMotion('sheet', reduced)));
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
        <KeyboardAvoidingView behavior="padding" style={styles.bottom} pointerEvents="box-none">
          <GestureDetector gesture={pan}>
            <Animated.View
              testID={testID}
              accessibilityViewIsModal
              onLayout={(e) => setPanelH(e.nativeEvent.layout.height)}
              style={panelStyle}
            >
              <View style={styles.panel}>
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
  bottom: { flex: 1, justifyContent: 'flex-end' },
  panel: {
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

/** List of actions plus Cancel, built on Sheet. */
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
      {actions.map((a) => (
        <Pressable
          key={a.label}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          onPress={() => {
            onClose();
            a.onPress();
          }}
          style={actionStyles.row}
        >
          <Text variant="bodyStrong" tone={a.destructive ? 'red' : 'ink'}>
            {a.label}
          </Text>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={sheetCopy.cancel}
        onPress={onClose}
        style={actionStyles.row}
      >
        <Text variant="bodyStrong" tone="ink2">
          {sheetCopy.cancel}
        </Text>
      </Pressable>
    </Sheet>
  );
}

const actionStyles = StyleSheet.create((theme) => ({
  row: {
    minHeight: theme.space.rowMin,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
}));
