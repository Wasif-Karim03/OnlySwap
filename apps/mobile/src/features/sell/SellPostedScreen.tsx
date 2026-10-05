import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { captureRef } from 'react-native-view-shot';

import { track } from '@/lib/analytics';
import { devTrace } from '@/lib/devTrace';
import { Button } from '@/components/Button';
import { NavBar } from '@/components/NavBar';
import { Photo } from '@/components/Photo';
import { SuccessCheck } from '@/components/SuccessCheck';
import { Text } from '@/components/Text';
import { getEnv } from '@/lib/env';
import { fill } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { sell as copy } from '@/strings';

import { sellApi, type SellApi } from './api';
import { listingLink, mediaUrl, priceLabel, type Condition, type ListingKind } from './logic';
import { usePostedStore } from './posted';
import { ShareCard } from './ShareCard';

export type CardState = 'preparing' | 'ready' | 'failed';

/** Captures the share card at 1200 × 630 JPEG q0.8 (MOB-06) and returns the file. */
export type Capture = (view: View) => Promise<string>;
const defaultCapture: Capture = (view) =>
  captureRef(view, { format: 'jpg', quality: 0.8, width: 1200, height: 630, result: 'tmpfile' });

/**
 * D04 Posted (P5-SELL-05; board D6). The share card is made right after
 * posting so the link preview has it; if that fails, Share still works with
 * the link alone (T-UNIT-MEDIA-06).
 */
export function SellPostedScreen({
  api = sellApi,
  capture = defaultCapture,
  share = (content) => Share.share(content),
  site = () => getEnv().EXPO_PUBLIC_SITE_URL,
  mediaBase = () => getEnv().EXPO_PUBLIC_MEDIA_URL,
  cardTimeoutMs = 6000,
}: {
  api?: SellApi;
  capture?: Capture;
  share?: (content: { message: string; url?: string }) => Promise<unknown>;
  site?: () => string;
  mediaBase?: () => string;
  cardTimeoutMs?: number;
}) {
  const router = useRouter();
  const listing = usePostedStore((s) => s.listing);
  const coverUri = usePostedStore((s) => s.coverUri);
  const [card, setCard] = useState<CardState>('preparing');
  const [campus, setCampus] = useState<string | null>(null);
  const [photoReady, setPhotoReady] = useState(false);
  const cardRef = useRef<View>(null);
  const started = useRef(false);

  const coverPath = listing?.photos[0]?.path;
  const cover = coverUri || (coverPath ? mediaUrl(mediaBase(), coverPath) : null);

  useEffect(() => {
    devTrace('posted: mounted');
    if (listing) haptic('success'); // Budget: "listing posted" (DESIGN_SYSTEM §5).
  }, [listing]);

  useEffect(() => {
    let alive = true;
    api
      .campusName()
      .then((name) => {
        devTrace('posted: campus');
        if (alive) setCampus(name);
      })
      .catch(() => alive && setCampus(null));
    return () => {
      alive = false;
    };
  }, [api]);

  // Capture once the photo has loaded (or after a timeout), then upload.
  useEffect(() => {
    if (!listing || started.current) return undefined;
    const go = async () => {
      if (started.current || !cardRef.current) return;
      started.current = true;
      try {
        devTrace('posted: capture start');
        const uri = await capture(cardRef.current);
        devTrace('posted: captured');
        await api.uploadShareCard(listing.id, uri);
        devTrace('posted: card uploaded');
        setCard('ready');
      } catch {
        devTrace('posted: card failed');
        setCard('failed');
      }
    };
    if (photoReady || !cover) {
      void go();
      return undefined;
    }
    const t = setTimeout(() => void go(), cardTimeoutMs);
    return () => clearTimeout(t);
  }, [listing, photoReady, cover, capture, api, cardTimeoutMs]);

  if (!listing) {
    // Opened without a fresh post (e.g. after a reload): back to the start.
    return (
      <View style={styles.root} testID="screen-sell-posted-empty">
        <NavBar leading="close" onLeading={() => router.replace('/sell')} />
      </View>
    );
  }

  const price = priceLabel(listing.kind as ListingKind, listing.price_cents, copy.free);
  const inReview = listing.status === 'held_review';
  const tags = [
    listing.condition
      ? fill(copy.cardCondition, { condition: copy.conditions[listing.condition as Condition] })
      : null,
    campus ? fill(copy.cardCampus, { campus }) : null,
  ].filter((t): t is string => Boolean(t));

  const onShare = async () => {
    const url = listingLink(site(), listing.id);
    const text = fill(copy.shareMessage, { title: listing.title, price });
    // iOS attaches the url itself (and shows the link preview); Android only sends the message.
    track('share_tapped', { surface: 'posted' });
    await share(Platform.OS === 'ios' ? { message: text, url } : { message: `${text} ${url}` });
  };

  const listAnother = () => {
    usePostedStore.getState().clear();
    router.replace('/sell');
  };

  return (
    <View style={styles.root} testID="screen-sell-posted">
      <ShareCard
        ref={cardRef}
        photo={cover}
        price={price}
        title={listing.title}
        tags={tags}
        onReady={() => {
          devTrace('posted: photo loaded');
          setPhotoReady(true);
        }}
      />
      <NavBar
        leading="close"
        onLeading={() => {
          usePostedStore.getState().clear();
          router.navigate('/discover');
        }}
      />
      <View style={styles.body}>
        <View style={styles.hero}>
          <Photo
            source={cover}
            blurhash={listing.photos[0]?.blurhash}
            rounded="card"
            aspectRatio={1}
          />
          <View style={styles.pill}>
            <Text variant="bodyStrong" tone="onPhoto">
              {price}
            </Text>
          </View>
        </View>
        <SuccessCheck visible accessibilityLabel={copy.postedCheck} />
        <Text variant="title" accessibilityRole="header" style={styles.center}>
          {inReview ? copy.reviewTitle : copy.postedTitle}
        </Text>
        <Text variant="body" tone="ink2" style={styles.center}>
          {inReview ? copy.reviewBody : copy.postedBody}
        </Text>
        {card === 'preparing' ? (
          <Text variant="meta" tone="ink2" style={styles.center} testID="sell-card-preparing">
            {copy.cardPreparing}
          </Text>
        ) : card === 'failed' ? (
          <Text variant="meta" tone="ink2" style={styles.center} testID="sell-card-failed">
            {copy.cardFailed}
          </Text>
        ) : null}
      </View>
      <View style={styles.dock}>
        {inReview ? null : (
          <Button label={copy.share} onPress={() => void onShare()} testID="sell-share" />
        )}
        <Button
          label={copy.listAnother}
          variant="text"
          onPress={listAnother}
          testID="sell-list-another"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: {
    flex: 1,
    paddingHorizontal: theme.space.screen,
    alignItems: 'center',
    gap: theme.space.md,
  },
  hero: { width: '70%', maxWidth: 300 },
  pill: {
    position: 'absolute',
    left: theme.space.sm,
    bottom: theme.space.sm,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.thumb,
    backgroundColor: theme.colors.overlay,
  },
  center: { textAlign: 'center', maxWidth: theme.size.copyMax },
  dock: {
    paddingHorizontal: theme.space.screen,
    paddingBottom: rt.insets.bottom + theme.space.md,
    gap: theme.space.xs,
  },
}));
