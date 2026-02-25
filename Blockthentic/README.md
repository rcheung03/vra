# Blockchain Registry App

Mobile app for creating blockchain registries, registering file hashes, and verifying records across:
- Ethereum Sepolia
- Polygon Amoy
- Arbitrum Sepolia

## Current Feature Status

### Implemented
- Auth + user profile via Supabase
- Create registry by deploying template contract via `RegistryFactory`
- Persist registries in Supabase
- Register file/hash on-chain (`registerDocument`, `registerDataset`, `registerMedia`)
- Verify file/hash against selected registry (`verifyDocument`, `verifyDataset`, `verifyImage`)
- Profile wallet controls in-app (`Connect/Disconnect`, `Wallet Settings`, `Switch Network`)

### Important: Access Controls Today
The Create screen stores these fields in registry config metadata:
- `access_mode`: `owner_only`, `whitelist`, `public_read`
- `required_approvals`: `1`, `2`, `3`

Current deployed template contracts do **not** enforce these yet.
Actual write access today is enforced by contract `onlyOwner`.

So currently:
- `public_read` / `whitelist` are policy intent labels in metadata.
- `required_approvals` is also metadata intent.
- On-chain writes still require owner signer only.

## Setup

1. Install dependencies
```bash
yarn install
```

2. Configure `app.json` (`expo.extra`)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `FACTORY_ETHEREUM`
- `FACTORY_POLYGON`
- `FACTORY_ARBITRUM`

3. Run SQL schema
- Execute `sql/init.sql` in Supabase SQL editor.

4. Start app
```bash
yarn start -c
```

## WalletConnect Session Behavior

By default, wallet sessions persist across restarts.

If you want to force a fresh wallet session for a dev run:
```powershell
$env:EXPO_PUBLIC_WC_RESET_EPOCH=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
yarn start -c
```

## On-chain Contracts
See `onchain/README.md` for compile/deploy steps for `RegistryFactory` and templates.
