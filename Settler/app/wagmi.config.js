'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { injectedWallet, walletConnectWallet, coinbaseWallet, rainbowWallet } from '@rainbow-me/rainbowkit/wallets';
import { base, mainnet, sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'crypto-offramp',
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
  chains: [
    base,
    ...(process.env.NODE_ENV === 'development' ? [sepolia] : []),
  ],
  wallets: [
    {
      groupName: 'Popular',
      wallets: [injectedWallet, walletConnectWallet, coinbaseWallet, rainbowWallet],
    },
  ],
  ssr: false,
});

export const CONTRACT_ADDRESSES = {
  [base.id]: "0x279635f011b58085FD08B80514e4fe4cA5bb024D",
  [sepolia.id]: "0xe2556390437184eCC29D344b562C60F108c2778A", 
};

export const STABLECOIN_ADDRESSES = {
  [base.id]: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  },
  [sepolia.id]: {
    USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    USDT: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
  },
};

export const KRIZPAY_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'cryptoAmount', type: 'uint256' },
      { name: 'inrAmount', type: 'uint256' },
      { name: 'merchantUpiId', type: 'string' }
    ],
    name: 'createOrder',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'orderId', type: 'uint256' }],
    name: 'claimOrder',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      { name: 'orderId', type: 'uint256' },
      { name: 'utr', type: 'string' }
    ],
    name: 'completeOrder',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'orderId', type: 'uint256' }],
    name: 'cancelOrder',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },

  {
    inputs: [{ name: 'orderId', type: 'uint256' }],
    name: 'getOrder',
    outputs: [
      {
        components: [
          { name: 'user', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'cryptoAmount', type: 'uint256' },
          { name: 'inrAmount', type: 'uint256' },
          { name: 'merchantUpiId', type: 'string' },
          { name: 'expiryTime', type: 'uint256' },
          { name: 'settler', type: 'address' },
          { name: 'status', type: 'uint8' },
          { name: 'utrNumber', type: 'string' }
        ],
        name: '',
        type: 'tuple'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getOrderCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'getUserOrders',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getOpenOrders',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'verifiedSettlers',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'platformFeeBps',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'minOrderAmount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'maxOrderAmount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },

  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'token', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'expiry', type: 'uint256' }
    ],
    name: 'OrderCreated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: true, name: 'settler', type: 'address' }
    ],
    name: 'OrderClaimed',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: true, name: 'settler', type: 'address' },
      { indexed: true,  name: 'token',  type: 'address' },
      { indexed: false, name: 'utr', type: 'string' }
    ],
    name: 'OrderCompleted',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: true, name: 'user', type: 'address' },
      { indexed: true,  name: 'token',  type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' }
    ],
    name: 'OrderCancelled',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true,  name: 'id',    type: 'uint256' },
      { indexed: true,  name: 'user',  type: 'address' },
      { indexed: true,  name: 'token', type: 'address' }, 
      { indexed: false, name: 'reason',type: 'string' }
    ],
    name: 'OrderDisputed',
    type: 'event'
  },
];

export const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  }
];