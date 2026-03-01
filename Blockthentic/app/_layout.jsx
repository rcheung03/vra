import React, { useEffect } from 'react';
import { Platform } from 'react-native'; 
import '@walletconnect/react-native-compat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { Stack } from 'expo-router';


import { appKit, wagmiAdapter, AppKit, AppKitProvider } from '../config/AppKitConfig';
import { AuthProvider } from '../context/AuthContext';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: 'ionicons';
      src: url('https://unpkg.com/ionicons@5.5.2/dist/fonts/ionicons.ttf') format('truetype');
    }
    @font-face {
      font-family: 'Ionicons';
      src: url('https://unpkg.com/ionicons@5.5.2/dist/fonts/ionicons.ttf') format('truetype');
    }
    body, html, #root {
      margin: 0 !important;
      padding: 0 !important;
      background-color: #bdc8fe; 
    }
  `;
  document.head.appendChild(style);
}

const queryClient = new QueryClient();
const RESET_MARKER_KEY = '__wc_reset_epoch_applied__';

function normalizeLogArg(arg) {
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function shouldSuppressWalletConnectNoise(args) {
  const text = args.map(normalizeLogArg).join(' ').toLowerCase();
  return (
    text.includes('failed to decode message from topic') ||
    text.includes('decoded payload on topic') && text.includes('json-rpc request or a response') ||
    text.includes('missing or invalid. decoded payload on topic')
  );
}

function getRequestedResetEpoch() {
  return process.env.EXPO_PUBLIC_WC_RESET_EPOCH || '';
}

async function clearWalletConnectStorage() {
  const keys = await AsyncStorage.getAllKeys();
  const wcKeys = keys.filter(
    (key) =>
      key.includes('wc@2') ||
      key.includes('walletconnect') ||
      key.includes('WALLETCONNECT_DEEPLINK_CHOICE')
  );

  if (wcKeys.length > 0) {
    await AsyncStorage.multiRemove(wcKeys);
  }
}

async function applyWalletConnectResetPolicy() {
  try {
    const requestedEpoch = getRequestedResetEpoch();
    if (!requestedEpoch) return;

    const appliedEpoch = (await AsyncStorage.getItem(RESET_MARKER_KEY)) || '';
    if (appliedEpoch === requestedEpoch) return;

    await clearWalletConnectStorage();
    await AsyncStorage.setItem(RESET_MARKER_KEY, requestedEpoch);
  } catch (error) {
    console.error('WalletConnect reset policy failed:', error);
  }
}

// --- MAIN LAYOUT COMPONENT ---
export default function Layout() {
  useEffect(() => {
    applyWalletConnectResetPolicy();
  }, []);

  useEffect(() => {
    if (!__DEV__) return;

    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
      if (shouldSuppressWalletConnectNoise(args)) return;
      originalError(...args);
    };

    console.warn = (...args) => {
      if (shouldSuppressWalletConnectNoise(args)) return;
      originalWarn(...args);
    };

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AppKitProvider instance={appKit}>
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="auth" />
              <Stack.Screen name="(tabs)" />
            </Stack>

            <AppKit />
          </AuthProvider>
        </AppKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}