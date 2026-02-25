import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || Constants.manifest?.extra || {};

export const CHAIN_CONFIG = {
  ethereum: {
    chainId: 11155111,
    factoryAddress: extra.FACTORY_ETHEREUM || '',
  },
  polygon: {
    chainId: 80002,
    factoryAddress: extra.FACTORY_POLYGON || '',
  },
  arbitrum: {
    chainId: 421614,
    factoryAddress: extra.FACTORY_ARBITRUM || '',
  },
  solana: {
    chainId: null,
    factoryAddress: '',
  },
};

export const REGISTRY_FACTORY_ABI = [
  {
    type: 'function',
    name: 'createRegistry',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'templateType', type: 'uint8', internalType: 'uint8' },
      { name: 'configHash', type: 'bytes32', internalType: 'bytes32' },
      { name: 'name', type: 'string', internalType: 'string' },
    ],
    outputs: [
      { name: 'registryId', type: 'uint256', internalType: 'uint256' },
      { name: 'verificationRegistry', type: 'address', internalType: 'address' },
      { name: 'revocationRegistry', type: 'address', internalType: 'address' },
    ],
  },
  {
    type: 'event',
    name: 'RegistryCreated',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'registryId', type: 'uint256', internalType: 'uint256' },
      { indexed: true, name: 'owner', type: 'address', internalType: 'address' },
      { indexed: false, name: 'templateType', type: 'uint8', internalType: 'uint8' },
      { indexed: false, name: 'verificationRegistry', type: 'address', internalType: 'address' },
      { indexed: false, name: 'revocationRegistry', type: 'address', internalType: 'address' },
      { indexed: false, name: 'configHash', type: 'bytes32', internalType: 'bytes32' },
      { indexed: false, name: 'name', type: 'string', internalType: 'string' },
    ],
  },
];

export const TEMPLATE_TYPE_ID = {
  document: 0,
  dataset: 1,
  media: 2,
};
