import React, { createContext, useContext } from 'react';
import { useWallet } from '../hooks/useWallet';
import { ethers } from 'ethers';

// Definiamo il tipo per il context basato su ciò che restituisce useWallet
interface WalletContextType {
  walletConnected: boolean;
  balanceInfo: { address: string | null; ethBalance: string | null };
  connectWallet: () => Promise<void>;
  correctChain: boolean;
  // *** MODIFICA QUI: Aggiungi ethers.JsonRpcProvider come tipo possibile per 'provider' ***
  provider: ethers.BrowserProvider | ethers.JsonRpcProvider | null;
  signer: ethers.Signer | null;
  switchChain: () => Promise<boolean>;
  disconnectWallet: () => void;
}

// Creiamo il context
const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Provider del context
export const WalletProvider: React.FC<{ children: React.ReactNode; desiredChainId: number }> = ({ children, desiredChainId }) => {
  const walletData = useWallet(desiredChainId); // Usiamo il tuo hook qui
  return <WalletContext.Provider value={walletData}>{children}</WalletContext.Provider>;
};

// Hook personalizzato per usare il context
export const useWalletContext = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWalletContext deve essere usato dentro un WalletProvider');
  }
  return context;
};