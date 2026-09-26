import type { AccentName } from '@onlyswap/tokens';
import { useState, type ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/Chip';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IconButton } from '@/components/IconButton';
import { NavBar } from '@/components/NavBar';
import { PermissionPrimerView } from '@/components/PermissionPrimer';
import { Photo } from '@/components/Photo';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { ProgressBar, StepIndicator } from '@/components/Progress';
import { ReportSheet, type ReportTarget } from '@/components/ReportSheet';
import { SkeletonCard, SkeletonGrid, SkeletonList } from '@/components/Skeleton';
import { TabBar } from '@/components/TabBar';
import { Text } from '@/components/Text';
import { useToastStore } from '@/components/Toast';
import { ZoomableImage } from '@/components/ZoomableImage';
import { toAppError } from '@/lib/errors';
import type { PermissionKind } from '@/lib/permissions';
import { kit2, tabs } from '@/strings/en';

import { ACCENT_NAMES, previewAccent } from './accentPreview';
import { brokenPhotoUrl, samplePhotos } from './fixtures';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Dev-only accent switcher: every mode x accent pair (DESIGN_SYSTEM D2). */
export function AccentPicker() {
  const [accent, setAccent] = useState<AccentName[]>(['pistachio']);
  return (
    <ChipGroup
      label={kit2.accent}
      mode="single"
      value={accent}
      onChange={(next) => {
        const picked = next[0] ?? 'pistachio';
        setAccent([picked]);
        previewAccent(picked);
      }}
      options={ACCENT_NAMES.map((a) => ({ value: a, label: a[0]!.toUpperCase() + a.slice(1) }))}
    />
  );
}

/** Full-screen photo viewer (board B10) used by the carousel demo. */
export function PhotoViewer({ index, onClose }: { index: number | null; onClose: () => void }) {
  const photo = index === null ? null : samplePhotos[index];
  return (
    <Modal visible={photo !== null} animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewer}>
        <NavBar
          tone="onPhoto"
          leading="close"
          onLeading={onClose}
          title={index === null ? undefined : `${index + 1} / ${samplePhotos.length}`}
        />
        {photo ? (
          <ZoomableImage
            source={photo.source}
            blurhash={photo.blurhash}
            accessibilityLabel={kit2.photoAlt}
            onDismiss={onClose}
          />
        ) : null}
      </View>
    </Modal>
  );
}

export function PhotoSection() {
  const [viewer, setViewer] = useState<number | null>(null);
  return (
    <Section title={kit2.photos}>
      <PhotoCarousel
        testID="kit-carousel"
        photos={samplePhotos}
        label={kit2.photoAlt}
        onPressPhoto={setViewer}
      />
      <View style={styles.row}>
        <View style={styles.thumb}>
          <Photo source={null} blurhash={samplePhotos[0]!.blurhash} rounded="thumb" />
          <Text variant="meta" tone="ink2">
            {kit2.photoLoading}
          </Text>
        </View>
        <View style={styles.thumb}>
          <Photo
            source={samplePhotos[2]!.source}
            rounded="thumb"
            accessibilityLabel={kit2.photoAlt}
          />
          <Text variant="meta" tone="ink2">
            {kit2.photoLoaded}
          </Text>
        </View>
        <View style={styles.thumb}>
          <Photo source={brokenPhotoUrl} rounded="thumb" accessibilityLabel={kit2.photoAlt} />
          <Text variant="meta" tone="ink2">
            {kit2.photoError}
          </Text>
        </View>
      </View>
      <PhotoViewer index={viewer} onClose={() => setViewer(null)} />
    </Section>
  );
}

export function StatesSection() {
  const [retryError, setRetryError] = useState<unknown>(toAppError(new Error('UNKNOWN')));
  return (
    <Section title={kit2.states}>
      <View style={styles.box}>
        <EmptyState
          icon="tag"
          tile="accent"
          title={kit2.emptyTitle}
          body={kit2.emptyBody}
          suggestions={[kit2.sugBooks, kit2.sugFridge, kit2.sugChair, kit2.sugLamp, kit2.sugFree]}
          action={{ label: kit2.emptyAction, onPress: () => {} }}
        />
      </View>
      <View style={styles.box}>
        <ErrorState
          error={retryError}
          onRetry={() =>
            new Promise<void>((resolve) =>
              setTimeout(() => {
                setRetryError(toAppError(new TypeError('Network request failed')));
                resolve();
              }, 800),
            )
          }
        />
      </View>
      <View style={styles.box}>
        <ErrorState
          layout="inline"
          error={toAppError(new Error('RATE_LIMITED'))}
          onRetry={() => {}}
        />
      </View>
      <View style={styles.deck}>
        <SkeletonCard />
      </View>
      <SkeletonList rows={3} />
      <SkeletonGrid tiles={2} />
    </Section>
  );
}

