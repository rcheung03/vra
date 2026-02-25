# On-chain Deployment (Wallet Factory)

## Setup

1. `cd onchain`
2. `cp .env.example .env` and set:
   - `SEPOLIA_RPC_URL`
   - `AMOY_RPC_URL`
   - `ARBITRUM_SEPOLIA_RPC_URL`
   - `PRIVATE_KEY` (without `0x`)
3. Install base deps:
   - `yarn install`

## Required Hardhat Plugin Deps

If `hardhat compile` reports `HH801`, run all required installs below:

```bash
yarn add -D @nomicfoundation/hardhat-chai-matchers@^2.1.0 @nomicfoundation/hardhat-ethers@^3.1.0 @nomicfoundation/hardhat-ignition-ethers@^0.15.14 @nomicfoundation/hardhat-network-helpers@^1.1.0 @nomicfoundation/hardhat-verify@^2.1.0 @typechain/ethers-v6@^0.5.0 @typechain/hardhat@^9.0.0 @types/chai@^4.2.0 @types/mocha@^10.0.0 chai@^4.2.0 ethers@^6.14.0 hardhat-gas-reporter@^2.3.0 solidity-coverage@^0.8.1 ts-node@^10.9.2 typechain@^8.3.0

yarn add -D @nomicfoundation/hardhat-ignition@^0.15.16 @nomicfoundation/ignition-core@^0.15.15
```

## Compile

```bash
./node_modules/.bin/hardhat compile
```

## Deploy Factory (one per chain)

```bash
./node_modules/.bin/hardhat run scripts/deployFactory.js --network sepolia
./node_modules/.bin/hardhat run scripts/deployFactory.js --network amoy
./node_modules/.bin/hardhat run scripts/deployFactory.js --network arbitrumSepolia
```

Copy each output factory address into `app.json`:
- `expo.extra.FACTORY_ETHEREUM`
- `expo.extra.FACTORY_POLYGON`
- `expo.extra.FACTORY_ARBITRUM`

After this, app `Create` deploys directly from connected wallet via `RegistryFactory`.
