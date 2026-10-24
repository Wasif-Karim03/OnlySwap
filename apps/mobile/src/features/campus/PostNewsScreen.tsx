import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { NavBar } from '@/components/NavBar';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { TextArea } from '@/components/TextArea';
import { Toggle } from '@/components/Toggle';
import { WebDateInput } from '@/components/WebDateInput';
import { getEnv } from '@/lib/env';
import { pickPhotos, type PickedPhoto } from '@/lib/media';
import { osPermissions, type OsApi } from '@/lib/permissions';
import { isWebPlatform } from '@/lib/platform';
import { campus as copy, intlLocale } from '@/strings';
import { useToastStore } from '@/components/Toast';

import { sellApi, type PostedListing, type SellApi } from '../sell/api';
import { DESCRIPTION_MAX, MEET_NOTE_MAX, TITLE_MAX } from '../sell/logic';
import { timeLabel, timeOptions } from '../meetups/logic';
import { campusKeys, newsApi, type NewsApi } from './api';
import {
  combineDayTime,
  formErrorText,
  LINK_MAX,
  NEWS_PHOTOS_MAX,
  newsArgs,
  validateNews,
  type FormError,
} from './logic';
import {
  PhotosField,
  PostedView,
  PostForm,
  postFailure,
  usePostPhotos,
  useReservedId,
  type PhotoSource,
} from './PostShared';

type Deps = {
  api?: Pick<SellApi, 'reserveListingId' | 'uploadPhoto'> & NewsApi;
  pick?: (source: PhotoSource, limit: number) => Promise<PickedPhoto[]>;
  photosOs?: OsApi;
  cameraOs?: OsApi;
  openSettings?: () => Promise<unknown>;
  mediaBase?: () => string;
  now?: () => Date;
};

const defaultApi = { ...sellApi, ...newsApi };

/**
 * Post news (DEC 98): a headline, optional details, up to 4 photos, an
 * optional link and, for an event, a date, time and place. Any verified
 * student; it shows with their name. create_news hides it after the event's
 * day, or after 14 days; 3 a day.
 */
