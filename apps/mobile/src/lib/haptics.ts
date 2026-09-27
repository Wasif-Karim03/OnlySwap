import * as Haptics from 'expo-haptics';

/**
 * The haptics budget (DESIGN_SYSTEM §5, UX-09). Only these three exist:
 * selection at the swipe threshold, success on offer sent / accepted / listing
 * posted, warning on the error shake. Nothing else gets a haptic.
 */
export type HapticKind = 'selection' | 'success' | 'warning';

export function haptic(kind: HapticKind): void {
  const run =
    kind === 'selection'
      ? Haptics.selectionAsync()
      : Haptics.notificationAsync(
          kind === 'success'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
  // Haptics are best-effort (simulators and some devices have none).
  run.catch(() => {});
}
