import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useKeyboardState } from 'react-native-keyboard-controller';

import { TabBar, type TabItem } from '@/components/TabBar';
import { useTabPrefetch } from '@/features/me/useTabPrefetch';
import { usePushHandling } from '@/lib/push';
import { tabs } from '@/strings';
import { useLayout } from '@/theme/layout';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// Tabs (DESIGN_SYSTEM D1, DEC 98, DEC 130): Discover, Feed, Sell, Inbox,
// Profile, with Sell in the middle of five. The Quad is a chip inside the Feed
// now; its route stays only so old /quad links land on that chip.
const ITEMS: Record<string, Omit<TabItem, 'key'>> = {
  discover: { label: tabs.discover, icon: 'cards' },
  feed: { label: tabs.feed, icon: 'users' },
  // DEC 90: the center Sell tab is an accent rounded rectangle with a plus.
  sell: { label: tabs.sell, icon: 'plus', prominent: true },
  inbox: { label: tabs.inbox, icon: 'chat' },
  profile: { label: tabs.profile, icon: 'user' },
};

/** Adapts React Navigation's tab state to the TabBar component (P2-CMP-09). */
function AppTabBar({ state, navigation, rail }: TabBarProps & { rail: boolean }) {
  // Hidden while typing (both platforms), so the screen reaches the keyboard
  // and a docked button sits right on top of it instead of floating a tab
  // bar's height higher over the fields (owner testing on Android). The iPad
  // sidebar takes no height, so it stays.
  const keyboardOpen = useKeyboardState((s) => s.isVisible);
  if (keyboardOpen && !rail) return null;
  const items = state.routes
    .filter((route) => route.name in ITEMS)
    .map((route) => ({ key: route.key, ...ITEMS[route.name]! }));
  const activeKey = state.routes[state.index]!.key;
  return (
    <TabBar
      testID="tab-bar"
      layout={rail ? 'rail' : 'bar'}
      items={items}
      activeKey={activeKey}
      onSelect={(key) => {
        const route = state.routes.find((r) => r.key === key)!;
        const event = navigation.emit({ type: 'tabPress', target: key, canPreventDefault: true });
        if (key !== activeKey && !event.defaultPrevented) {
          navigation.navigate(route.name, route.params);
        }
      }}
      onLongPress={(key) => navigation.emit({ type: 'tabLongPress', target: key })}
    />
  );
}

export default function TabsLayout() {
  // Signed-in area: pushes open the right screen and the token stays registered (P9-PUSH-02).
  usePushHandling(true);
  // First visits to Profile and Inbox open on data, not a skeleton.
  useTabPrefetch();
  // iPad, wide window: a sidebar on the left instead of bottom tabs (board N5/N6).
  const rail = useLayout().wide;
  return (
    <Tabs
      initialRouteName="discover"
      tabBar={(props) => <AppTabBar {...props} rail={rail} />}
      // freezeOnBlur: tabs you aren't looking at stop re-rendering (they caught
      // every cache and realtime update before, which kept the phone warm).
      // They catch up the moment they come back into view.
      screenOptions={{
        headerShown: false,
        tabBarPosition: rail ? 'left' : 'bottom',
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen name="discover" options={{ title: tabs.discover }} />
      <Tabs.Screen name="feed" options={{ title: tabs.feed }} />
      {/* Sell starts at step 1 every time it's opened again, so + never lands
          on an old Posted screen (UX audit 2026-10-25). The draft is kept. */}
      <Tabs.Screen name="sell" options={{ title: tabs.sell, popToTopOnBlur: true }} />
      <Tabs.Screen name="quad" options={{ title: tabs.quad, href: null }} />
      <Tabs.Screen name="inbox" options={{ title: tabs.inbox }} />
      <Tabs.Screen name="profile" options={{ title: tabs.profile }} />
    </Tabs>
  );
}
