import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/Input';
import { GroupedList, ListRow } from '@/components/ListRow';
import { OptionRow } from '@/components/OptionRow';
import { OTPInput } from '@/components/OTPInput';
import { PermissionPrimerView } from '@/components/PermissionPrimer';
import { Photo } from '@/components/Photo';
import { ProgressBar, StepIndicator } from '@/components/Progress';
import { Sheet } from '@/components/Sheet';
import { SkeletonCard } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { useToastStore } from '@/components/Toast';
import { fill } from '@/lib/format';
import { banner, kit2, statesFx as fx } from '@/strings';

import { brokenPhotoUrl, samplePhotos } from './fixtures';

export type StateFrame = {
  /** Board caption, e.g. "X5" (numbered in board order). */
  id: string;
  /** Board frame name, exactly as on the board. */
  name: string;
  release: '1.0' | '1.1' | '2' | 'removed';
  /** The screen that owns this state (DESIGN_SYSTEM §10). */
  screen: string;
  render: () => ReactNode;
};

function Pad({ children }: { children: ReactNode }) {
  return <View style={styles.pad}>{children}</View>;
}

/** Frame whose real content arrives with its screen; still reachable for QA. */
function Pending({ screen, task }: { screen: string; task: string }) {
  return (
    <EmptyState icon="tool" title={fx.pendingTitle} body={fill(fx.pendingBody, { screen, task })} />
  );
}

function NotInRelease({ release, reason }: { release: StateFrame['release']; reason?: string }) {
  return (
    <EmptyState
      icon="ban"
      title={fx.notInR10}
      body={
        release === 'removed'
          ? fill(fx.removedBody, { reason: reason ?? '' })
          : fill(fx.laterBody, { release })
      }
    />
  );
}

function CodeErrors() {
  const [code, setCode] = useState('481206');
  return (
    <Pad>
      <Text variant="title" accessibilityRole="header">
        {fx.codeTitle}
      </Text>
      <OTPInput label={fx.codeTitle} value={code} onChange={setCode} error />
      <Text variant="label" tone="red">
        {fx.codeWrong}
      </Text>
    </Pad>
  );
}

function SessionExpired() {
  const [open, setOpen] = useState(true);
  return (
    <Pad>
      <Button label={fx.sessionTitle} variant="secondary" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={fx.sessionTitle}>
        <Text variant="body" tone="ink2">
          {fx.sessionBody}
        </Text>
        <Button label={fx.continue} variant="dark" onPress={() => setOpen(false)} />
        <Button label={fx.logOut} variant="text" onPress={() => setOpen(false)} />
      </Sheet>
    </Pad>
  );
}

function Appeal() {
  const [choice, setChoice] = useState('mistake');
  const [body, setBody] = useState('');
  return (
    <Pad>
      <Text variant="heading" accessibilityRole="header">
        {fx.appealTitle}
      </Text>
      {(
        [
          ['mistake', fx.appealMistake],
          ['unaware', fx.appealUnaware],
          ['someone', fx.appealSomeoneElse],
        ] as const
      ).map(([value, label]) => (
        <OptionRow
          key={value}
          kind="radio"
          label={label}
          selected={choice === value}
          onPress={() => setChoice(value)}
        />
      ))}
      <TextArea label={fx.appealDetails} maxLength={500} value={body} onChangeText={setBody} />
      <Button label={fx.sendAppeal} variant="dark" disabled={!body} />
    </Pad>
  );
}

function Drafts() {
  const [open, setOpen] = useState(true);
  return (
    <Pad>
      <StepIndicator step={1} total={3} />
      <View style={styles.photoRow}>
        <View style={styles.photoCell}>
          <Photo source={samplePhotos[0]!.source} rounded="thumb" />
          <ProgressBar value={1} label={fx.uploadRetry} />
        </View>
        <View style={styles.photoCell}>
          <Photo source={samplePhotos[1]!.source} rounded="thumb" />
          <ProgressBar value={0.6} label={fx.uploadRetry} />
        </View>
        <View style={styles.photoCell}>
          <Photo source={brokenPhotoUrl} rounded="thumb" />
          <Text variant="meta" tone="red">
            {fx.uploadRetry}
          </Text>
        </View>
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title={fx.draftTitle}>
        <Text variant="body" tone="ink2">
          {fx.draftBody}
        </Text>
        <Button label={fx.continue} variant="dark" onPress={() => setOpen(false)} />
        <Button label={fx.startOver} variant="secondary" onPress={() => setOpen(false)} />
      </Sheet>
    </Pad>
  );
}

