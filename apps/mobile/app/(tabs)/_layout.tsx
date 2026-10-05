import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useKeyboardState } from 'react-native-keyboard-controller';

import { TabBar, type TabItem } from '@/components/TabBar';
import { useQuadStatus } from '@/features/quad/cache';
import { usePushHandling } from '@/lib/push';
import { tabs } from '@/strings';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// Tabs (DESIGN_SYSTEM D1): Discover, Quad (only when the campus has it on),
// Sell, Inbox, Profile. Badges are wired with the inbox (P7).
const ITEMS: Record<string, Omit<TabItem, 'key'>> = {
  discover: { label: tabs.discover, icon: 'cards' },
  quad: { label: tabs.quad, icon: 'quad' },
  sell: { label: tabs.sell, icon: 'plussq' },
  inbox: { label: tabs.inbox, icon: 'chat' },
  profile: { label: tabs.profile, icon: 'user' },
};

/** Adapts React Navigation's tab state to the TabBar component (P2-CMP-09). */
function AppTabBar({ state, navigation, quadOn }: TabBarProps & { quadOn: boolean }) {
  // Hidden while typing (both platforms), so the screen reaches the keyboard
  // and a docked button sits right on top of it instead of floating a tab
  // bar's height higher over the fields (owner testing on Android).
  const keyboardOpen = useKeyboardState((s) => s.isVisible);
  if (keyboardOpen) return null;
  const items = state.routes
    .filter((route) => quadOn || route.name !== 'quad')
    .map((route) => ({ key: route.key, ...ITEMS[route.name]! }));
  const activeKey = state.routes[state.index]!.key;
  return (
    <TabBar
      testID="tab-bar"
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
  // P10-QUAD-02: the Quad tab exists only where the campus switched it on.
  const quadOn = useQuadStatus().data?.enabled === true;
  return (
    <Tabs
      initialRouteName="discover"
      tabBar={(props) => <AppTabBar {...props} quadOn={quadOn} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="discover" options={{ title: tabs.discover }} />
      <Tabs.Screen name="quad" options={{ title: tabs.quad, href: quadOn ? undefined : null }} />
      <Tabs.Screen name="sell" options={{ title: tabs.sell }} />
      <Tabs.Screen name="inbox" options={{ title: tabs.inbox }} />
      <Tabs.Screen name="profile" options={{ title: tabs.profile }} />
    </Tabs>
  );
}
