import { Link } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { StyleSheet } from 'react-native-unistyles';

import { Avatar } from '@/components/Avatar';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, ChipGroup } from '@/components/Chip';
import { IconButton } from '@/components/IconButton';
import { Input } from '@/components/Input';
import { GroupedList, ListRow } from '@/components/ListRow';
import { Mark } from '@/components/Mark';
import { Checkbox, OptionRow } from '@/components/OptionRow';
import { OTPInput } from '@/components/OTPInput';
import { SegmentedControl } from '@/components/SegmentedControl';
import { ActionSheet, Sheet } from '@/components/Sheet';
import { Stepper } from '@/components/Stepper';
import { Tag } from '@/components/Tag';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { useToastStore } from '@/components/Toast';
import { Toggle } from '@/components/Toggle';
import { kit, kit2 } from '@/strings/en';
import { THEME_MODES, useThemeModeStore } from '@/theme/mode';

import {
  AccentPicker,
  DialogSection,
  NavigationSection,
  PhotoSection,
  PrimerSection,
  StatesSection,
} from './KitSections2';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="heading" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Dev builds only: every component in every state (P2-KIT-01). */
export function KitScreen() {
  const [chips, setChips] = useState<string[]>(['books']);
  const [cond, setCond] = useState<'new' | 'good' | 'fair'>('good');
  const [alerts, setAlerts] = useState(true);
  const [pickup, setPickup] = useState<'pickup' | 'meetup'>('meetup');
  const [agree, setAgree] = useState(false);
  const [qty, setQty] = useState(1);
  const [desc, setDesc] = useState('Barely used, comes with the bulb.');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [actions, setActions] = useState(false);
  const [offer, setOffer] = useState('');
  const toast = useToastStore();
  const mode = useThemeModeStore((s) => s.mode);
  const setMode = useThemeModeStore((s) => s.setMode);

  return (
    <View style={styles.screen}>
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Mark size={32} />
          <Text variant="title" accessibilityRole="header">
            {kit.title}
          </Text>
        </View>
        <SegmentedControl
          label="Appearance"
          value={mode}
          onChange={setMode}
          segments={THEME_MODES.map((m) => ({ value: m, label: m[0]!.toUpperCase() + m.slice(1) }))}
        />
        <AccentPicker />
        <Link href="/dev/states" asChild>
          <Pressable accessibilityRole="link">
            <Text variant="label" tone="ink2">
              {kit2.openStates}
            </Text>
          </Pressable>
        </Link>

        <Section title={kit.buttons}>
          <Button label={kit.primary} />
          <Button label={kit.dark} variant="dark" />
          <Button label={kit.secondary} variant="secondary" />
          <Button label={kit.text} variant="text" />
          <Button label={kit.destructive} variant="destructive" />
          <Button label={kit.loading} loading />
          <Button label={kit.disabled} disabled />
          <View style={styles.row}>
            <Button label={kit.primary} size="M" fullWidth={false} />
            <Button label={kit.secondary} size="S" variant="secondary" fullWidth={false} />
          </View>
          <View style={styles.row}>
            <IconButton icon="back" accessibilityLabel={kit.iconBack} />
            <IconButton icon="share" filled accessibilityLabel={kit.iconShare} />
            <IconButton icon="more" disabled accessibilityLabel={kit.iconMore} />
          </View>
        </Section>

        <Section title={kit.inputs}>
          <Input label={kit.email} kind="email" placeholder={kit.emailPlaceholder} />
          <Input label={kit.price} kind="price" placeholder="40" />
          <Input
            label={kit.search}
            kind="search"
            hideLabel
            placeholder={kit.searchPlaceholder}
            loading
          />
          <Input label={kit.name} defaultValue="M4ya" error={kit.nameError} />
          <Input label={kit.disabledField} defaultValue="Demo University" disabled />
          <TextArea label={kit.description} maxLength={40} value={desc} onChangeText={setDesc} />
          <Text variant="label" tone="ink2">
            {kit.code}
          </Text>
          <OTPInput
            label={kit.code}
            value={code}
            onChange={(c) => {
              setCode(c);
              setCodeError(false);
            }}
            error={codeError}
          />
          <Button
            label={kit.codeError}
            variant="secondary"
            size="S"
            fullWidth={false}
            onPress={() => setCodeError(true)}
          />
        </Section>

        <Section title={kit.controls}>
          <ChipGroup
            label={kit.categories}
            value={chips}
            onChange={setChips}
            options={[
              { value: 'books', label: kit.catBooks },
              { value: 'tech', label: kit.catTech },
              { value: 'dorm', label: kit.catDorm },
              { value: 'free', label: kit.catFree },
            ]}
          />
          <View style={styles.row}>
            <Chip label={kit.removable} selected onRemove={() => {}} removeLabel={kit.remove} />
            <Chip label={kit.catFree} disabled />
          </View>
          <SegmentedControl
            label={kit.condition}
            value={cond}
            onChange={setCond}
            segments={[
              { value: 'new', label: kit.condNew },
              { value: 'good', label: kit.condGood },
              { value: 'fair', label: kit.condFair },
            ]}
          />
          <Toggle
            label={kit.alerts}
            description={kit.alertsHint}
            value={alerts}
            onChange={setAlerts}
          />
          <Toggle label={kit.alerts} value={false} onChange={() => {}} disabled />
          <OptionRow
            kind="radio"
            label={kit.pickup}
            selected={pickup === 'pickup'}
            onPress={() => setPickup('pickup')}
          />
          <OptionRow
            kind="radio"
            label={kit.meetup}
            selected={pickup === 'meetup'}
            onPress={() => setPickup('meetup')}
          />
          <Checkbox label={kit.agree} selected={agree} onPress={() => setAgree((a) => !a)} />
          <Stepper
            label={kit.quantity}
            value={qty}
            onChange={setQty}
            min={1}
            max={5}
            decreaseLabel={kit.decrease}
            increaseLabel={kit.increase}
          />
        </Section>

        <Section title={kit.overlays}>
          <Button label={kit.openSheet} variant="secondary" onPress={() => setSheet(true)} />
          <Button label={kit.openActions} variant="secondary" onPress={() => setActions(true)} />
          <Button
            label={kit.showToast}
            variant="secondary"
            onPress={() => toast.show('success', kit.toastMessage)}
          />
          <Button
            label={kit.showUndo}
            variant="secondary"
            onPress={() => toast.showUndo(kit.undoMessage, () => {})}
          />
          <Button
            label={kit.showError}
            variant="secondary"
            onPress={() => toast.show('error', kit.errorMessage)}
          />
        </Section>

        <Section title={kit.banners}>
          <Banner kind="info" message={kit.bannerInfo} />
          <Banner kind="warning" message={kit.bannerWarning} />
        </Section>

        <PhotoSection />
        <NavigationSection />
        <StatesSection />
        <PrimerSection />
        <DialogSection />

        <Section title={kit.surfaces}>
          <Card onPress={() => {}} accessibilityLabel={kit.cardTitle}>
            <Text variant="price">$40</Text>
            <Text variant="bodyStrong">{kit.cardTitle}</Text>
            <Text variant="meta" tone="ink2">
              {kit.cardMeta}
            </Text>
            <View style={styles.row}>
              <Tag label={kit.tagNew} />
              <Tag label={kit.tagAccent} tone="accent" />
              <Tag label={kit.tagGreen} tone="green" />
              <Tag label={kit.tagAmber} tone="amber" />
              <Tag label={kit.tagRed} tone="red" />
            </View>
          </Card>
          <View style={styles.row}>
            <Avatar name={kit.avatarA} size="L" />
            <Avatar name={kit.avatarB} size="M" />
            <Avatar name={kit.avatarC} size="S" />
          </View>
          <GroupedList header={kit.settings} footer={kit.settingsFooter}>
            <ListRow icon="mail" label={kit.rowEmail} value={kit.rowEmailValue} />
            <ListRow icon="bell" label={kit.rowNotifications} onPress={() => {}} />
            <ListRow icon="trash" label={kit.rowDelete} destructive onPress={() => {}} />
          </GroupedList>
        </Section>
      </KeyboardAwareScrollView>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title={kit.sheetTitle}
        testID="kit-sheet"
      >
        <Text variant="body" tone="ink2">
          {kit.sheetBody}
        </Text>
        <Input label={kit.offerAmount} kind="price" value={offer} onChangeText={setOffer} />
        <Button label={kit.dark} variant="dark" onPress={() => setSheet(false)} />
      </Sheet>
      <ActionSheet
        visible={actions}
        onClose={() => setActions(false)}
        title={kit.actionsTitle}
        actions={[
          { label: kit.actionShare, onPress: () => {} },
          { label: kit.actionReport, onPress: () => {}, destructive: true },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  content: {
    padding: theme.space.screen,
    paddingTop: rt.insets.top + theme.space.lg,
    paddingBottom: rt.insets.bottom + theme.space['2xl'] * 3,
    gap: theme.space['2xl'],
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  section: { gap: theme.space.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm, alignItems: 'center' },
}));
