import './global.css';
import React, { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { handleAuthUrl } from './src/lib/authLink';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ScanScreen from './src/screens/ScanScreen';
import ConfirmScreen from './src/screens/ConfirmScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: '#EEF1F0', primary: '#10201E' } };

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#10201E',
        tabBarInactiveTintColor: '#5E6F6C',
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarItemStyle: { justifyContent: 'center' },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const { session, loading } = useAuth();
  if (loading) return <View className="flex-1 items-center justify-center bg-paper"><ActivityIndicator /></View>;
  if (!session) return <AuthScreen />;
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={Tabs} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="Confirm" component={ConfirmScreen} />
    </Stack.Navigator>
  );
}

// Listens for the email confirmation link and signs the user in
function useAuthLinks() {
  useEffect(() => {
    Linking.getInitialURL().then(handleAuthUrl);                       // app opened by the link
    const sub = Linking.addEventListener('url', (e) => {               // app already running
      handleAuthUrl(e.url);
    });
    return () => sub.remove();
  }, []);
}

export default function App() {
  useAuthLinks();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={theme}>
          <StatusBar style="dark" />
          <Root />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}