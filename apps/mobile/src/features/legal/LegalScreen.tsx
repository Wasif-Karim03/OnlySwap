import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { EmptyState } from '@/components/EmptyState';
import { NavBar } from '@/components/NavBar';
import { Text } from '@/components/Text';
import { fill } from '@/lib/format';
import { LEGAL, type LegalSlug } from '@/legal/generated';
import { legal as copy } from '@/strings';
import { readableColumn } from '@/theme/layout';

import { parseMarkdown, stackTables } from './markdown';

export function isLegalSlug(s: string | undefined): s is LegalSlug {
  return !!s && Object.prototype.hasOwnProperty.call(LEGAL, s);
}

/** Bundled legal pages (P14-LEGAL-01): readable offline, same text as the site. */
export function LegalScreen({ doc }: { doc: string | undefined }) {
  const router = useRouter();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const page = isLegalSlug(doc) ? LEGAL[doc] : null;
  const blocks = useMemo(() => (page ? stackTables(parseMarkdown(page.body)) : []), [page]);
  if (!page) {
    return (
      <View style={styles.root} testID="screen-legal-missing">
        <NavBar onLeading={leave} />
        <EmptyState
          icon="info"
          title={copy.missing}
          action={{ label: copy.back, onPress: leave }}
        />
      </View>
    );
  }
  return (
    <View style={styles.root} testID={`screen-legal-${doc}`}>
      <NavBar title={page.title} onLeading={leave} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="meta" tone="ink2">
          {fill(copy.version, { version: page.version })}
        </Text>
        {blocks.map((b, i) => {
          if (b.kind === 'h2' || b.kind === 'h3') {
            return (
              <Text
                key={i}
                variant={b.kind === 'h2' ? 'heading' : 'bodyStrong'}
                accessibilityRole="header"
                style={styles.heading}
              >
                {b.text}
              </Text>
            );
          }
          if (b.kind === 'li') {
            return (
              <View key={i} style={styles.li}>
                <Text variant="body" importantForAccessibility="no" accessibilityElementsHidden>
                  {b.marker}
                </Text>
                <Text variant="body" style={styles.flex}>
                  {b.text}
                </Text>
              </View>
            );
          }
          if (b.kind === 'record') {
            return (
              <View key={i} style={styles.record}>
                {b.fields.map((f, j) => (
                  <View key={j}>
                    {f.label ? (
                      <Text variant="label" tone="ink2">
                        {f.label}
                      </Text>
                    ) : null}
                    <Text variant="body">{f.value}</Text>
                  </View>
                ))}
              </View>
            );
          }
          return (
            <Text key={i} variant={b.strong ? 'bodyStrong' : 'body'}>
              {b.text}
            </Text>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  body: {
    ...readableColumn,
    padding: theme.space.screen,
    gap: theme.space.md,
    paddingBottom: theme.space['2xl'],
  },
  // Tighter section spacing (3.07): the column gap plus a small step.
  heading: { marginTop: theme.space.xs },
  li: { flexDirection: 'row', gap: theme.space.sm, paddingLeft: theme.space.xs },
  record: {
    gap: theme.space.sm,
    paddingVertical: theme.space.md,
    borderBottomWidth: 1,
    borderColor: theme.colors.line,
  },
  flex: { flex: 1 },
}));
