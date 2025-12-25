import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Lattice Launchpad',
  projectId: '91b5d77c7e6248fcb455c5f0e5f60d4a',
  chains: [sepolia],
  ssr: false,
});
