import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Linking, View, type TextInput } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/Chip';
import { Icon } from '@/components/icons/Icon';
import { Input } from '@/components/Input';
import { imageStyles } from '@/components/Photo';
import { ProgressBar } from '@/components/Progress';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { errorCopy, toAppError } from '@/lib/errors';
import type { PickedPhoto } from '@/lib/media';
import { primer, profileSetup as copy, states } from '@/strings';

import { authApi, type AuthApi, type ClassYear } from './api';
import { AuthStep } from './AuthStep';
import { avatarDeps, type AvatarDeps } from './avatar';
import { lastInitialOf, shownAs, validateName } from './logic';
import { useGateHandoff } from './useAppGate';

const YEARS = ['freshman', 'sophomore', 'junior', 'senior', 'grad'] as const;

type Photo =
  | { state: 'none' }
  | { state: 'uploading'; uri: string; progress: number }
  | { state: 'done'; uri: string; key: string }
  | { state: 'failed'; uri: string };

const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const NAME_ERROR = {
  empty: copy.nameEmpty,
  too_long: copy.nameTooLong,
  invalid: copy.nameInvalid,
} as const;

/**
 * A06 Profile setup (P4-AUTH-08, board A10). First name and last initial
 * only; the photo is optional, uploads while the rest is filled in, and is
 * stripped of EXIF on the phone before it leaves (P5-MEDIA-03).
 */
