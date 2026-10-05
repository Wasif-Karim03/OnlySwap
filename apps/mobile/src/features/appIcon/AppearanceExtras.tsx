import { Image } from 'expo-image';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components/Text';
import { Toggle } from '@/components/Toggle';
import { useToastStore } from '@/components/Toast';
import { getStorage, type TypedStorage } from '@/lib/storage';
import { settings as copy } from '@/strings';

import { getWidgetSync, liveActivitiesEnabled } from '../widgets/sync';
import { appIconApi, type AppIconApi } from './api';
import {
  APP_ICONS,
  choiceFromNative,
  isAppIconChoice,
  nativeIconName,
  type AppIconChoice,
} from './logic';

const PREVIEWS: Record<AppIconChoice, number> = {
  default: require('../../../assets/images/icon.png') as number,
  night: require('../../../assets/images/app-icons/night.png') as number,
  paper: require('../../../assets/images/app-icons/paper.png') as number,
  mono: require('../../../assets/images/app-icons/mono.png') as number,
};

type Store = Pick<TypedStorage, 'get' | 'set'>;

/** F14 App icon picker (R2-ICON-01): four previews, the choice saved on the device. */
export function AppIconPicker({
  api = appIconApi,
  store = getStorage(),
  os = Platform.OS,
}: {
  api?: AppIconApi;
  store?: Store;
  os?: string;
}) {
  const [selected, setSelected] = useState<AppIconChoice>(() => {
    const fromOs = api.current();
    if (fromOs) return choiceFromNative(fromOs);
    const saved = store.get('settings.appIcon');
    return isAppIconChoice(saved) ? saved : 'default';
  });
  if (!api.supported()) return null;

  const choose = async (choice: AppIconChoice) => {
    if (choice === selected) return;
    const before = selected;
    setSelected(choice);
    try {
      await api.set(nativeIconName(choice));
      store.set('settings.appIcon', choice);
    } catch {
      setSelected(before);
      useToastStore.getState().show('error', copy.appIconFailed);
    }
  };

  return (
    <View style={styles.section} testID="app-icon-picker">
      <Text variant="heading" accessibilityRole="header">
        {copy.appIconTitle}
      </Text>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {APP_ICONS.map((choice) => {
          const on = selected === choice;
          return (
            <Pressable
              key={choice}
              accessibilityRole="radio"
              accessibilityLabel={copy.appIcons[choice]}
              accessibilityState={{ checked: on }}
              onPress={() => void choose(choice)}
              style={styles.tile}
              testID={`app-icon-${choice}`}
            >
              <View style={styles.ring(on)}>
                <Image
                  source={PREVIEWS[choice]}
                  style={styles.icon}
                  accessibilityIgnoresInvertColors
                />
              </View>
              <Text variant="meta" tone={on ? 'ink' : 'ink2'}>
                {copy.appIcons[choice]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {os === 'android' ? (
        <Text variant="meta" tone="ink2">
          {copy.appIconAndroid}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * P17-FEAT-01 "Show meetups on the Lock Screen" (iOS only; Android has no
 * Live Activities). Off ends any running activity right away.
 */
export function LiveActivityToggle({
  os = Platform.OS,
  store = getStorage(),
  onChanged = () => void getWidgetSync().refresh(),
}: {
  os?: string;
  store?: Store;
  onChanged?: () => void;
}) {
  const [on, setOn] = useState(() => liveActivitiesEnabled(store));
  if (os !== 'ios') return null;
  return (
    <View style={styles.section}>
      <Text variant="heading" accessibilityRole="header">
        {copy.lockScreenTitle}
      </Text>
      <Toggle
        label={copy.liveActivities}
        description={copy.liveActivitiesBody}
        value={on}
        onChange={(v) => {
          setOn(v);
          store.set('settings.liveActivities', v);
          onChanged();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: { gap: theme.space.md, marginTop: theme.space.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.lg },
  tile: {
    alignItems: 'center',
    gap: theme.space.xs,
    minWidth: theme.size.hit,
    minHeight: theme.size.hit,
  },
  ring: (on: boolean) => ({
    padding: theme.space.xs,
    borderRadius: theme.radius.card,
    borderWidth: 2,
    borderColor: on ? theme.colors.ink : 'transparent',
  }),
  icon: {
    width: theme.size.avatarL,
    height: theme.size.avatarL,
    borderRadius: theme.radius.thumb + theme.space.xs,
  },
}));
