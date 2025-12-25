# LatticeLaunch

LatticeLaunch is a privacy-first token launchpad for ERC7984 (FHE-enabled) tokens. It lets users create confidential
tokens, list every launched token in a shared catalog, buy them with ETH, and view encrypted balances with on-demand
decryption via the Zama relayer.

## Overview

LatticeLaunch combines a token factory, confidential ERC7984 token contracts, and a React frontend to provide an end-to-
end launch flow. Token balances are stored encrypted on-chain using Fully Homomorphic Encryption (FHE), so ownership and
transfers remain private while still being verifiable and usable.

## Problems Solved

- Public ERC20 balances leak user positions, trading intent, and holdings.
- Token creators have no privacy-preserving way to distribute and sell supply.
- Users need a simple path to create, discover, and buy FHE-enabled tokens without custodians or off-chain ledgers.

## Key Advantages

- Privacy by default: encrypted balances and transfers via ERC7984 on FHEVM.
- Simple launch flow: name, symbol, supply, price -> token deployed and listed.
- Non-custodial purchases: ETH paid directly to the token contract with automatic refunds.
- Explicit decryption: users choose when to decrypt and view balances.
- Clear separation: on-chain catalog and encrypted state, off-chain UI only for display and signing.

## Core Features

- Create a confidential token with name, symbol, total supply, and ETH price per token.
- Default supply of 1,000,000,000 when total supply is not provided.
- Token factory catalog that exposes all created tokens and their remaining sale supply.
- ETH purchase flow with refund of any excess payment.
- Creator withdrawal of proceeds and claiming of unsold supply.
- Frontend list of all tokens, purchase actions, encrypted balances, and decrypt-on-click UX.

## How It Works

1. A user creates a token through the factory with name, symbol, total supply, and price per token (in wei).
2. The factory deploys a new confidential ERC7984 token and stores its metadata in the catalog.
3. The token contract mints the full encrypted supply to itself and exposes `buy()` for ETH purchases.
4. Buyers receive encrypted balances; the contract tracks remaining sale supply and refunds any overpayment.
5. The frontend reads token metadata and supply with viem, writes transactions with ethers, and requests decryption
   through the Zama relayer when the user clicks decrypt.

## Technology Stack

- Smart contracts: Solidity, Hardhat, hardhat-deploy, TypeScript
- FHE and ERC7984: `@fhevm/solidity`, `confidential-contracts-v91`, `encrypted-types`
- Frontend: React, Vite, RainbowKit, wagmi, viem (read), ethers (write)
- Relayer: `@zama-fhe/relayer-sdk`
- Tooling: ESLint, Prettier, TypeChain

## Repository Layout

- `contracts/` Solidity contracts, including the token factory and confidential token implementation
- `deploy/` Hardhat deployment scripts
- `tasks/` Hardhat tasks
- `test/` Contract tests
- `deployments/` Deployment artifacts and ABI output (source of truth for frontend ABIs)
- `src/` Frontend workspace (React + Vite)
- `docs/` Zama reference docs used by this project

## Contracts in This Repository

- `contracts/TokenFactory.sol` creates new confidential tokens and maintains a catalog.
- `contracts/ConfidentialToken.sol` implements ERC7984-based confidential tokens with ETH purchase.
- `contracts/ERC7984ETH.sol` reference implementation used for alignment with ERC7984 behavior.
- `contracts/FHECounter.sol` example FHE contract kept for reference and testing patterns.

## Local Setup (Contracts)

Prerequisites:

- Node.js 20+
- npm 7+

Install and compile:

```bash
npm install
npm run compile
```

Run tests:

```bash
npm run test
```

Run a local node and deploy locally:

```bash
npm run chain
npm run deploy:localhost
```

## Sepolia Deployment (Contracts)

This project deploys with a private key (no mnemonic). The Hardhat config reads the following environment variables:

```bash
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_private_key
```

Deploy and verify:

```bash
npm run deploy:sepolia
npm run verify:sepolia -- <CONTRACT_ADDRESS>
```

## Frontend Setup

Frontend workspace is in `src/`.

Install dependencies (from `src/`):

```bash
cd src
npm install
```

Start the dev server (from `src/`):

```bash
cd src
npm run dev
```

Build and preview (from `src/`):

```bash
cd src
npm run build
npm run preview
```

## ABI and Address Sync

- The ABI source of truth is `deployments/sepolia`.
- Copy the generated ABI into a frontend TypeScript file (do not import JSON directly).
- Update the frontend contract addresses after each deployment.

## Data and Privacy Model

- Token balances are encrypted on-chain using FHE (ERC7984).
- The frontend requests decryption via the Zama relayer only when the user clicks decrypt.
- No local storage is used for balances or decrypted data.
- The frontend does not use environment variables or connect to localhost blockchain networks.

## Development Constraints

- No Tailwind CSS; styling is plain CSS.
- Frontend reads with viem and writes with ethers.
- Frontend does not import files from the repository root.
- Frontend avoids JSON files for app data and ABI imports.
- View functions do not rely on `msg.sender`; address inputs are explicit.
- Sensitive files like `package.json` and `.gitignore` are treated as read-only.
- No KYC flow or KYC references are included.

## Quality and Testing

- Contract tests live in `test/`.
- Hardhat tasks live in `tasks/`.
- Compile and test before any deployment to Sepolia.

## Future Roadmap

- Batch token creation and pagination for large catalogs.
- Dynamic pricing models (bonding curves, tiered pricing).
- Advanced token launch analytics and metrics dashboards.
- More flexible sale controls (timed sales, caps, per-wallet limits).
- Additional networks beyond Sepolia when FHEVM support expands.
- UI improvements for encrypted balance management and relayer status visibility.

## License

BSD-3-Clause-Clear. See `LICENSE`.