export function ProfileSetupScreen({
  api = authApi,
  avatar = avatarDeps,
}: {
  api?: AuthApi;
  avatar?: AvatarDeps;
}) {
  const handoff = useGateHandoff();
  const lastRef = useRef<TextInput>(null);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [year, setYear] = useState<ClassYear[]>([]);
  const [photo, setPhoto] = useState<Photo>({ state: 'none' });
  const [pickerBlocked, setPickerBlocked] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const uploadRun = useRef(0);

  const startUpload = async (picked: PickedPhoto) => {
    const run = ++uploadRun.current;
    setPhoto({ state: 'uploading', uri: picked.uri, progress: 0 });
    try {
      const key = await avatar.upload(picked, (progress) => {
        if (run === uploadRun.current) setPhoto({ state: 'uploading', uri: picked.uri, progress });
      });
      if (run === uploadRun.current) setPhoto({ state: 'done', uri: picked.uri, key });
    } catch {
      if (run === uploadRun.current) setPhoto({ state: 'failed', uri: picked.uri });
    }
  };

  const lastPicked = useRef<PickedPhoto | null>(null);
  const pickAndRemember = async () => {
    try {
      const picked = await avatar.pick();
      setPickerBlocked(false);
      if (!picked) return;
      lastPicked.current = picked;
      void startUpload(picked);
    } catch {
      setPickerBlocked(true);
    }
  };

  const removePhoto = () => {
    uploadRun.current++;
    lastPicked.current = null;
    setPhoto({ state: 'none' });
  };

  const submit = async () => {
    const verdict = validateName(first);
    if (verdict !== 'ok') {
      setNameError(NAME_ERROR[verdict]);
      return;
    }
    setNameError(null);
    setError(null);
    setSaving(true);
    try {
      await api.updateProfile({
        firstName: first.trim(),
        lastInitial: lastInitialOf(last),
        year: year[0] ?? null,
        avatarPath: photo.state === 'done' ? photo.key : null,
      });
      handoff();
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'INVALID' && err.detail === 'first_name') setNameError(copy.nameInvalid);
      else setError(errorCopy(err, { campusTimeZone: deviceTz() }));
      setSaving(false);
    }
  };

  const uploading = photo.state === 'uploading';
  const hasPhoto = photo.state !== 'none';
  const preview = first.trim() ? shownAs(first, last) : null;

  return (
    <AuthStep
      testID="screen-profile-setup"
      title={copy.title}
      body={copy.body}
      leading="none"
      trailing={
        <Text variant="meta" tone="ink2">
          {copy.step}
        </Text>
      }
      dock={
        <Button
          label={copy.continue}
          onPress={() => void submit()}
          loading={saving}
          disabled={uploading || saving}
          accessibilityHint={uploading ? copy.waitForPhoto : undefined}
          testID="profile-continue"
        />
      }
    >
      <View style={styles.photoRow}>
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={hasPhoto ? copy.changePhoto : copy.addPhoto}
          accessibilityHint={copy.photoHint}
          onPress={() => void pickAndRemember()}
          disabled={uploading || saving}
          testID="profile-photo"
        >
          <View style={styles.avatar}>
            {hasPhoto ? (
              <View style={styles.avatarClip}>
                <Image
                  source={{ uri: photo.uri }}
                  style={imageStyles.image}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              </View>
            ) : (
              <Icon name="user" size={32} tone="ink2" />
            )}
            <View style={styles.cameraBadge}>
              <Icon name="camera" size={15} tone="inverse" />
            </View>
          </View>
        </Tappable>
        <View style={styles.photoCopy}>
          <Text variant="bodyStrong">{hasPhoto ? copy.changePhoto : copy.addPhoto}</Text>
          <Text variant="meta" tone="ink2">
            {copy.photoHint}
          </Text>
          {hasPhoto && !uploading ? (
            <Tappable
              accessibilityRole="button"
              accessibilityLabel={copy.removePhoto}
              onPress={removePhoto}
              style={styles.remove}
              testID="profile-photo-remove"
            >
              <Text variant="label" tone="ink2">
                {copy.removePhoto}
              </Text>
            </Tappable>
          ) : null}
        </View>
      </View>

      {photo.state === 'uploading' ? (
        <ProgressBar
          value={photo.progress}
          label={copy.uploading}
          testID="profile-photo-progress"
        />
      ) : null}
      {photo.state === 'done' ? (
        <Text
          variant="meta"
          tone="green"
          accessibilityLiveRegion="polite"
          testID="profile-photo-done"
        >
          {copy.uploaded}
        </Text>
      ) : null}
      {photo.state === 'failed' ? (
        <View style={styles.inlineRow}>
          <Text variant="meta" tone="red" style={styles.flex} accessibilityLiveRegion="polite">
            {copy.uploadFailed}
          </Text>
          <Button
            label={states.retry}
            variant="secondary"
            size="S"
            fullWidth={false}
            onPress={() => lastPicked.current && void startUpload(lastPicked.current)}
            testID="profile-photo-retry"
          />
        </View>
      ) : null}
      {pickerBlocked ? (
        <View style={styles.blocked} testID="profile-photo-denied">
          <Text variant="label">{primer.photos.deniedTitle}</Text>
          <Text variant="meta" tone="ink2">
            {primer.photos.deniedBody}
          </Text>
          <Button
            label={primer.openSettings}
            variant="secondary"
            size="S"
            fullWidth={false}
            onPress={() => void Linking.openSettings()}
            testID="profile-photo-settings"
          />
        </View>
      ) : null}

      <Input
        label={copy.firstName}
        value={first}
        onChangeText={(v) => {
          setFirst(v);
          if (nameError) setNameError(null);
        }}
        error={nameError ?? undefined}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="next"
        onSubmitEditing={() => lastRef.current?.focus()}
        maxLength={30}
        testID="profile-first"
      />
      <Input
        ref={lastRef}
        label={copy.lastName}
        value={last}
        onChangeText={setLast}
        autoCapitalize="words"
        autoComplete="family-name"
        textContentType="familyName"
        returnKeyType="done"
        maxLength={30}
        testID="profile-last"
      />
      <Text variant="meta" tone="ink2" testID="profile-shown-as">
        {preview ? copy.shownAs.replace('{name}', preview) : copy.lastNameHint}
      </Text>

      <View style={styles.yearBlock}>
        <Text variant="label" tone="ink2">
          {copy.year}
        </Text>
        <ChipGroup
          label={copy.year}
          mode="single"
          options={YEARS.map((y) => ({ value: y, label: copy.years[y] }))}
          value={year}
          onChange={setYear}
        />
      </View>

      {error ? (
        <Text variant="meta" tone="red" accessibilityLiveRegion="polite" testID="profile-error">
          {error}
        </Text>
      ) : null}
    </AuthStep>
  );
}

const styles = StyleSheet.create((theme) => ({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.lg },
  avatar: {
    width: theme.size.avatarL,
    height: theme.size.avatarL,
    borderRadius: theme.radius.avatar,
    backgroundColor: theme.colors.bg2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarClip: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.avatar,
    overflow: 'hidden',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: theme.size.badge + theme.space.sm,
    height: theme.size.badge + theme.space.sm,
    borderRadius: theme.radius.avatar,
    backgroundColor: theme.colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCopy: { flex: 1, gap: theme.space.xs },
  remove: { alignSelf: 'flex-start', minHeight: theme.size.hit, justifyContent: 'center' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md },
  flex: { flex: 1 },
  blocked: {
    gap: theme.space.xs,
    padding: theme.space.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.bg2,
    alignItems: 'flex-start',
  },
  yearBlock: { gap: theme.space.sm, marginTop: theme.space.sm },
}));