function UndoSwipe() {
  const toast = useToastStore();
  return (
    <Pad>
      <Button
        label={fx.showUndo}
        variant="secondary"
        onPress={() => toast.showUndo(fx.undoSkipped, () => {})}
      />
    </Pad>
  );
}

const noop = () => {};

/** Every X frame on the design board, in board order (P2-KIT-02). */
export const STATE_FRAMES: StateFrame[] = [
  {
    id: 'X1',
    name: 'Log in',
    release: '1.0',
    screen: 'A03',
    render: () => (
      <Pad>
        <Text variant="title" accessibilityRole="header">
          {fx.loginTitle}
        </Text>
        <Text variant="body" tone="ink2">
          {fx.loginBody}
        </Text>
        <Input label={fx.emailLabel} kind="email" placeholder={fx.emailPlaceholder} />
        <Button label={fx.sendCode} />
      </Pad>
    ),
  },
  { id: 'X2', name: 'Code errors', release: '1.0', screen: 'A04', render: () => <CodeErrors /> },
  {
    id: 'X3',
    name: 'Loading',
    release: '1.0',
    screen: 'B01',
    render: () => (
      <View style={styles.deck}>
        <SkeletonCard />
      </View>
    ),
  },
  {
    id: 'X4',
    name: 'Offline',
    release: '1.0',
    screen: 'X01',
    render: () => (
      <Pad>
        <Banner kind="offline" message={banner.offline} />
        <GroupedList>
          <ListRow icon="chat" label={fx.cachedRow} value={fx.cachedValue} />
        </GroupedList>
      </Pad>
    ),
  },
  {
    id: 'X5',
    name: 'No results',
    release: '1.0',
    screen: 'B07',
    render: () => (
      <EmptyState
        icon="search"
        title={fx.noResultsTitle}
        body={fx.noResultsBody}
        action={{ label: fx.noResultsAction, onPress: noop }}
        secondaryAction={{ label: fx.noResultsSave, onPress: noop }}
      />
    ),
  },
  {
    id: 'X6',
    name: 'Empty inbox',
    release: '1.0',
    screen: 'E01',
    render: () => (
      <EmptyState
        icon="chat"
        title={fx.inboxTitle}
        body={fx.inboxBody}
        action={{ label: fx.startSwiping, onPress: noop }}
      />
    ),
  },
  {
    id: 'X7',
    name: 'Session expired',
    release: '1.0',
    screen: 'X02',
    render: () => <SessionExpired />,
  },
  {
    id: 'X8',
    name: 'Re-verify',
    release: '1.0',
    screen: 'X03',
    render: () => (
      <EmptyState
        icon="shield"
        title={fx.reverifyTitle}
        body={fx.reverifyBody}
        action={{ label: fx.sendCode, onPress: noop }}
        secondaryAction={{ label: fx.remindLater, onPress: noop }}
      />
    ),
  },
  {
    id: 'X9',
    name: 'Suspended',
    release: '1.0',
    screen: 'X04',
    render: () => (
      <EmptyState
        icon="lock"
        title={fx.pausedTitle}
        body={fx.pausedBody}
        action={{ label: fx.appeal, onPress: noop }}
        secondaryAction={{ label: fx.readRules, onPress: noop }}
      />
    ),
  },
  { id: 'X10', name: 'Appeal', release: '1.0', screen: 'X04', render: () => <Appeal /> },
  {
    id: 'X11',
    name: 'Update required',
    release: '1.0',
    screen: 'X05',
    render: () => (
      <EmptyState
        icon="download"
        tile="accent"
        title={fx.updateTitle}
        body={fx.updateBody}
        action={{ label: fx.updateAction, onPress: noop }}
      />
    ),
  },
  {
    id: 'X12',
    name: 'Maintenance',
    release: '1.0',
    screen: 'X06',
    render: () => <EmptyState icon="tool" title={fx.maintenanceTitle} body={fx.maintenanceBody} />,
  },
  {
    id: 'X13',
    name: 'Item gone',
    release: '1.0',
    screen: 'B02',
    render: () => (
      <EmptyState
        icon="tag"
        title={fx.goneTitle}
        body={fx.goneBody}
        action={{ label: fx.goneAction, onPress: noop }}
      />
    ),
  },
  {
    id: 'X14',
    name: 'Under review',
    release: '1.0',
    screen: 'X07',
    render: () => (
      <Pad>
        <Banner kind="warning" message={fx.reviewBanner} />
        <GroupedList>
          <ListRow label={fx.reviewRow} right={<Tag label={fx.reviewTag} tone="amber" />} />
        </GroupedList>
      </Pad>
    ),
  },
  {
    id: 'X15',
    name: 'Uploading and drafts',
    release: '1.0',
    screen: 'D01',
    render: () => <Drafts />,
  },
  {
    id: 'X16',
    name: 'Chat details',
    release: '1.0',
    screen: 'E03',
    render: () => <Pending screen="E03" task="P8-CHAT-03" />,
  },
  {
    id: 'X17',
    name: 'Blocked chat',
    release: '1.0',
    screen: 'E03',
    render: () => (
      <Pad>
        <Banner kind="info" message={fx.blockedBanner} />
        <Button label={fx.unblock} variant="secondary" />
      </Pad>
    ),
  },
  {
    id: 'X18',
    name: 'Camera access',
    release: '1.0',
    screen: 'D01',
    render: () => (
      <PermissionPrimerView
        kind="camera"
        step="primer"
        onContinue={noop}
        onOpenSettings={noop}
        onAlternative={noop}
        onClose={noop}
      />
    ),
  },
  {
    id: 'X19',
    name: 'Location access',
    release: 'removed',
    screen: 'X14',
    render: () => <NotInRelease release="removed" reason="D3, DEC-2" />,
  },
  {
    id: 'X20',
    name: 'Location off',
    release: 'removed',
    screen: 'X14',
    render: () => <NotInRelease release="removed" reason="D3, DEC-2" />,
  },
  {
    id: 'X21',
    name: 'Access denied',
    release: '1.0',
    screen: 'D01',
    render: () => (
      <PermissionPrimerView
        kind="photos"
        step="settings"
        onContinue={noop}
        onOpenSettings={noop}
        onAlternative={noop}
        onClose={noop}
      />
    ),
  },
  { id: 'X22', name: 'Undo swipe', release: '1.0', screen: 'B01', render: () => <UndoSwipe /> },
  {
    id: 'X23',
    name: 'Share listing',
    release: '1.0',
    screen: 'X08',
    render: () => <Pending screen="X08" task="P11-STATE-01" />,
  },
  {
    id: 'X24',
    name: 'Rate the app',
    release: '1.0',
    screen: 'X09',
    render: () => <Pending screen="X09" task="P8-DEAL-03" />,
  },
  {
    id: 'X25',
    name: 'Banned items',
    release: '1.0',
    screen: 'X10',
    render: () => (
      <Pad>
        <GroupedList>
          {Object.values(fx.bannedRows).map((row) => (
            <ListRow key={row} icon="ban" label={row} />
          ))}
        </GroupedList>
      </Pad>
    ),
  },
  {
    id: 'X26',
    name: 'Help',
    release: '1.0',
    screen: 'F20',
    render: () => <Pending screen="F20" task="P11-SAFE-05" />,
  },
  {
    id: 'X27',
    name: 'Lock screen',
    release: '1.0',
    screen: 'X13',
    render: () => <Pending screen="X13" task="P9-PUSH-04" />,
  },
  {
    id: 'X28',
    name: 'Live Activity',
    release: '2',
    screen: 'X15',
    render: () => <NotInRelease release="2" />,
  },
  {
    id: 'X29',
    name: 'Terms',
    release: '1.0',
    screen: 'X11',
    render: () => <Pending screen="X11" task="P14-LEGAL-01" />,
  },
  {
    id: 'X30',
    name: 'Privacy',
    release: '1.0',
    screen: 'X11',
    render: () => <Pending screen="X11" task="P14-LEGAL-01" />,
  },
  {
    id: 'X31',
    name: 'Link from another campus',
    release: '1.0',
    screen: 'X12',
    render: () => (
      <EmptyState
        icon="building"
        title={fx.otherCampusTitle}
        body={fx.otherCampusBody}
        action={{ label: fx.otherCampusAction, onPress: noop }}
      />
    ),
  },
  {
    id: 'X32',
    name: 'Link while signed out',
    release: '1.0',
    screen: 'X12',
    render: () => (
      <Pad>
        <EmptyState icon="lock" title={fx.signedOutTitle} body={fx.signedOutBody} />
        <Input label={fx.emailLabel} kind="email" placeholder={fx.emailPlaceholder} />
        <Button label={fx.sendCode} />
      </Pad>
    ),
  },
  {
    id: 'X33',
    name: 'Large text',
    release: '1.0',
    screen: 'all',
    render: () => (
      <Pad>
        <Text variant="body" tone="ink2">
          {fx.largeTextBody}
        </Text>
        <GroupedList>
          <ListRow icon="chat" label={fx.cachedRow} value={fx.cachedValue} onPress={noop} />
          <ListRow icon="tag" label={fx.reviewRow} value={fx.cachedValue} onPress={noop} />
        </GroupedList>
        <Button label={fx.noResultsAction} />
      </Pad>
    ),
  },
  {
    id: 'X34',
    name: 'VoiceOver',
    release: '1.0',
    screen: 'B01',
    render: () => <Pending screen="B01" task="P6-FEED-02" />,
  },
  {
    id: 'X35',
    name: 'No notifications',
    release: '1.0',
    screen: 'F09',
    render: () => (
      <EmptyState
        icon="bell"
        title={fx.notificationsTitle}
        body={fx.notificationsBody}
        secondaryAction={{ label: fx.notificationSettings, onPress: noop }}
      />
    ),
  },
  {
    id: 'X36',
    name: 'No listings yet',
    release: '1.0',
    screen: 'F03',
    render: () => (
      <EmptyState
        icon="tag"
        tile="accent"
        title={kit2.emptyTitle}
        body={kit2.emptyBody}
        suggestions={[kit2.sugBooks, kit2.sugFridge, kit2.sugChair, kit2.sugLamp, kit2.sugFree]}
        action={{ label: kit2.emptyAction, onPress: noop }}
      />
    ),
  },
  {
    id: 'X37',
    name: 'Nothing saved',
    release: '1.0',
    screen: 'B09',
    render: () => (
      <EmptyState
        icon="bookmark"
        title={fx.savedTitle}
        body={fx.savedBody}
        action={{ label: fx.startSwiping, onPress: noop }}
      />
    ),
  },
  {
    id: 'X38',
    name: 'Home screen widgets',
    release: '2',
    screen: 'X15',
    render: () => <NotInRelease release="2" />,
  },
  {
    id: 'X39',
    name: 'Lock screen widgets',
    release: '2',
    screen: 'X15',
    render: () => <NotInRelease release="2" />,
  },
];

export function findFrame(id: string | undefined): StateFrame | undefined {
  return STATE_FRAMES.find((f) => f.id === id);
}

/** Fixture body wrapper: scrolls, and grows for centered empty states. */
export function FrameBody({ frame }: { frame: StateFrame }) {
  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
      {frame.render()}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  pad: { padding: theme.space.screen, gap: theme.space.md },
  deck: { height: theme.size.copyMax * 1.6, padding: theme.space.lg },
  photoRow: { flexDirection: 'row', gap: theme.space.md },
  photoCell: { flex: 1, gap: theme.space.sm },
  body: { flex: 1 },
  bodyContent: { flexGrow: 1 },
}));
