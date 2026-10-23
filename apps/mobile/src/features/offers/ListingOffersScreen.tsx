import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { NavBar } from '@/components/NavBar';
import { SkeletonList } from '@/components/Skeleton';
import { Tappable } from '@/components/Tappable';
import { Text } from '@/components/Text';
import { intlLocale, offers as copy } from '@/strings';

import { offersApi, type OffersApi } from './api';
import { money, offerLineShort, offerView, shortAgo } from './logic';

/** "Sam offered. 2h" / "Declined. Mon": no doubled period after a full sentence. */
function withTime(line: string, when: string): string {
  return `${line}${line.endsWith('.') ? '' : '.'} ${when}`;
}

/** F05 Offers on this listing (P7-OFF-05, P7-OFF-07): the seller's history, in arrival order. */
export function ListingOffersScreen({
  listingId,
  api = offersApi,
  now = () => new Date(),
}: {
  listingId: string;
  api?: OffersApi;
  now?: () => Date;
}) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ['listing-offers', listingId],
    queryFn: () => api.listingOffers(listingId),
  });
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/inbox'));

  let body;
  if (query.isPending) body = <SkeletonList />;
  else if (query.isError) body = <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  else if (query.data.length === 0)
    body = (
      <EmptyState
        icon="tag"
        title={copy.noOffers}
        body={copy.noOffersBody}
        testID="listing-offers-empty"
      />
    );
  else
    body = (
      <FlatList
        data={query.data}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
        renderItem={({ item: o }) => {
          const v = offerView(o);
          const buyer = o.other?.display_name ?? copy.deletedUser;
          const amount = money(o.amount_cents);
          const when = shortAgo(o.responded_at ?? o.created_at, now(), intlLocale);
          return (
            <Tappable
              accessibilityRole="button"
              // The full line keeps the amount for VoiceOver; the visible one is short.
              accessibilityLabel={`${buyer}, ${amount}, ${v.line}`}
              onPress={() => router.push({ pathname: '/offer/[id]', params: { id: o.id } })}
              testID={`listing-offer-${o.id}`}
            >
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {buyer}
                  </Text>
                  <Text variant="meta" tone="ink2">
                    {withTime(offerLineShort(o, v.line), when)}
                  </Text>
                </View>
                <Text variant="bodyStrong">{amount}</Text>
              </View>
            </Tappable>
          );
        }}
      />
    );

  return (
    <View style={styles.root} testID="screen-listing-offers">
      <NavBar title={copy.listingOffersTitle} onLeading={leave} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  list: { paddingHorizontal: theme.space.screen },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.space.rowMin,
    paddingVertical: theme.space.md,
    borderBottomWidth: 1,
    borderColor: theme.colors.line,
  },
  flex: { flex: 1 },
}));
