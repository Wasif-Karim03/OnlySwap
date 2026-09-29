import { useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fill } from '@/lib/format';
import { errorCopy, toAppError } from '@/lib/errors';
import { report as reportCopy } from '@/strings/en';

import { Button } from './Button';
import { OptionRow } from './OptionRow';
import { Sheet } from './Sheet';
import { SuccessCheck } from './SuccessCheck';
import { Text } from './Text';
import { TextArea } from './TextArea';
import { Toggle } from './Toggle';

/** DATA_MODEL reports.target_type (R1.0 subset; Quad targets are R1.1). */
export type ReportTarget = 'listing' | 'user' | 'chat' | 'message';

/** DATA_MODEL reports.reason values offered in the app. */
export type ReportReason =
  | 'scam'
  | 'not_allowed'
  | 'stolen'
  | 'counterfeit'
  | 'misleading'
  | 'harassment'
  | 'threat'
  | 'hate'
  | 'sexual'
  | 'no_show'
  | 'minor_safety'
  | 'other';

export const REPORT_DETAILS_MAX = 500;

const REASONS: Record<ReportTarget, ReportReason[]> = {
  // Board B9: matches the banned items list and the scams that happen.
  listing: ['scam', 'not_allowed', 'stolen', 'counterfeit', 'misleading', 'other'],
  // Board E19 (+ threats, which go to the priority queue).
  // minor_safety: the Play child safety standard needs an in-app way to report it.
  user: ['scam', 'harassment', 'threat', 'not_allowed', 'no_show', 'minor_safety', 'other'],
  chat: ['scam', 'harassment', 'threat', 'not_allowed', 'no_show', 'minor_safety', 'other'],
  message: ['scam', 'harassment', 'threat', 'hate', 'sexual', 'minor_safety', 'other'],
};

export function reportReasons(target: ReportTarget): ReportReason[] {
  return REASONS[target];
}

/** Listings can't be blocked; people, chats and messages can. */
export function canBlock(target: ReportTarget): boolean {
  return target !== 'listing';
}

/**
 * Block starts on for harassment and threats (board E19) until the person
 * flips the switch themselves.
 */
export function blockDefault(reason: ReportReason, current: boolean, touched: boolean): boolean {
  if (touched) return current;
  return reason === 'harassment' || reason === 'threat';
}

export type ReportPhase = 'form' | 'submitting' | 'sent' | 'duplicate';

/** `ALREADY_REPORTED` is a finished state, not an error to retry. */
export function phaseAfterError(error: unknown): 'duplicate' | 'form' {
  return toAppError(error).code === 'ALREADY_REPORTED' ? 'duplicate' : 'form';
}

export type ReportInput = { reason: ReportReason; details: string; block: boolean };

type Props = {
  visible: boolean;
  onClose: () => void;
  target: ReportTarget;
  /** First name and initial of the person, e.g. "Ben O.". */
  name?: string;
  /** Calls `create_report` (and `block_user`) in P11. Throw to show the error. */
  onSubmit: (input: ReportInput) => Promise<void>;
  campusTimeZone?: string;
  testID?: string;
};

/**
 * Report sheet shell (P2-CMP-11; DESIGN_SYSTEM §6 ReportSheet): reason,
 * optional details, block toggle, submitting, sent and duplicate. The RPC
 * wiring lands with the safety tasks (P11).
 */
export function ReportSheet({
  visible,
  onClose,
  target,
  name,
  onSubmit,
  campusTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
  testID,
}: Props) {
  const [phase, setPhase] = useState<ReportPhase>('form');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(false);
  const [blockTouched, setBlockTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  const { height: screenH } = useWindowDimensions();

  // Each opening starts from an empty form.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPhase('form');
      setReason(null);
      setDetails('');
      setBlock(false);
      setBlockTouched(false);
      setError(null);
    }
  }

  const who = name ?? reportCopy.them;
  const title =
    target === 'listing'
      ? reportCopy.titleListing
      : target === 'message'
        ? reportCopy.titleMessage
        : fill(reportCopy.titlePerson, { name: who });

  const pickReason = (next: ReportReason) => {
    setReason(next);
    setBlock((current) => blockDefault(next, current, blockTouched));
  };

  const submit = async () => {
    if (!reason) return;
    setPhase('submitting');
    setError(null);
    try {
      await onSubmit({ reason, details: details.trim(), block: canBlock(target) && block });
      setPhase('sent');
    } catch (e) {
      const next = phaseAfterError(e);
      setPhase(next);
      if (next === 'form') setError(errorCopy(toAppError(e), { campusTimeZone }));
    }
  };

  const busy = phase === 'submitting';

  if (phase === 'sent' || phase === 'duplicate') {
    return (
      <Sheet visible={visible} onClose={onClose} testID={testID}>
        <View style={styles.done}>
          {phase === 'sent' ? (
            <SuccessCheck visible accessibilityLabel={reportCopy.sentTitle} />
          ) : null}
          <Text variant="heading" accessibilityRole="header" style={styles.center}>
            {phase === 'sent' ? reportCopy.sentTitle : reportCopy.duplicateTitle}
          </Text>
          <Text variant="body" tone="ink2" style={styles.center}>
            {phase === 'sent'
              ? block
                ? fill(reportCopy.sentBodyBlocked, { name: who })
                : reportCopy.sentBody
              : reportCopy.duplicateBody}
          </Text>
        </View>
        <Button label={reportCopy.done} variant="dark" onPress={onClose} />
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={busy ? () => {} : onClose} title={title} testID={testID}>
      <ScrollView
        style={styles.scroll(screenH)}
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="label" tone="ink2">
          {fill(reportCopy.private, {
            name: target === 'listing' && !name ? reportCopy.seller : who,
          })}
        </Text>
        <View accessibilityRole="radiogroup" accessibilityLabel={reportCopy.reasonLabel}>
          {reportReasons(target).map((r) => (
            <OptionRow
              key={r}
              kind="radio"
              label={reportCopy.reasons[target === 'listing' ? 'listing' : 'person'][r]}
              selected={reason === r}
              disabled={busy}
              onPress={() => pickReason(r)}
            />
          ))}
        </View>
        <TextArea
          label={reportCopy.detailsLabel}
          placeholder={
            target === 'listing'
              ? reportCopy.detailsPlaceholderListing
              : reportCopy.detailsPlaceholderPerson
          }
          maxLength={REPORT_DETAILS_MAX}
          value={details}
          onChangeText={setDetails}
          disabled={busy}
        />
        {canBlock(target) ? (
          <Toggle
            label={fill(reportCopy.alsoBlock, { name: who })}
            description={reportCopy.blockHint}
            value={block}
            disabled={busy}
            onChange={(v) => {
              setBlockTouched(true);
              setBlock(v);
            }}
          />
        ) : null}
        {error ? (
          <Text variant="label" tone="red" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
      </ScrollView>
      <Button
        label={reportCopy.send}
        variant="dark"
        disabled={!reason}
        loading={busy}
        onPress={submit}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  // The form scrolls inside the sheet so the Send button stays on screen.
  scroll: (screenH: number) => ({ maxHeight: screenH * 0.6, flexGrow: 0 }),
  form: { gap: theme.space.md },
  done: { alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.lg },
  center: { textAlign: 'center' },
}));
