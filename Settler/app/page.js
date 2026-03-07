'use client';

import React, { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { Shield, RefreshCw, Clock, DollarSign, CheckCircle, XCircle, Loader2, Copy, AlertCircle, TrendingUp, Award, ArrowRight, ExternalLink } from 'lucide-react';
import { CONTRACT_ADDRESSES, KRIZPAY_ABI } from './wagmi.config';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_API || 'http://localhost:3001/api';

function Bg() {
  return (
    <div aria-hidden="true" style={{ position: 'fixed', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
      <div className="orb orb-purple" />
      <div className="orb orb-teal" />
      <div className="orb orb-pink" />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color = 'text-teal-400' }) {
  return (
    <div className="card p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-slate-400 text-xs font-medium tracking-wide uppercase">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

export default function SettlerDashboard() {
  const { address, isConnected, chain } = useAccount();
  const [step, setStep] = useState('dashboard');
  const [openOrders, setOpenOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [utrNumber, setUtrNumber] = useState('');
  const [error, setError] = useState('');
  const [reputation, setReputation] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { writeContract: claimOrder, data: claimHash, isPending: isClaiming, error: claimError } = useWriteContract();
  const { writeContract: completeOrder, data: completeHash, isPending: isCompleting, error: completeError } = useWriteContract();

  const { isLoading: isClaimingTx, isSuccess: isOrderClaimed, isError: isClaimFailed } = useWaitForTransactionReceipt({ hash: claimHash });
  const { isLoading: isCompletingTx, isSuccess: isOrderCompleted, isError: isCompleteFailed } = useWaitForTransactionReceipt({ hash: completeHash });

  const contractAddress = chain?.id ? CONTRACT_ADDRESSES[chain.id] : null;

  const { data: isVerified, isLoading: isCheckingVerification } = useReadContract({
    address: contractAddress,
    abi: KRIZPAY_ABI,
    functionName: 'verifiedSettlers',
    args: [address],
    enabled: !!address && !!contractAddress,
  });

  useEffect(() => {
    if (address && contractAddress) {
      console.log('=== Settler Verification Debug ===');
      console.log('Settler Address:', address);
      console.log('Contract Address:', contractAddress);
      console.log('Is Verified:', isVerified);
      console.log('Is Checking:', isCheckingVerification);
      console.log('================================');
    }
  }, [address, contractAddress, isVerified, isCheckingVerification]);

  useEffect(() => {
    if (isConnected) {
      fetchOpenOrders();
      fetchSettlerStats();
      const interval = setInterval(() => {
        fetchOpenOrders();
        fetchSettlerStats();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isConnected, address]);

  useEffect(() => {
    if (isOrderClaimed && claimHash) setStep('payment-instructions');
  }, [isOrderClaimed, claimHash]);

  useEffect(() => {
    if (isOrderCompleted && completeHash) {
      setStep('success');
      fetchOpenOrders();
      fetchSettlerStats();
    }
  }, [isOrderCompleted, completeHash]);

  useEffect(() => {
    if (isClaimFailed || claimError) {
      let errorMessage = 'Failed to claim order';
      if (claimError?.message) {
        const msg = claimError.message.toLowerCase();
        if (msg.includes('user rejected')) errorMessage = 'Transaction rejected by user';
        else if (msg.includes('not settler')) errorMessage = 'You are not a verified settler';
        else if (msg.includes('not open')) errorMessage = 'Order is no longer available';
        else errorMessage = claimError.shortMessage || claimError.message;
      }
      setError(errorMessage);
      setStep('failed');
    }
  }, [isClaimFailed, claimError]);

  useEffect(() => {
    if (isCompleteFailed || completeError) {
      let errorMessage = 'Failed to complete order';
      if (completeError?.message) {
        const msg = completeError.message.toLowerCase();
        if (msg.includes('user rejected')) errorMessage = 'Transaction rejected by user';
        else errorMessage = completeError.shortMessage || completeError.message;
      }
      setError(errorMessage);
      setStep('failed');
    }
  }, [isCompleteFailed, completeError]);

  useEffect(() => {
    console.log('=== SETTLER DASHBOARD MOUNT ===');
    console.log('isConnected:', isConnected);
    console.log('address:', address);
    console.log('API_BASE:', API_BASE);
    console.log('===============================\n');

    if (isConnected) {
      console.log('🔄 Starting auto-fetch interval...');
      fetchOpenOrders();
      fetchSettlerStats();

      const interval = setInterval(() => {
        console.log(' Auto-refresh triggered');
        fetchOpenOrders();
        fetchSettlerStats();
      }, 5000);

      return () => {
        console.log(' Clearing auto-fetch interval');
        clearInterval(interval);
      };
    }
  }, [isConnected, address]);

  const fetchOpenOrders = async () => {
    try {
      setIsRefreshing(true);
      const url = `${API_BASE}/orders/open`;
      console.log('=== FETCHING OPEN ORDERS ===');
      console.log('Full URL:', url);

      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        const orders = data.data.orders || [];
        setOpenOrders(orders);
        console.log(` Loaded ${orders.length} open orders`);
      } else {
        setError('Failed to fetch orders: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      setError('Network error: ' + error.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchSettlerStats = async () => {
    if (!address) return;
    try {
      const response = await fetch(`${API_BASE}/settlers/${address}/stats`);
      const data = await response.json();
      if (data.success) {
        setReputation(data.data.reputation || 0);
        setTotalOrders(data.data.totalOrders || 0);
      }
    } catch (error) {
      console.log('Stats API not available');
    }
  };

  const handleClaimOrder = async (order) => {
    if (!contractAddress) {
      setError('Contract not configured for this network');
      return;
    }
    setSelectedOrder(order);
    setStep('processing');
    setError('');
    try {
      claimOrder({
        address: contractAddress,
        abi: KRIZPAY_ABI,
        functionName: 'claimOrder',
        args: [order.orderId],
      });
    } catch (error) {
      setError(error.message || 'Failed to claim order');
      setStep('failed');
    }
  };

  const handleCompleteOrder = async () => {
    if (!utrNumber || utrNumber.length < 10) {
      setError('Please enter a valid UTR number (minimum 10 characters)');
      return;
    }
    if (!contractAddress) {
      setError('Contract not configured');
      return;
    }
    setStep('processing');
    setError('');
    try {
      completeOrder({
        address: contractAddress,
        abi: KRIZPAY_ABI,
        functionName: 'completeOrder',
        args: [selectedOrder.orderId, utrNumber],
      });
    } catch (error) {
      setError(error.message || 'Failed to complete order');
      setStep('failed');
    }
  };

  const copyToClipboard = (text) => { navigator.clipboard.writeText(text); };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const resetFlow = () => {
    setStep('dashboard');
    setSelectedOrder(null);
    setUtrNumber('');
    setError('');
  };

  // ── Loading verification ──────────────────────────────────────────────────
  if (isCheckingVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Bg />
        <div className="z-content text-center animate-fade-in">
          <Loader2 className="w-10 h-10 text-teal-400 mx-auto mb-4 animate-spin" />
          <p className="text-slate-400">Checking verification status…</p>
        </div>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  if (step === 'dashboard') {
    return (
      <div className="min-h-screen">
        <Bg />

        {/* Header */}
        <header className="z-content relative border-b border-white/[0.06] px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-cyan-600 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-white leading-none">crypto-offramp Settler</h1>
                <p className="text-xs text-slate-500 mt-0.5">Settler Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchOpenOrders}
                disabled={isRefreshing}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-all disabled:opacity-40"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <ConnectButton />
            </div>
          </div>
        </header>

        <div className="z-content relative max-w-5xl mx-auto px-6 py-8">
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center animate-slide-up">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400/20 to-cyan-600/10 border border-teal-400/20 flex items-center justify-center">
                <Shield className="w-8 h-8 text-teal-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Connect your wallet</h2>
                <p className="text-slate-400 text-sm">Connect to view and claim open orders</p>
              </div>
              <ConnectButton />
            </div>
          ) : !isVerified ? (
            <div className="max-w-md mx-auto mt-16 card p-8 text-center animate-slide-up">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-white font-bold text-lg mb-2">Not Verified</h3>
              <p className="text-slate-400 text-sm mb-4">Your wallet is not registered as a settler. Contact the crypto-offramp admin to get verified.</p>
              <p className="text-xs font-mono text-slate-500 bg-white/[0.04] rounded-lg p-3 break-all">{address}</p>
            </div>
          ) : (
            <>
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-4 mb-8 animate-slide-up">
                <StatCard icon={Clock}       label="Open Orders" value={openOrders.length} color="text-teal-400" />
                <StatCard icon={CheckCircle} label="Completed"   value={totalOrders}       color="text-emerald-400" />
                <StatCard icon={Award}       label="Reputation"  value={reputation}         color="text-violet-400" />
              </div>

              {/* Verified badge */}
              <div className="flex items-center gap-2 mb-5">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 text-xs font-medium">Verified Settler</span>
                </div>
                <h2 className="text-white font-semibold">Available Orders</h2>
                <span className="ml-auto text-slate-500 text-sm">{openOrders.length} open</span>
              </div>

              {/* Orders list */}
              {openOrders.length === 0 ? (
                <div className="card p-12 text-center animate-fade-in">
                  <AlertCircle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-white font-semibold mb-1">No open orders</p>
                  <p className="text-slate-500 text-sm">
                    {isRefreshing ? 'Checking for new orders…' : 'Check back soon'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 animate-slide-up">
                  {openOrders.map((order) => (
                    <div key={order.orderId} className="card p-5 hover:border-teal-400/20 transition-all group">
                      <div className="flex items-center justify-between">
                        {/* Left: amounts */}
                        <div className="flex items-center gap-6">
                          <div>
                            <p className="text-2xl font-bold text-white">₹{parseFloat(order.inrAmount).toFixed(2)}</p>
                            <p className="text-teal-400 text-sm font-medium">{order.cryptoAmount} USDC</p>
                          </div>
                          <div className="hidden sm:block">
                            <div className="flex items-center gap-1.5 text-slate-400 text-sm">
                              <DollarSign className="w-3.5 h-3.5" />
                              <span className="font-mono">{order.merchantUpiId}</span>
                              <button onClick={() => copyToClipboard(order.merchantUpiId)} className="text-slate-600 hover:text-teal-400 transition-colors ml-1">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                            <p className="text-slate-600 text-xs mt-1">Order #{order.orderId}</p>
                          </div>
                        </div>

                        {/* Right: timer + claim */}
                        <div className="flex items-center gap-4">
                          <div className="text-right hidden sm:block">
                            <div className="flex items-center gap-1 text-amber-400 text-sm font-mono justify-end">
                              <Clock className="w-3.5 h-3.5" />
                              {formatTime(order.timeRemaining)}
                            </div>
                            <p className="text-slate-600 text-xs mt-0.5">remaining</p>
                          </div>
                          <button
                            onClick={() => handleClaimOrder(order)}
                            className="btn-teal px-5 py-2.5 text-sm flex items-center gap-2 whitespace-nowrap"
                          >
                            Claim
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Mobile: UPI + timer */}
                      <div className="sm:hidden mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-sm">
                        <span className="text-slate-400 font-mono text-xs">{order.merchantUpiId}</span>
                        <span className="text-amber-400 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3" />{formatTime(order.timeRemaining)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Payment instructions ──────────────────────────────────────────────────
  if (step === 'payment-instructions') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Bg />
        <div className="z-content w-full max-w-md animate-slide-up">
          <div className="card-teal p-7">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Order Claimed</h3>
              <p className="text-slate-400 text-sm">Send the payment, then submit the UTR</p>
            </div>

            <div className="bg-white/[0.04] rounded-xl p-4 mb-5 space-y-3">
              {[
                { label: 'Order ID',        value: `#${selectedOrder?.orderId}` },
                { label: 'Amount to Pay',   value: `₹${parseFloat(selectedOrder?.inrAmount).toFixed(2)}`, bold: true },
                { label: 'Merchant UPI',    value: selectedOrder?.merchantUpiId, copy: true },
                { label: "You'll Receive",  value: `${selectedOrder?.cryptoAmount} USDC`, green: true },
              ].map(({ label, value, bold, copy, green }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-sm ${bold ? 'text-white text-base font-bold' : green ? 'text-teal-400 font-semibold' : 'text-white'}`}>{value}</span>
                    {copy && (
                      <button onClick={() => copyToClipboard(value)} className="text-slate-600 hover:text-teal-400 transition-colors">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-amber-500/[0.08] border border-amber-500/20 rounded-xl p-4 mb-5">
              <p className="text-amber-300 text-xs font-semibold mb-2 uppercase tracking-wide">Instructions</p>
              <ol className="text-amber-200/80 text-xs space-y-1 list-decimal list-inside">
                <li>Pay ₹{parseFloat(selectedOrder?.inrAmount).toFixed(2)} to {selectedOrder?.merchantUpiId}</li>
                <li>Use any UPI app — PhonePe, Paytm, GPay, etc.</li>
                <li>Copy the 12-digit UTR / Transaction ID</li>
                <li>Paste below and click Complete Order</li>
              </ol>
            </div>

            <div className="mb-5">
              <label className="text-slate-300 text-sm font-medium mb-2 block">UTR Number</label>
              <input
                type="text"
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value)}
                placeholder="e.g., 123456789012"
                className="w-full px-4 py-3 font-mono"
              />
              <p className="text-slate-600 text-xs mt-2">12-digit transaction reference from your UPI app</p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={handleCompleteOrder}
              disabled={!utrNumber || utrNumber.length < 10}
              className="btn-teal w-full py-3.5 flex items-center justify-center gap-2 mb-3"
            >
              Complete Order & Receive USDC
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={resetFlow}
              className="w-full py-3 text-slate-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Processing ────────────────────────────────────────────────────────────
  if (step === 'processing') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Bg />
        <div className="z-content w-full max-w-md animate-fade-in">
          <div className="card p-8 text-center">
            <Loader2 className="w-12 h-12 text-teal-400 mx-auto mb-4 animate-spin" />
            <h3 className="text-xl font-bold text-white mb-1">Processing Transaction</h3>
            <p className="text-slate-400 text-sm mb-7">Confirm in your wallet…</p>

            <div className="space-y-3 text-left mb-6">
              {[
                { label: isOrderClaimed ? 'Order claimed' : 'Claiming order…', done: isOrderClaimed, active: isClaimingTx || isClaiming },
                { label: isOrderCompleted ? 'Order completed' : 'Submitting UTR…', done: isOrderCompleted, active: isCompletingTx || isCompleting },
                { label: 'Releasing USDC to your wallet', done: false, active: false },
              ].map(({ label, done, active }) => (
                <div key={label} className="flex items-center gap-3">
                  {done ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  ) : active ? (
                    <Loader2 className="w-6 h-6 text-teal-400 animate-spin flex-shrink-0" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-white/[0.06] flex-shrink-0" />
                  )}
                  <span className={done ? 'text-white text-sm' : 'text-slate-500 text-sm'}>{label}</span>
                </div>
              ))}
            </div>

            {(claimHash || completeHash) && (
              <div className="bg-white/[0.04] rounded-xl p-3">
                <p className="text-slate-500 text-xs mb-1">Transaction</p>
                <p className="text-white text-xs font-mono">
                  {(completeHash || claimHash)?.slice(0, 10)}…{(completeHash || claimHash)?.slice(-8)}
                </p>
              </div>
            )}

            <p className="text-slate-600 text-xs mt-4">If no popup appeared, check your wallet extension</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Bg />
        <div className="z-content w-full max-w-md animate-slide-up">
          <div className="card-teal p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mx-auto mb-5 animate-bounce-gentle">
              <CheckCircle className="w-9 h-9 text-emerald-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-1">Order Completed!</h3>
            <p className="text-slate-400 text-sm mb-6">USDC has been released to your wallet</p>

            <div className="bg-white/[0.04] rounded-xl p-4 mb-5 space-y-2.5 text-left text-sm">
              {[
                { label: 'Order ID',       value: `#${selectedOrder?.orderId}` },
                { label: 'INR Paid',       value: `₹${parseFloat(selectedOrder?.inrAmount).toFixed(2)}` },
                { label: 'USDC Received',  value: `${selectedOrder?.cryptoAmount} USDC`, green: true },
                { label: 'UTR',            value: utrNumber, mono: true },
              ].map(({ label, value, green, mono }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-slate-500">{label}</span>
                  <span className={`${green ? 'text-teal-400 font-semibold' : 'text-white'} ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
                </div>
              ))}
              {completeHash && (
                <div className="flex justify-between pt-2 border-t border-white/[0.06]">
                  <span className="text-slate-500">Tx Hash</span>
                  <a
                    href={`https://${chain?.id === 11155111 ? 'sepolia.' : ''}etherscan.io/tx/${completeHash}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-violet-400 hover:text-violet-300 font-mono text-xs flex items-center gap-1"
                  >
                    {completeHash.slice(0, 6)}…{completeHash.slice(-4)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            <div className="bg-teal-500/[0.08] border border-teal-500/20 rounded-xl p-3 mb-5">
              <p className="text-teal-300 text-sm">Your reputation score has been increased.</p>
            </div>

            <button onClick={resetFlow} className="btn-teal w-full py-3.5">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Failed ────────────────────────────────────────────────────────────────
  if (step === 'failed') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Bg />
        <div className="z-content w-full max-w-md animate-slide-up">
          <div className="card p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Transaction Failed</h3>
            <p className="text-slate-400 text-sm mb-5">{error || 'Something went wrong. Please try again.'}</p>

            <div className="bg-white/[0.04] rounded-xl p-4 mb-5 text-left">
              <p className="text-slate-400 text-xs font-semibold mb-2 uppercase tracking-wide">Common causes</p>
              <ul className="text-slate-500 text-xs space-y-1 list-disc list-inside">
                <li>Order was claimed by another settler</li>
                <li>Transaction timed out or was rejected</li>
                <li>Insufficient gas in your wallet</li>
              </ul>
            </div>

            <button onClick={resetFlow} className="btn-teal w-full py-3.5">
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
