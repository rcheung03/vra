import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { sepolia, mainnet } from '@reown/appkit/networks';

// 1. Project ID
const projectId = "0cce245d34bb09adb3aadf8f9616a9bc";

// 2. Web Metadata
const metadata = {
  name: "Vera",
  description: "Document verification on blockchain",
  url: typeof window !== 'undefined' ? window.location.origin : "https://blockthentic.app",
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
};

// 3. Define networks
const networks = [sepolia, mainnet];

// 4. Create Web Wagmi Adapter
export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
});

// 5. Create Web AppKit Instance
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata,
  defaultNetwork: sepolia,
  features: {
    analytics: false
  }
});

export { useAppKit } from '@reown/appkit/react';

export const AppKit = () => null;
export const AppKitProvider = ({ children }) => <>{children}</>;