export function NavigationSection() {
  const [active, setActive] = useState('discover');
  const [step, setStep] = useState(1);
  const [progress, setProgress] = useState(0.35);
  const items = [
    { key: 'discover', label: tabs.discover, icon: 'cards' as const },
    { key: 'sell', label: tabs.sell, icon: 'plussq' as const },
    { key: 'inbox', label: tabs.inbox, icon: 'chat' as const, badge: 2 },
    { key: 'profile', label: tabs.profile, icon: 'user' as const },
  ];
  return (
    <Section title={kit2.navigation}>
      <View style={styles.box}>
        <NavBar variant="large" title={tabs.inbox} safeTop={false} />
        <NavBar
          title={kit2.newListing}
          safeTop={false}
          onLeading={() => {}}
          trailing={
            <Text variant="label" tone="ink2">
              {kit2.stepCount}
            </Text>
          }
        />
        <NavBar
          title={kit2.offer}
          leading="close"
          safeTop={false}
          onLeading={() => {}}
          trailing={<IconButton icon="more" accessibilityLabel={kit2.more} />}
        />
      </View>
      <Text variant="label" tone="ink2">
        {kit2.tabIos}
      </Text>
      <TabBar
        variant="ios"
        safeBottom={false}
        items={items}
        activeKey={active}
        onSelect={setActive}
      />
      <Text variant="label" tone="ink2">
        {kit2.tabAndroid}
      </Text>
      <TabBar
        variant="android"
        safeBottom={false}
        items={items}
        activeKey={active}
        onSelect={setActive}
      />
      <StepIndicator step={step} total={3} />
      <Button
        label={kit2.nextStep}
        variant="secondary"
        size="S"
        fullWidth={false}
        onPress={() => setStep((s) => (s % 3) + 1)}
      />
      <ProgressBar value={progress} label={kit2.uploading} />
      <Button
        label={kit2.addProgress}
        variant="secondary"
        size="S"
        fullWidth={false}
        onPress={() => setProgress((p) => (p >= 1 ? 0 : Math.min(1, p + 0.25)))}
      />
    </Section>
  );
}

export function PrimerSection() {
  const [kind, setKind] = useState<PermissionKind[]>(['camera']);
  const [denied, setDenied] = useState(false);
  return (
    <Section title={kit2.primers}>
      <ChipGroup
        label={kit2.primerKind}
        mode="single"
        value={kind}
        onChange={(v) => setKind(v.length ? v : kind)}
        options={[
          { value: 'camera', label: kit2.camera },
          { value: 'photos', label: kit2.photosKind },
          { value: 'notifications', label: kit2.notifications },
        ]}
      />
      <Button
        label={denied ? kit2.showPrimer : kit2.showDenied}
        variant="secondary"
        size="S"
        fullWidth={false}
        onPress={() => setDenied((d) => !d)}
      />
      <View style={styles.primer}>
        <PermissionPrimerView
          kind={kind[0]!}
          step={denied ? 'settings' : 'primer'}
          onContinue={() => setDenied(true)}
          onOpenSettings={() => setDenied(false)}
          onAlternative={() => {}}
          onClose={() => {}}
        />
      </View>
    </Section>
  );
}

export function DialogSection() {
  const toast = useToastStore();
  const [confirm, setConfirm] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reports, setReports] = useState(0);
  return (
    <Section title={kit2.dialogs}>
      <Button label={kit2.openConfirm} variant="secondary" onPress={() => setConfirm(true)} />
      <Button
        label={kit2.reportListing}
        variant="secondary"
        onPress={() => setReportTarget('listing')}
      />
      <Button
        label={kit2.reportPerson}
        variant="secondary"
        onPress={() => setReportTarget('chat')}
      />
      <ConfirmDialog
        visible={confirm}
        title={kit2.confirmTitle}
        message={kit2.confirmBody}
        confirmLabel={kit2.confirmAction}
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={() =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              setConfirm(false);
              toast.show('success', kit2.deleted);
              resolve();
            }, 800),
          )
        }
      />
      <ReportSheet
        visible={reportTarget !== null}
        target={reportTarget ?? 'listing'}
        name={reportTarget === 'chat' ? kit2.personName : undefined}
        onClose={() => setReportTarget(null)}
        onSubmit={() =>
          new Promise<void>((resolve, reject) =>
            setTimeout(() => {
              // Every second report in the kit shows the duplicate state.
              setReports((n) => n + 1);
              if (reports % 2 === 1) reject(new Error('ALREADY_REPORTED'));
              else resolve();
            }, 800),
          )
        }
      />
    </Section>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: { gap: theme.space.md },
  row: { flexDirection: 'row', gap: theme.space.md },
  thumb: { flex: 1, gap: theme.space.xs },
  box: {
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
    backgroundColor: theme.colors.bg,
  },
  deck: { height: theme.size.copyMax, flexDirection: 'column' },
  primer: {
    height: theme.size.copyMax * 2,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.card,
    overflow: 'hidden',
  },
  viewer: { flex: 1, backgroundColor: theme.colors.photoBg },
}));
