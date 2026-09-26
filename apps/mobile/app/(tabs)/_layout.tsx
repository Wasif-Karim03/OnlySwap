import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { TabBar, type TabItem } from '@/components/TabBar';
import { tabs } from '@/strings/en';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// R1.0 tabs (DESIGN_SYSTEM D1). Badges are wired with the inbox (P7).
const ITEMS: Record<string, Omit<TabItem, 'key'>> = {
  discover: { label: tabs.discover, icon: 'cards' },
  sell: { label: tabs.sell, icon: 'plussq' },
  inbox: { label: tabs.inbox, icon: 'chat' },
  profile: { label: tabs.profile, icon: 'user' },
};

/** Adapts React Navigation's tab state to the TabBar component (P2-CMP-09). */
function AppTabBar({ state, navigation }: TabBarProps) {
  const items = state.routes.map((route) => ({ key: route.key, ...ITEMS[route.name]! }));
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
  return (
    <Tabs
      initialRouteName="discover"
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="discover" options={{ title: tabs.discover }} />
      <Tabs.Screen name="sell" options={{ title: tabs.sell }} />
      <Tabs.Screen name="inbox" options={{ title: tabs.inbox }} />
      <Tabs.Screen name="profile" options={{ title: tabs.profile }} />
    </Tabs>
  );
}
