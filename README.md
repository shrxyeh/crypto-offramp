# KrizPay P2P

A decentralized P2P crypto-to-INR offramp protocol. Users lock USDC/USDT in a smart contract escrow and receive INR directly to their UPI account from a verified settler.

## Architecture

```
Frontend (Next.js)  ──┐
                       ├──► Backend API (Node.js) ──► Blockchain (Base/Sepolia)
Settler  (Next.js)  ──┘          │
                                  └──► Smart Contract (KrizPayP2P)
```

| Component | Description |
|-----------|-------------|
| `Contracts/` | Solidity smart contract — escrow logic, settler registry, dispute resolution |
| `Backend/` | Read-only REST API — serves order data, UPI QR parsing, USD/INR rates |
| `Frontend/` | User-facing app — create orders by scanning a UPI QR code |
| `Settler/` | Settler dashboard — claim and complete pending orders |

## How It Works

1. **User** scans a merchant's UPI QR code in the Frontend app
2. User approves and locks USDC/USDT in the contract escrow
3. **Settler** sees the open order and claims it
4. Settler sends INR to the merchant via UPI and submits the UTR number on-chain
5. Contract releases the crypto to the settler (minus 0.5% platform fee)
6. If the settler doesn't settle in time, the user can cancel and get a full refund

## Prerequisites

- Node.js 18+
- An [Alchemy](https://alchemy.com) RPC endpoint
- A [WalletConnect](https://cloud.walletconnect.com) Project ID
- A deployed `KrizPayP2P` contract (or use the addresses in `.env.example`)

## Setup

Clone the repo and configure each service using the provided `.env.example` files:

```bash
cp Backend/.env.example   Backend/.env
cp Frontend/.env.example  Frontend/.env
cp Settler/.env.example   Settler/.env
cp Contracts/.env.example Contracts/.env
```

Fill in your own values — **never commit the `.env` files**.

### 1. Backend

```bash
cd Backend
npm install
node server.js
```

Runs on `http://localhost:3001` by default.

### 2. Frontend

```bash
cd Frontend
npm install
npm run dev
```

### 3. Settler Dashboard

```bash
cd Settler
npm install
npm run dev
```

### 4. Smart Contract (optional — for deployment)

```bash
cd Contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js --network base
```

To add a settler after deployment:

```bash
# Edit scripts/addSettler.js with the settler address, then:
npx hardhat run scripts/addSettler.js --network base
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health + contract info |
| GET | `/api/orders/open` | List all open orders |
| GET | `/api/orders/:id` | Get order by ID |
| GET | `/api/orders/user/:address` | Get orders for a user |
| GET | `/api/orders/settler/:address` | Get orders for a settler |
| GET | `/api/rates` | Current USDC/USDT → INR rates |
| POST | `/api/parse-qr` | Parse a UPI QR code string |
| POST | `/api/calculate` | Calculate crypto amount for INR input |
| GET | `/api/config` | Contract configuration |
| GET | `/api/stats` | Platform statistics |

## Contract Details

**`KrizPayP2P`** — deployed on Base Mainnet and Sepolia testnet.

- Orders expire after **30 minutes** if unclaimed
- Settlers have **15 minutes** to complete after claiming
- Platform fee: **0.5%** (configurable up to 2% by owner)
- Min order: **1 USDC** | Max order: **100,000 USDC**
- Daily limit: **100 orders per address**
- Dispute resolution available after settlement timeout

## Security

- Contract uses OpenZeppelin `ReentrancyGuard`, `Ownable`, and `Pausable`
- Fee-on-transfer tokens are detected and rejected
- Backend is **read-only** — no private keys required to run it
- Settlers interact directly with the contract from their wallet
