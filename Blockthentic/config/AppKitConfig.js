import { createAppKit } from '@reown/appkit-react-native';
import { WagmiAdapter } from '@reown/appkit-wagmi-react-native';
import {
  arbitrumSepolia as appkitArbitrumSepolia,  polygonAmoy as appkitPolygonAmoy,
  sepolia as appkitSepolia,
} from '@reown/appkit/networks';
import '@walletconnect/react-native-compat';
import {
  arbitrumSepolia as viemArbitrumSepolia,  polygonAmoy as viemPolygonAmoy,
  sepolia as viemSepolia,
} from 'viem/chains';
import { storage } from './StorageUtil';

const projectId = '0cce245d34bb09adb3aadf8f9616a9bc';

const metadata = {
  name: 'Blockthentic',
  description: 'Document verification on blockchain',
  url: 'https://blockthentic.app',
  icons: ['https://avatars.githubusercontent.com/u/179229932'],
  redirect: {
    native: 'blockthentic://',
  },
};

const wagmiNetworks = [viemSepolia, viemPolygonAmoy, viemArbitrumSepolia];
const appkitNetworks = [appkitSepolia, appkitPolygonAmoy, appkitArbitrumSepolia];

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: wagmiNetworks,
  defaultChain: viemSepolia,
});

export const appKit = createAppKit({
  projectId,
  metadata,
  networks: appkitNetworks,
  defaultNetwork: appkitSepolia,
  adapters: [wagmiAdapter],
  storage,
  enableAnalytics: false,
});