export function PostNewsScreen({
  api = defaultApi,
  pick = (source, limit) => pickPhotos(source, limit),
  photosOs = osPermissions.photos,
  cameraOs = osPermissions.camera,
  openSettings = () => Linking.openSettings(),
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  now = () => new Date(),
}: Deps) {
  const router = useRouter();
  const qc = useQueryClient();
  const reserved = useReservedId(api);
  const photos = usePostPhotos({
    api,
    reserve: reserved.get,
    pick,
    photosOs,
    cameraOs,
    max: NEWS_PHOTOS_MAX,
  });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [isEvent, setIsEvent] = useState(false);
  const [day, setDay] = useState<Date | null>(null);
  const [time, setTime] = useState<Date | null>(null);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const { theme } = useUnistyles();
  const [place, setPlace] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<PostedListing | null>(null);

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/feed'));
  const form = {
    title,
    description,
    link,
    isEvent,
    eventAt: day && time ? combineDayTime(day, time) : null,
    place,
    photos: photos.photos,
  };
  const errors = validateNews(form, now());
  const errorFor = (field: FormError['field']) => {
    if (!showErrors) return undefined;
    const e = errors.find((x) => x.field === field);
    return e ? formErrorText(e) : undefined;
  };

  const submit = async () => {
    if (posting || photos.busy) return;
    setError(null);
    if (errors.length > 0) {
      setShowErrors(true);
      // The dock line says it too; the Toast stays here by owner request
      // (2026-10-15, pinned by campusNews.test).
      useToastStore.getState().show('error', copy.fixFirst);
      return;
    }
    setPosting(true);
    try {
      const id = await reserved.get();
      const listing = await api.createNews(newsArgs(id, form));
      void qc.invalidateQueries({ queryKey: campusKeys.all });
      setPosted(listing);
    } catch (e) {
      const f = postFailure(e);
      if (f.forbidden) reserved.drop();
      setError(f.text);
    } finally {
      setPosting(false);
    }
  };

  const onPick = (e: DateTimePickerEvent, value?: Date) => {
    const which = picker;
    if (Platform.OS === 'android') setPicker(null);
    if (e.type !== 'set' || !value) return;
    if (which === 'date') setDay(value);
    else setTime(value);
  };

  if (posted) {
    return (
      <View style={styles.root}>
        <NavBar leading="close" onLeading={leave} />
        <PostedView
          listing={posted}
          title={copy.newsPostedTitle}
          body={copy.newsPostedBody}
          onSeeFeed={() => router.navigate({ pathname: '/feed', params: { kind: 'news' } })}
          onDone={leave}
          testID="news-posted"
        />
      </View>
    );
  }

  const eventError = errorFor('event');
  const today = now();
  const lastDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 90);

  return (
    <PostForm
      title={copy.newsTitle}
      onClose={leave}
      fixing={showErrors && errors.length > 0}
      error={error}
      posting={posting}
      disabled={photos.busy}
      onPost={() => void submit()}
      testID="news"
      screenTestID="screen-post-news"
    >
      <View style={styles.gap}>
        <Input
          label={copy.newsWhat}
          placeholder={copy.newsWhatPlaceholder}
          value={title}
          onChangeText={setTitle}
          maxLength={TITLE_MAX}
          error={errorFor('title')}
          testID="news-title"
        />
        {/* The trust fact, up front as one line instead of a note box (3.03). */}
        <Text variant="meta" tone="ink2">
          {copy.newsNote}
        </Text>
      </View>
      <TextArea
        label={copy.newsDetails}
        placeholder={copy.newsDetailsPlaceholder}
        value={description}
        onChangeText={setDescription}
        maxLength={DESCRIPTION_MAX}
        error={errorFor('description')}
        testID="news-details"
      />

      <View style={styles.gap}>
        <Input
          label={copy.newsLink}
          placeholder={copy.newsLinkPlaceholder}
          value={link}
          onChangeText={setLink}
          maxLength={LINK_MAX + 8}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          textContentType="URL"
          error={errorFor('link')}
          testID="news-link"
        />
        <Text variant="meta" tone="ink2">
          {copy.newsLinkHint}
        </Text>
      </View>

      <PhotosField
        state={photos}
        label={copy.newsPhotos}
        mediaBase={mediaBase()}
        onOpenSettings={() => void openSettings()}
        testID="news"
      />

      <View style={styles.gap}>
        <Toggle label={copy.newsEvent} value={isEvent} onChange={setIsEvent} />
        {isEvent ? (
          <View style={styles.gap} testID="news-event">
            {isWebPlatform() ? (
              <>
                <WebDateInput
                  value={day}
                  min={today}
                  max={lastDay}
                  label={copy.newsDate}
                  onChange={setDay}
                  testID="news-date-web"
                />
                {day ? (
                  <View style={styles.chips} testID="news-times-web">
                    {timeOptions(day, today).map((t) => (
                      <Button
                        key={t.getTime()}
                        label={timeLabel(t)}
                        variant={
                          time && t.getTime() === combineDayTime(day, time).getTime()
                            ? 'dark'
                            : 'secondary'
                        }
                        size="S"
                        fullWidth={false}
                        onPress={() => setTime(t)}
                      />
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.pickRow}>
                <PickField
                  label={copy.newsDate}
                  value={
                    day
                      ? day.toLocaleDateString(intlLocale, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })
                      : copy.newsPickDate
                  }
                  filled={day !== null}
                  onPress={() => setPicker('date')}
                  testID="news-date"
                />
                <PickField
                  label={copy.newsTime}
                  value={time ? timeLabel(time) : copy.newsPickTime}
                  filled={time !== null}
                  onPress={() => setPicker('time')}
                  testID="news-time"
                />
              </View>
            )}
            {picker && !isWebPlatform() ? (
              <DateTimePicker
                value={(picker === 'date' ? day : time) ?? today}
                mode={picker}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={picker === 'date' ? today : undefined}
                maximumDate={picker === 'date' ? lastDay : undefined}
                minuteInterval={5}
                onChange={onPick}
                // The wheels draw in the app theme, not the OS one, so the text
                // never comes out white on a white screen (or black on black).
                textColor={theme.colors.ink}
                themeVariant={theme.mode}
                testID="news-picker"
              />
            ) : null}
            {picker && Platform.OS === 'ios' ? (
              <Button
                label={copy.done}
                variant="secondary"
                size="S"
                fullWidth={false}
                onPress={() => setPicker(null)}
                testID="news-picker-done"
              />
            ) : null}
            {eventError ? (
              <Text
                variant="meta"
                tone="red"
                accessibilityLiveRegion="polite"
                testID="news-event-error"
              >
                {eventError}
              </Text>
            ) : null}
            <Input
              label={copy.newsPlace}
              placeholder={copy.newsPlacePlaceholder}
              value={place}
              onChangeText={setPlace}
              maxLength={MEET_NOTE_MAX}
              error={errorFor('place')}
              testID="news-place"
            />
          </View>
        ) : null}
      </View>
    </PostForm>
  );
}

/** A tappable field that opens the date or time picker. */
function PickField({
  label,
  value,
  filled,
  onPress,
  testID,
}: {
  label: string;
  value: string;
  filled: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      onPress={onPress}
      style={styles.flex}
      testID={testID}
    >
      <View style={styles.field}>
        <Text variant="meta" tone="ink3">
          {label}
        </Text>
        <Text variant="bodyStrong" tone={filled ? 'ink' : 'ink3'} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </Tappable>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  flex: { flex: 1 },
  gap: { gap: theme.space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  pickRow: { flexDirection: 'row', gap: theme.space.sm },
  field: {
    minHeight: theme.size.hit,
    gap: 2,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.bg2,
  },
}));
