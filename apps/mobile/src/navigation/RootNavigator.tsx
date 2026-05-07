// ============================================================
// Fuelyn Mobile - Root Navigation
// ============================================================

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeScreen } from '../screens/HomeScreen';
import { StationDetailScreen } from '../screens/StationDetailScreen';
import { FavoritesScreen } from '../screens/FavoritesScreen';
import { VehicleScreen } from '../screens/VehicleScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

// Type definitions

export type RootStackParamList = {
  Main: undefined;
  StationDetail: { stationId: string };
};

export type TabParamList = {
  Home: undefined;
  Favorites: undefined;
  Vehicle: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Tab navigator

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2575EA',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Tankstellen' }}
      />
      <Tab.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ tabBarLabel: 'Favoriten' }}
      />
      <Tab.Screen
        name="Vehicle"
        component={VehicleScreen}
        options={{ tabBarLabel: 'Fahrzeug' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Einstellungen' }}
      />
    </Tab.Navigator>
  );
}

// Root stack

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Main" component={TabNavigator} />
        <Stack.Screen name="StationDetail" component={StationDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
