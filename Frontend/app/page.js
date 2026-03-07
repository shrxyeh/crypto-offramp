'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { Camera, ArrowRight, CheckCircle, XCircle, Loader2, QrCode, DollarSign, RefreshCw, X } from 'lucide-react';
import { CONTRACT_ADDRESSES, STABLECOIN_ADDRESSES, KRIZPAY_ABI, ERC20_ABI } from './wagmi.config';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_API || 'http://localhost:3001/api';

function QRScanner({ onScanSuccess, onScanError, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const jsQRRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  useEffect(() => {
    setMounted(true);

    if (window.jsQR) {
      jsQRRef.current = window.jsQR;
      console.log(' jsQR already loaded');
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
    script.async = true;
    script.onload = () => {
      jsQRRef.current = window.jsQR;
      console.log(' jsQR loaded from CDN');
    };
    script.onerror = () => {
      console.error(' Failed to load jsQR');
      setError('Failed to load QR scanner library');
    };
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const initCamera = async () => {
      try {
        console.log('🎥 Starting camera...');
        
        const constraints = {
          audio: false,
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          await videoRef.current.play();
          console.log(' Camera started');
          setCameraReady(true);
          startQRDetection();
        }
      } catch (err) {
        console.error(' Camera error:', err);
        const errorMsg = err.name === 'NotAllowedError' 
          ? 'Camera permission denied. Please enable camera access.'
          : 'Failed to access camera. ' + err.message;
        setError(errorMsg);
        onScanError(err);
      }
    };

    initCamera();

    return () => {
      if (scanIntervalRef.current) {
        cancelAnimationFrame(scanIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [mounted]);

  const startQRDetection = () => {
    if (!jsQRRef.current) {
      setTimeout(startQRDetection, 100);
      return;
    }

    const detectQR = () => {
      if (!scanning || !jsQRRef.current) return;

      if (
        videoRef.current &&
        canvasRef.current &&
        videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA
      ) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        try {
          const code = jsQRRef.current(imageData.data, imageData.width, imageData.height);

          if (code && code.data) {
            console.log(' QR Code Detected:', code.data);
            setScanning(false);

            if (streamRef.current) {
              streamRef.current.getTracks().forEach(track => track.stop());
            }
            
            onScanSuccess(code.data);
            return;
          }
        } catch (err) {
          console.error('QR decode error:', err);
        }
      }

      if (scanning) {
        scanIntervalRef.current = requestAnimationFrame(detectQR);
      }
    };

    detectQR();
  };

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900">Scan UPI QR Code</h3>
          <button
            onClick={() => {
              setScanning(false);
              if (videoRef.current?.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
              }
              onClose();
            }}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ✕
          </button>
        </div>

        <div className="relative bg-gray-900 rounded-xl overflow-hidden mb-4">
          <video
            ref={videoRef}
            className="w-full h-72 object-cover"
            playsInline
            autoPlay
            muted
          />
          <canvas ref={canvasRef} className="hidden" />

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-64">
              <div className="absolute inset-0 border-3 border-green-400 rounded-lg"></div>
              <div className="absolute -top-3 -left-3 w-8 h-8 border-t-4 border-l-4 border-green-400"></div>
              <div className="absolute -top-3 -right-3 w-8 h-8 border-t-4 border-r-4 border-green-400"></div>
              <div className="absolute -bottom-3 -left-3 w-8 h-8 border-b-4 border-l-4 border-green-400"></div>
              <div className="absolute -bottom-3 -right-3 w-8 h-8 border-b-4 border-r-4 border-green-400"></div>
              <div className="absolute inset-0 animate-pulse">
                <div className="absolute left-0 right-0 top-1/3 h-px bg-gradient-to-r from-transparent via-green-400 to-transparent"></div>
              </div>
            </div>
          </div>

          <div className="absolute top-4 left-4">
            <div className="flex items-center gap-2 bg-black/50 px-3 py-2 rounded-full">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-white text-xs font-semibold">Scanning...</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-900 text-center">Position UPI QR Code in Frame</p>
          <p className="text-xs text-gray-600 text-center">
            • Hold device steady<br/>
            • Good lighting required<br/>
            • Distance: 15-30cm from code
          </p>

          {error && (
            <div className="bg-red-100 border border-red-300 rounded-lg p-2">
              <p className="text-red-700 text-xs text-center">{error}</p>
            </div>
          )}

          <button
            onClick={() => {
              setScanning(false);
              if (videoRef.current?.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
              }
              onClose();
            }}
            className="w-full mt-4 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-2 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CryptoOfframpPage() {
  const { address, isConnected, chain } = useAccount();
  const [step, setStep] = useState('scan');
  const [scanning, setScanning] = useState(false);
  const [merchantData, setMerchantData] = useState(null);
  const [inrAmount, setInrAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [slippageTolerance, setSlippageTolerance] = useState(1);
  const [conversionData, setConversionData] = useState(null);
  const [error, setError] = useState('');
  const [rates, setRates] = useState({ USDC: 83.5, USDT: 83.4 });
  const [approvalNeeded, setApprovalNeeded] = useState(false);
  const [tokenBalance, setTokenBalance] = useState('0');
  const [transactionHash, setTransactionHash] = useState(null);
  const [scanMode, setScanMode] = useState('qr');
  const [manualUpiId, setManualUpiId] = useState('');
  const [manualChecking, setManualChecking] = useState(false);

  const { writeContract: approveToken, data: approvalHash, isPending: isApproving, error: approvalError } = useWriteContract();
  const { writeContract: initiatePayment, data: paymentHash, isPending: isPaymentPending, error: paymentError } = useWriteContract();

  const { isLoading: isApprovingTx, isSuccess: isApproved, isError: isApprovalFailed } = useWaitForTransactionReceipt({
    hash: approvalHash,
  });

  const { isLoading: isProcessingTx, isSuccess: isPaymentInitiated, isError: isPaymentFailed } = useWaitForTransactionReceipt({
    hash: paymentHash,
  });

  const contractAddress = chain?.id ? CONTRACT_ADDRESSES[chain.id] : null;
  const tokenAddresses = chain?.id ? STABLECOIN_ADDRESSES[chain.id] : null;

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isApproved) {
      setApprovalNeeded(false);
      executePayment();
    }
  }, [isApproved]);

  useEffect(() => {
    if (isApprovalFailed || approvalError) {
      console.error(' Approval failed:', approvalError);
      
      let errorMessage = 'Token approval failed';
      
      if (approvalError?.message) {
        const msg = approvalError.message.toLowerCase();
        
        if (msg.includes('user rejected') || msg.includes('user denied')) {
          errorMessage = 'Approval rejected by user';
        } else if (msg.includes('insufficient funds')) {
          errorMessage = 'Insufficient ETH for gas fees';
        } else if (msg.includes('dropped') || msg.includes('replaced')) {
          errorMessage = 'Approval transaction was dropped. Please try again.';
        } else {
          errorMessage = approvalError.shortMessage || approvalError.message || 'Approval failed';
        }
      }
      
      setError(errorMessage);
      setStep('failed');
    }
  }, [isApprovalFailed, approvalError]);

  useEffect(() => {
    if (isPaymentFailed || paymentError) {
      console.error(' Payment failed:', paymentError);
      
      let errorMessage = 'Payment transaction failed';
      
      if (paymentError?.message) {
        const msg = paymentError.message.toLowerCase();
        
        if (msg.includes('user rejected') || msg.includes('user denied')) {
          errorMessage = 'Transaction rejected by user';
        } else if (msg.includes('insufficient funds')) {
          errorMessage = 'Insufficient ETH for gas fees';
        } else if (msg.includes('gas required exceeds allowance') || msg.includes('out of gas')) {
          errorMessage = 'Transaction requires more gas. Try increasing gas limit in MetaMask.';
        } else if (msg.includes('nonce too low')) {
          errorMessage = 'Transaction conflict. Please wait and try again.';
        } else if (msg.includes('replacement transaction underpriced')) {
          errorMessage = 'Gas price too low. Please increase gas price in MetaMask.';
        } else if (msg.includes('already known')) {
          errorMessage = 'Duplicate transaction. Please wait for previous transaction to complete.';
        } else if (msg.includes('dropped') || msg.includes('replaced')) {
          errorMessage = 'Transaction was replaced or dropped. Please try again.';
        } else {
          errorMessage = paymentError.shortMessage || paymentError.message || 'Transaction failed';
        }
      }
      
      setError(errorMessage);
      setStep('failed');
    }
  }, [isPaymentFailed, paymentError]);

useEffect(() => {
  if (isPaymentInitiated && paymentHash) {
    setTransactionHash(paymentHash);
    
    console.log(' Payment transaction initiated');

    const getOrderId = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const response = await fetch(`${API_BASE}/orders/user/${address}`);
        const data = await response.json();
        
        if (data.success && data.data.orders.length > 0) {
          const latestOrder = data.data.orders[data.data.orders.length - 1];
          console.log('📋 Latest order:', latestOrder);
          console.log('📋 Order ID:', latestOrder.orderId);
          
          setCurrentOrderId(latestOrder.orderId);
          await fetch(`${API_BASE}/orders/refresh`, { method: 'POST' });
          
          setStep('success');

          startOrderPolling(latestOrder.orderId);
        }
      } catch (error) {
        console.error('Error getting order ID:', error);
        setStep('success');
      }
    };
    
    getOrderId();
  }
}, [isPaymentInitiated, paymentHash, address]);

const [currentOrderId, setCurrentOrderId] = useState(null);
const pollingIntervalRef = useRef(null);

// FIXED: Function to poll order status
const startOrderPolling = (orderId) => {
  console.log('═══════════════════════════════════');
  console.log('START POLLING ORDER:', orderId);
  console.log('═══════════════════════════════════');
  
  if (!orderId) {
    console.error(' NO ORDER ID - CANNOT POLL');
    return;
  }
  
  let attempts = 0;
  let consecutiveErrors = 0;
  const maxAttempts = 180;
  const maxConsecutiveErrors = 5;
  
  if (pollingIntervalRef.current) {
    clearInterval(pollingIntervalRef.current);
  }
  
  const checkStatus = async () => {
    attempts++;
    const now = new Date().toLocaleTimeString();
    console.log(`\n [${now}] Poll #${attempts}/${maxAttempts}`);
    
    if (attempts > maxAttempts) {
      console.log(' POLLING TIMEOUT');
      clearInterval(pollingIntervalRef.current);
      return;
    }
    
    if (consecutiveErrors >= maxConsecutiveErrors) {
      console.error(` Too many errors (${consecutiveErrors}), stopping poll`);
      clearInterval(pollingIntervalRef.current);
      setError('Failed to check order status. Please refresh the page.');
      return;
    }
    
    try {
      const url = `${API_BASE}/orders/${orderId}?t=${Date.now()}`;
      console.log(` Fetching: ${url}`);
      
      const res = await fetch(url);
      console.log(` Status: ${res.status}`);

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        console.error(' Non-JSON response:', text);
        consecutiveErrors++;

        if (text.includes('Too many requests') || text.includes('rate limit')) {
          console.warn(' Rate limited, waiting 5 seconds...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        return;
      }
      
      const json = await res.json();

      consecutiveErrors = 0;
      
      console.log(' Response:', {
        success: json.success,
        status: json.data?.status,
        statusCode: json.data?.statusCode
      });
      
      if (json.success && json.data) {
        const statusCode = json.data.statusCode;
        
        console.log(` Status: ${json.data.status} (Code: ${statusCode})`);
        
        if (statusCode === 2) {
          console.log(' ORDER COMPLETED! ');
          clearInterval(pollingIntervalRef.current);
          setStep('completed');
        } else if (statusCode === 1) {
          console.log('⏳ Claimed, waiting for completion...');
        } else if (statusCode === 0) {
          console.log('📋 Open, waiting for settler...');
        }
      } else {
        console.error(' API returned success: false', json);
        consecutiveErrors++;
      }
    } catch (err) {
      console.error(' POLL ERROR:', err.message);
      consecutiveErrors++;

      if (err.name === 'SyntaxError') {
        console.error(' JSON Parse Error - Backend returned non-JSON response');
      }
    }
  };
  
  console.log(' Starting immediate check...');
  checkStatus();
  
  console.log(' Setting 2-second interval...');
  pollingIntervalRef.current = setInterval(checkStatus, 2000);
};

useEffect(() => {
  return () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
  };
}, []);

  const { data: balance } = useReadContract({
    address: tokenAddresses?.[selectedToken],
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
    enabled: !!address && !!tokenAddresses,
  });

  useEffect(() => {
    if (balance) {
      setTokenBalance(formatUnits(balance, 6));
    }
  }, [balance]);

  const fetchRates = async () => {
    try {
      console.log('📡 Fetching rates from:', `${API_BASE}/rates`);
      const response = await fetch(`${API_BASE}/rates`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Rates data:', data);
      if (data.success) {
        setRates(data.data.rates);
        console.log(' Rates updated:', data.data.rates);
      } else {
        console.error('Rates API returned success: false', data);
        setError('Failed to fetch rates');
      }
    } catch (error) {
      console.error(' Failed to fetch rates:', error);
      setError('Failed to fetch rates: ' + error.message);
    }
  };

  const handleQRScan = () => {
    setScanning(true);
    setError('');
  };

  const handleScanSuccess = async (decodedText) => {
    console.log('📸 QR Data received:', decodedText);
    setScanning(false);

    try {
      const response = await fetch(`${API_BASE}/parse-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrData: decodedText })
      });

      const data = await response.json();
      if (data.success) {
        setMerchantData(data.data);
        setStep('amount');
        setError('');
      } else {
        setError('Invalid UPI QR code');
      }
    } catch (error) {
      console.error('Parse QR error:', error);
      setError('Failed to parse QR code: ' + error.message);
    }
  };

  const handleScanError = (error) => {
    console.error('QR Scan Error:', error);
    setError('Camera error: ' + (error?.message || 'Unknown error'));
  };

  const handleTestQR = async () => {
    const mockQR = 'upi://pay?pa=merchant@paytm&pn=Test Merchant';
    console.log(' Testing QR with mock data:', mockQR);
    console.log('API BASE:', API_BASE);

    try {
      const url = `${API_BASE}/parse-qr`;
      console.log('Calling URL:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrData: mockQR })
      });

      console.log('Parse QR response status:', response.status);
      console.log('Response headers:', response.headers);
      
      const data = await response.json();
      console.log('Parse QR response data:', data);
      
      if (response.ok && data.success) {
        console.log(' QR Parsed successfully:', data.data);
        setMerchantData(data.data);
        setStep('amount');
        setError('');
      } else {
        const errorMsg = data.error || data.message || 'Unknown error';
        console.error(' QR Parse failed:', errorMsg);
        setError('Failed to parse QR: ' + errorMsg);
      }
    } catch (error) {
      console.error(' QR Parse network error:', error);
      setError('Network error: ' + error.message);
    }
  };

  const calculateConversion = async () => {
    if (!inrAmount || parseFloat(inrAmount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inrAmount: parseFloat(inrAmount), token: selectedToken })
      });

      const data = await response.json();
      if (data.success) {
        setConversionData(data.data);

        if (parseFloat(tokenBalance) < parseFloat(data.data.cryptoAmount)) {
          setError(`Insufficient ${selectedToken} balance. You need ${data.data.cryptoAmount} ${selectedToken}`);
          return;
        }

        setStep('review');
      }
    } catch (error) {
      setError('Failed to calculate conversion');
    }
  };

  const checkAndApprove = async () => {
  if (!contractAddress || !tokenAddresses) {
    setError('Contract not configured for this network');
    return;
  }

  setStep('processing');
  setError('');

  try {
    const tokenAddress = tokenAddresses[selectedToken];
    const amountToApprove = parseUnits(conversionData.cryptoAmount, 6);
    setApprovalNeeded(true);

    console.log(' Requesting approval for:', conversionData.cryptoAmount, selectedToken);

    approveToken({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [contractAddress, amountToApprove],
      gas: 100000n, 
    });
  } catch (error) {
    console.error('Approval error:', error);
    setError(error.message || 'Approval failed');
    setStep('failed');
  }
};

  const executePayment = async () => {
  if (!contractAddress || !tokenAddresses) {
    setError('Contract not configured');
    setStep('failed');
    return;
  }

  try {
    const tokenAddress = tokenAddresses[selectedToken];
    const cryptoAmount = parseUnits(conversionData.cryptoAmount, 6);
    const inrAmountWei = parseUnits(inrAmount, 18);

    console.log(' Creating P2P escrow order...');

    // FIXED: Add gas limit
    initiatePayment({
      address: contractAddress,
      abi: KRIZPAY_ABI,
      functionName: 'createOrder',
      args: [
        tokenAddress,
        cryptoAmount,
        inrAmountWei,
        merchantData.upiId
      ],
      gas: 500000n, // Add gas limit
    });
  } catch (error) {
    console.error('Order creation error:', error);
    
    let errorMessage = 'Order creation failed';
    
    if (error.message?.includes('user rejected')) {
      errorMessage = 'Transaction rejected by user';
    } else if (error.message?.includes('insufficient funds')) {
      errorMessage = 'Insufficient ETH for gas fees';
    } else if (error.message?.includes('exceeds balance')) {
      errorMessage = `Insufficient ${selectedToken} balance`;
    } else if (error.message?.includes('gas')) {
      errorMessage = 'Gas estimation failed. Make sure token is approved first.';
    } else {
      errorMessage = error.shortMessage || error.message || 'Order creation failed';
    }
    
    setError(errorMessage);
    setStep('failed');
  }
};

  const resetFlow = () => {
    setStep('scan');
    setMerchantData(null);
    setInrAmount('');
    setConversionData(null);
    setError('');
    setApprovalNeeded(false);
    setTransactionHash(null);
    setScanning(false);
    setScanMode('qr');
    setManualUpiId('');
  };

  const handleFetchManualUPI = async () => {
    if (!manualUpiId.trim()) {
      setError('Please enter UPI ID');
      return;
    }

    const upiRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/;
    if (!upiRegex.test(manualUpiId)) {
      setError('Invalid UPI ID format. Use: username@bankname');
      return;
    }

    console.log(' Fetching UPI details for:', manualUpiId);

    try {
      console.log('Validating UPI ID...');
      const validateResponse = await fetch(`${API_BASE}/validate-upi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upiId: manualUpiId })
      });

      const validateData = await validateResponse.json();
      console.log('Validation response:', validateData);

      if (!validateData.data.isValid) {
        setError('Invalid UPI ID format');
        return;
      }

      console.log('Parsing UPI ID...');
      const mockQR = `upi://pay?pa=${manualUpiId}&pn=Merchant`;

      const response = await fetch(`${API_BASE}/parse-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrData: mockQR })
      });

      console.log('Parse response status:', response.status);
      const data = await response.json();
      console.log('Parsed UPI data:', data);

      if (data.success && data.data) {
        console.log(' UPI Details fetched successfully:', data.data);
        setMerchantData(data.data);
        setManualUpiId(''); 
        setStep('amount');
        setError('');
      } else {
        const errorMsg = data.error || 'Failed to fetch UPI details';
        console.error('Parse error:', errorMsg);
        setError(errorMsg);
      }
    } catch (error) {
      console.error(' Fetch error:', error);
      setError('Error fetching UPI details: ' + error.message);
    }
  };

  const checkNow = async () => {
    if (!currentOrderId) { setError('No order ID found'); return; }
    setManualChecking(true);
    try {
      const res = await fetch(`${API_BASE}/orders/${currentOrderId}`);
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.statusCode === 2) setStep('completed');
        else alert(`Order status: ${json.data.status}\nWait for settler to complete payment.`);
      }
    } catch (err) {
      setError('Failed to check order status');
    } finally {
      setManualChecking(false);
    }
  };

  const Bg = () => (
    <>
      <div className="orb orb-purple" />
      <div className="orb orb-teal" />
      <div className="orb orb-pink" />
    </>
  );

  // ── SCAN ─────────────────────────────────────────────────
  if (step === 'scan') {
    return (
      <div className="relative min-h-screen">
        <Bg />
        {scanning && (
          <QRScanner
            onScanSuccess={handleScanSuccess}
            onScanError={handleScanError}
            onClose={() => setScanning(false)}
          />
        )}
        <div className="z-content max-w-md mx-auto px-4 py-10">
          <div className="text-center mb-8 animate-slide-up">
            <h1 className="text-5xl font-bold text-gradient mb-1">crypto-offramp</h1>
            <p className="text-white/40 text-sm">Crypto to INR, instantly</p>
          </div>

          <div className="flex justify-center mb-6">
            <ConnectButton />
          </div>

          {isConnected && (
            <div className="animate-slide-up space-y-4">
              <div className="card-teal p-4 flex justify-between items-center">
                <div>
                  <p className="text-white/40 text-xs mb-1">Balance</p>
                  <p className="text-white font-bold text-lg">{parseFloat(tokenBalance).toFixed(2)} {selectedToken}</p>
                  <p className="text-teal-400 text-xs">≈ ₹{(parseFloat(tokenBalance) * rates[selectedToken]).toFixed(2)}</p>
                </div>
                <button onClick={() => fetchRates()} className="text-white/30 hover:text-teal-400 transition-colors p-2">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              <div className="card p-1 flex gap-1">
                {[['qr', QrCode, 'Scan QR'], ['manual', DollarSign, 'Enter UPI']].map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    onClick={() => { setScanMode(mode); setError(''); }}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                      scanMode === mode ? 'btn-teal' : 'text-white/50 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>

              {scanMode === 'qr' && (
                <div className="card p-6 space-y-4 animate-fade-in">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                      <QrCode className="w-10 h-10 text-teal-400" />
                    </div>
                    <h2 className="text-white font-bold text-lg mb-1">Scan Merchant QR</h2>
                    <p className="text-white/40 text-xs">Point your camera at a UPI QR code</p>
                  </div>
                  <button onClick={handleQRScan} className="btn-teal w-full py-3 flex items-center justify-center gap-2">
                    <Camera className="w-4 h-4" /> Scan QR Code
                  </button>
                  <button onClick={handleTestQR} className="w-full py-3 rounded-xl border border-white/08 text-white/50 hover:text-white hover:border-white/20 text-sm transition-all flex items-center justify-center gap-2">
                    <QrCode className="w-4 h-4" /> Use Demo QR
                  </button>
                  {error && <p className="text-red-400 text-xs text-center bg-red-500/10 rounded-xl py-2 px-3">{error}</p>}
                  <div className="pt-3 border-t border-white/05 grid grid-cols-2 gap-2">
                    {[['USDC', rates.USDC], ['USDT', rates.USDT]].map(([t, r]) => (
                      <div key={t} className="bg-white/03 rounded-xl p-3">
                        <p className="text-white/30 text-xs mb-1">{t}/INR</p>
                        <p className="text-white font-bold">₹{parseFloat(r).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {scanMode === 'manual' && (
                <div className="card p-6 space-y-4 animate-fade-in">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
                      <DollarSign className="w-10 h-10 text-teal-400" />
                    </div>
                    <h2 className="text-white font-bold text-lg mb-1">Enter UPI ID</h2>
                    <p className="text-white/40 text-xs">Enter the merchant's UPI ID manually</p>
                  </div>
                  <div>
                    <label className="text-white/40 text-xs mb-2 block">Merchant UPI ID</label>
                    <input
                      type="text"
                      value={manualUpiId}
                      onChange={(e) => setManualUpiId(e.target.value)}
                      placeholder="merchant@paytm"
                      className="w-full px-4 py-3 text-sm"
                    />
                    <p className="text-white/25 text-xs mt-1.5">e.g., username@paytm, abc@okhdfcbank</p>
                  </div>
                  <button onClick={handleFetchManualUPI} className="btn-teal w-full py-3 flex items-center justify-center gap-2">
                    <ArrowRight className="w-4 h-4" /> Fetch Merchant
                  </button>
                  {merchantData && (
                    <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-3">
                      <p className="text-teal-400 text-xs mb-1">Merchant Found</p>
                      <p className="text-white font-semibold text-sm">{merchantData.merchantName}</p>
                      <p className="text-teal-400/70 text-xs">{merchantData.upiId}</p>
                    </div>
                  )}
                  {error && <p className="text-red-400 text-xs text-center bg-red-500/10 rounded-xl py-2 px-3">{error}</p>}
                  <div className="pt-3 border-t border-white/05 grid grid-cols-2 gap-2">
                    {[['USDC', rates.USDC], ['USDT', rates.USDT]].map(([t, r]) => (
                      <div key={t} className="bg-white/03 rounded-xl p-3">
                        <p className="text-white/30 text-xs mb-1">{t}/INR</p>
                        <p className="text-white font-bold">₹{parseFloat(r).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── AMOUNT ───────────────────────────────────────────────
  if (step === 'amount') {
    return (
      <div className="relative min-h-screen">
        <Bg />
        <div className="z-content max-w-md mx-auto px-4 py-10 animate-slide-up">
          <button onClick={resetFlow} className="flex items-center gap-2 text-white/40 hover:text-white mb-6 text-sm transition-colors">
            <X className="w-4 h-4" /> Back
          </button>
          <h1 className="text-3xl font-bold text-gradient mb-6">Enter Amount</h1>

          <div className="card p-5 mb-4">
            <p className="text-white/40 text-xs mb-3">Paying</p>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-white font-semibold">{merchantData?.merchantName}</p>
                <p className="text-teal-400 text-xs font-mono">{merchantData?.upiId}</p>
              </div>
              <CheckCircle className="w-5 h-5 text-teal-400 mt-0.5" />
            </div>
          </div>

          <div className="card-teal p-5 mb-4">
            <label className="text-white/40 text-xs mb-3 block">Amount (INR)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl text-white/40 font-bold">₹</span>
              <input
                type="number"
                value={inrAmount}
                onChange={(e) => setInrAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-10 pr-4 py-4 text-3xl font-bold"
              />
            </div>
            {inrAmount && parseFloat(inrAmount) > 0 && (
              <div className="mt-4 pt-4 border-t border-white/05 grid grid-cols-2 gap-3">
                {[['USDC', rates.USDC], ['USDT', rates.USDT]].map(([t, r]) => (
                  <div key={t} className="bg-white/03 rounded-xl p-3">
                    <p className="text-white/30 text-xs mb-1">{t}</p>
                    <p className="text-white font-bold text-sm">{(parseFloat(inrAmount) / r).toFixed(4)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4 mb-4">
            <p className="text-white/40 text-xs mb-3">Select Token</p>
            <div className="grid grid-cols-2 gap-2">
              {['USDC', 'USDT'].map(token => (
                <button
                  key={token}
                  onClick={() => setSelectedToken(token)}
                  className={`py-3 rounded-xl text-sm font-semibold transition-all ${
                    selectedToken === token ? 'btn-teal' : 'text-white/50 hover:text-white border border-white/08 hover:border-white/20'
                  }`}
                >
                  {token}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-400 text-xs text-center bg-red-500/10 rounded-xl py-2 px-3 mb-4">{error}</p>}

          <button
            onClick={calculateConversion}
            disabled={!inrAmount || parseFloat(inrAmount) <= 0}
            className="btn-teal w-full py-4 flex items-center justify-center gap-2 text-base"
          >
            Continue <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  // ── REVIEW ───────────────────────────────────────────────
  if (step === 'review') {
    return (
      <div className="relative min-h-screen">
        <Bg />
        <div className="z-content max-w-md mx-auto px-4 py-10 animate-slide-up">
          <button onClick={() => setStep('amount')} className="flex items-center gap-2 text-white/40 hover:text-white mb-6 text-sm transition-colors">
            <X className="w-4 h-4" /> Back
          </button>
          <h1 className="text-3xl font-bold text-gradient mb-6">Review Payment</h1>

          <div className="card-teal p-6 mb-4">
            <div className="flex justify-between items-end mb-6">
              <div>
                <p className="text-white/40 text-xs mb-1">You Pay</p>
                <p className="text-white text-3xl font-bold">{conversionData?.cryptoAmount} <span className="text-teal-400 text-lg">{selectedToken}</span></p>
                <p className="text-white/40 text-xs mt-1">≈ ₹{conversionData?.inrAmount}</p>
              </div>
              <ArrowRight className="w-6 h-6 text-teal-400 mb-2" />
              <div className="text-right">
                <p className="text-white/40 text-xs mb-1">Merchant Gets</p>
                <p className="text-white text-3xl font-bold">₹{conversionData?.inrAmount}</p>
                <p className="text-white/40 text-xs mt-1">{merchantData?.merchantName}</p>
              </div>
            </div>
            <div className="border-t border-white/05 pt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Exchange Rate</span>
                <span className="text-white">1 {selectedToken} = ₹{conversionData?.rate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Platform Fee ({conversionData?.feePercent}%)</span>
                <span className="text-white">{conversionData?.fee} {selectedToken}</span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t border-white/05">
                <span className="text-white/40">Total Deducted</span>
                <span className="text-teal-400">{conversionData?.cryptoAmount} {selectedToken}</span>
              </div>
            </div>
          </div>

          <div className="card p-4 mb-6">
            <div className="flex justify-between items-center text-sm">
              <span className="text-white/40">UPI ID</span>
              <span className="text-white font-mono text-xs">{merchantData?.upiId}</span>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs text-center bg-red-500/10 rounded-xl py-2 px-3 mb-4">{error}</p>}

          <button onClick={checkAndApprove} className="btn-teal w-full py-4 flex items-center justify-center gap-2 text-base">
            <CheckCircle className="w-5 h-5" /> Confirm &amp; Pay
          </button>
        </div>
      </div>
    );
  }

  // ── PROCESSING ───────────────────────────────────────────
  if (step === 'processing') {
    const txSteps = [
      { label: isApproved ? 'Token approved' : 'Approving token spend', done: isApproved, active: isApprovingTx || isApproving },
      { label: 'Submitting order on-chain', done: false, active: isProcessingTx || isPaymentPending },
      { label: 'Waiting for settler', done: false, active: false },
    ];
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <Bg />
        <div className="z-content max-w-md w-full mx-auto px-4 animate-fade-in">
          <div className="card-teal p-8 text-center">
            <Loader2 className="w-14 h-14 text-teal-400 mx-auto mb-4 animate-spin" />
            <h3 className="text-2xl font-bold text-white mb-1">
              {approvalNeeded && !isApproved ? 'Approving Token' : 'Processing Payment'}
            </h3>
            <p className="text-white/40 text-sm mb-8">Confirm the transaction in your wallet</p>
            <div className="space-y-3 text-left mb-8">
              {txSteps.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  {s.done ? (
                    <CheckCircle className="w-5 h-5 text-teal-400 flex-shrink-0" />
                  ) : s.active ? (
                    <Loader2 className="w-5 h-5 text-teal-400 flex-shrink-0 animate-spin" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-white/15 flex-shrink-0" />
                  )}
                  <span className={s.done ? 'text-white' : s.active ? 'text-teal-400' : 'text-white/30'}>{s.label}</span>
                </div>
              ))}
            </div>
            {(approvalHash || paymentHash) && (
              <div className="bg-white/03 rounded-xl p-3 mb-4">
                <p className="text-white/30 text-xs mb-1">Tx Hash</p>
                <p className="text-white/60 text-xs font-mono">
                  {(paymentHash || approvalHash)?.slice(0, 12)}…{(paymentHash || approvalHash)?.slice(-8)}
                </p>
              </div>
            )}
            <button
              onClick={() => { setError('Transaction cancelled by user'); setStep('failed'); }}
              className="w-full py-3 rounded-xl border border-red-500/30 text-red-400 text-sm hover:bg-red-500/10 transition-all"
            >
              Cancel
            </button>
            <p className="text-white/25 text-xs mt-4">If no wallet popup appears, check your extension</p>
          </div>
        </div>
      </div>
    );
  }

  // ── SUCCESS (order created, awaiting settler) ─────────────
  if (step === 'success') {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <Bg />
        <div className="z-content max-w-md w-full mx-auto px-4 animate-fade-in">
          <div className="card-teal p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-9 h-9 text-teal-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-1">Order Created!</h3>
              <p className="text-white/40 text-sm">Crypto locked in escrow. Settler will pay shortly.</p>
            </div>

            <div className="space-y-2.5 mb-5">
              {currentOrderId && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Order ID</span>
                  <span className="text-white font-mono">#{currentOrderId}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-white/40">INR Amount</span>
                <span className="text-white">₹{inrAmount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Crypto Locked</span>
                <span className="text-white">{conversionData?.cryptoAmount} {selectedToken}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Merchant</span>
                <span className="text-white">{merchantData?.merchantName}</span>
              </div>
              {transactionHash && (
                <div className="flex justify-between text-sm pt-2 border-t border-white/05">
                  <span className="text-white/40">Tx Hash</span>
                  <a
                    href={`https://${chain?.id === 11155111 ? 'sepolia.' : ''}etherscan.io/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-400 hover:text-teal-300 font-mono text-xs"
                  >
                    {transactionHash.slice(0, 8)}…{transactionHash.slice(-6)}
                  </a>
                </div>
              )}
            </div>

            <div className="bg-teal-500/08 border border-teal-500/15 rounded-xl p-3 mb-5 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-teal-400 animate-spin flex-shrink-0" />
              <p className="text-white/50 text-xs">
                {currentOrderId ? `Monitoring order #${currentOrderId}…` : 'Waiting for settler confirmation'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={checkNow}
                disabled={manualChecking || !currentOrderId}
                className="btn-teal py-3 flex items-center justify-center gap-2 text-sm"
              >
                {manualChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {manualChecking ? 'Checking…' : 'Check Now'}
              </button>
              <button
                onClick={() => { if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); resetFlow(); }}
                className="py-3 rounded-xl border border-white/08 text-white/50 hover:text-white hover:border-white/20 text-sm transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── COMPLETED ────────────────────────────────────────────
  if (step === 'completed') {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <Bg />
        <div className="z-content max-w-md w-full mx-auto px-4 animate-slide-up">
          <div className="card-teal p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-teal-500/20 border-2 border-teal-500/40 flex items-center justify-center mx-auto mb-4 animate-bounce-gentle">
              <CheckCircle className="w-11 h-11 text-teal-400" />
            </div>
            <h3 className="text-3xl font-bold text-gradient mb-2">Payment Done</h3>
            <p className="text-white/40 text-sm mb-6">The merchant has received ₹{inrAmount} via UPI</p>
            <div className="space-y-2.5 text-left mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Status</span>
                <span className="text-teal-400 font-semibold">Completed</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Amount Paid</span>
                <span className="text-white">₹{inrAmount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Crypto Spent</span>
                <span className="text-white">{conversionData?.cryptoAmount} {selectedToken}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Merchant</span>
                <span className="text-white">{merchantData?.merchantName}</span>
              </div>
            </div>
            <button onClick={resetFlow} className="btn-teal w-full py-4 text-base">
              Make Another Payment
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── FAILED ───────────────────────────────────────────────
  if (step === 'failed') {
    const isGasTooHigh = error?.toLowerCase().includes('too high') || error?.toLowerCase().includes('cap:');
    const isDroppedError = error?.toLowerCase().includes('dropped') || error?.toLowerCase().includes('replaced');
    const isNonceError = error?.toLowerCase().includes('nonce') || error?.toLowerCase().includes('conflict');
    const isApprovalError = error?.toLowerCase().includes('allowance') || error?.toLowerCase().includes('erc20');
    const isGasError = error?.toLowerCase().includes('gas');

    const hint = isGasTooHigh
      ? { cls: 'bg-red-500/08 border-red-500/20 text-red-300', title: 'Gas Limit Issue', tips: ['Gas limit exceeded network cap', 'Make sure you approved the token first', 'Check the contract address', 'Refresh and try again'] }
      : isApprovalError
      ? { cls: 'bg-yellow-500/08 border-yellow-500/20 text-yellow-300', title: 'Token Approval Required', tips: ['Approve the token before creating an order', 'Click Confirm again and approve in your wallet'] }
      : isDroppedError
      ? { cls: 'bg-blue-500/08 border-blue-500/20 text-blue-300', title: 'Transaction Replaced', tips: ['You may have sped up or cancelled in your wallet', 'Your funds are safe — simply try again'] }
      : isNonceError
      ? { cls: 'bg-purple-500/08 border-purple-500/20 text-purple-300', title: 'Transaction Conflict', tips: ['Wait for pending transactions to complete', 'Check your wallet for stuck transactions'] }
      : isGasError
      ? { cls: 'bg-yellow-500/08 border-yellow-500/20 text-yellow-300', title: 'Gas Error', tips: ['Ensure you have enough ETH for gas (~$2–5)', 'Try again when network is less congested'] }
      : null;

    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <Bg />
        <div className="z-content max-w-md w-full mx-auto px-4 animate-slide-up">
          <div className="card p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-9 h-9 text-red-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Payment Failed</h3>
            <p className="text-white/40 text-sm mb-6">{error || 'Something went wrong. Please try again.'}</p>
            {hint && (
              <div className={`rounded-xl border p-4 mb-5 text-left ${hint.cls}`}>
                <p className="text-sm font-semibold mb-2">{hint.title}</p>
                <ul className="text-xs space-y-1 list-disc list-inside opacity-80">
                  {hint.tips.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
            <button onClick={resetFlow} className="btn-teal w-full py-4 mb-3">Try Again</button>
            <p className="text-white/25 text-xs">Your funds are safe. No tokens were deducted.</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
