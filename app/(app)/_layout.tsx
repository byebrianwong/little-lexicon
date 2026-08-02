import { Text } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { useAuthStore } from '@/features/auth/authStore';

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, color, opacity: color === '#6C8CFF' ? 1 : 0.7 }}>{emoji}</Text>;
}

export default function AppLayout() {
  const status = useAuthStore((s) => s.status);
  if (status === 'signedOut') return <Redirect href="/(auth)/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6C8CFF',
        tabBarInactiveTintColor: '#9AA7C7',
        tabBarStyle: {
          backgroundColor: '#151B2E',
          borderTopColor: '#2A3450',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Learn',
          tabBarIcon: ({ color }) => <TabIcon emoji="📚" color={color} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Words',
          tabBarIcon: ({ color }) => <TabIcon emoji="📖" color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color }) => <TabIcon emoji="📈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Ranks',
          tabBarIcon: ({ color }) => <TabIcon emoji="🏆" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon emoji="⚙️" color={color} />,
        }}
      />
    </Tabs>
  );
}
