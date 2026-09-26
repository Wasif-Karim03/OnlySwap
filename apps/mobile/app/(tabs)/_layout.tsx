import { Tabs } from 'expo-router';

import { tabs } from '@/strings/en';

// Label-only tab bar until the TabBar component lands (S5, P2-CMP-*).
const noIcon = () => null;

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="discover"
      screenOptions={{
        headerShown: false,
        tabBarIcon: noIcon,
        tabBarIconStyle: { display: 'none' },
        tabBarAllowFontScaling: true,
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{ title: tabs.discover, tabBarAccessibilityLabel: tabs.discover }}
      />
      <Tabs.Screen
        name="sell"
        options={{ title: tabs.sell, tabBarAccessibilityLabel: tabs.sell }}
      />
      <Tabs.Screen
        name="inbox"
        options={{ title: tabs.inbox, tabBarAccessibilityLabel: tabs.inbox }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: tabs.profile, tabBarAccessibilityLabel: tabs.profile }}
      />
    </Tabs>
  );
}
