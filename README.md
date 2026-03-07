# crypto-offramp

A decentralised P2P offramp protocol. Users lock USDC/USDT in a smart contract escrow and receive INR directly to any UPI account via a verified settler — no custodian, no KYC, non-custodial end-to-end.

---

## How It Works

```
User scans UPI QR  →  Locks USDC/USDT in escrow  →  Settler pays INR via UPI  →  Crypto released to settler
```

1. User scans a merchant's UPI QR code (or enters a UPI ID manually)
2. User approves and locks USDC/USDT into the `KrizPayP2P` contract
3. A verified settler picks up the open order from the dashboard
4. Settler sends INR to the merchant via UPI and submits the UTR number on-chain
5. Contract verifies and releases crypto to the settler (minus 0.5% platform fee)
6. If the settler doesn't settle in time, the user cancels and receives a full refund

---

## Stack

| Layer | Tech |
|-------|------|
| Smart Contract | Solidity 0.8.20, Foundry, OpenZeppelin |
| Backend | Node.js, Express, ethers.js v6 |
| Frontend | Next.js 14, Wagmi v2, RainbowKit, Tailwind CSS |
| Settler Dashboard | Next.js 14, Wagmi v2, RainbowKit, Tailwind CSS |
| Networks | Base Mainnet, Sepolia Testnet |

---

## Repository Structure

```
crypto-offramp/
├── Contracts/          # Solidity contract + Foundry tests & deploy scripts
├── Backend/            # Read-only REST API (rates, orders, UPI parsing)
├── Frontend/           # User app — scan QR, lock crypto, track order
└── Settler/            # Settler dashboard — claim orders, submit UTR
```

---

## Deployed Contracts

| Network | Address |
|---------|---------|
| Base Mainnet | `0x279635f011b58085FD08B80514e4fe4cA5bb024D` |
| Sepolia Testnet | `0xe2556390437184eCC29D344b562C60F108c2778A` |

---

## Local Setup

### Prerequisites

- Node.js 18+
- [Foundry](https://getfoundry.sh) (for contract work)
- An [Alchemy](https://alchemy.com) RPC key
- A [WalletConnect](https://cloud.walletconnect.com) Project ID

### 1. Backend

```bash
cd Backend
npm install
cp .env.example .env   # fill in CONTRACT_ADDRESS and RPC_URL
node server.js
# → http://localhost:3001
```

### 2. Frontend

```bash
cd Frontend
npm install
cp .env.example .env   # fill in NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID
npm run dev
# → http://localhost:3000
```

### 3. Settler Dashboard

```bash
cd Settler
npm install
cp .env.example .env   # fill in NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID
npm run dev
# → http://localhost:3000
```

### 4. Smart Contracts

```bash
# Install Foundry (once)
curl -L https://foundry.paradigm.xyz | bash && foundryup

cd Contracts
forge install          # installs forge-std + openzeppelin-contracts
forge build            # compile
forge test             # run test suite (13/13)

# Deploy
cp .env.example .env   # fill in DEPLOYER_PRIVATE_KEY and RPC URLs
source .env
forge script script/Deploy.s.sol --rpc-url $BASE_RPC_URL --broadcast --verify

# Manage settlers
forge script script/AddSettler.s.sol    --rpc-url $BASE_RPC_URL --broadcast
forge script script/RemoveSettler.s.sol --rpc-url $BASE_RPC_URL --broadcast
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health and contract info |
| `GET` | `/api/rates` | Live USDC/USDT → INR rates |
| `GET` | `/api/orders/open` | All open orders |
| `GET` | `/api/orders/:id` | Order by ID |
| `GET` | `/api/orders/user/:address` | Orders by user wallet |
| `GET` | `/api/orders/settler/:address` | Orders by settler wallet |
| `GET` | `/api/stats` | Platform statistics |
| `GET` | `/api/config` | Contract configuration |
| `POST` | `/api/parse-qr` | Parse a UPI QR string |
| `POST` | `/api/calculate` | Calculate crypto amount for an INR value |

---

## Contract Parameters

| Parameter | Value |
|-----------|-------|
| Platform fee | 0.5% (max 2%) |
| Order expiry | 30 minutes (unclaimed) |
| Claim window | 15 minutes (to complete after claiming) |
| Min order | 1 USDC |
| Max order | 100,000 USDC |
| Supported tokens | USDC, USDT |

---

## Security

- `ReentrancyGuard`, `Ownable`, `Pausable` from OpenZeppelin
- Fee-on-transfer tokens detected and rejected at deposit
- Backend is fully read-only — no private keys stored server-side
- Settlers interact directly with the contract from their own wallet
- Full refund guaranteed if settler times out
