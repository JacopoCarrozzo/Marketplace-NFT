import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: any;
  }
}

const PUBLIC_RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/ZYdwG1CvIv81Z6nEajE5o";

export const useWallet = (desiredChainId: number) => {
  const [walletConnected, setWalletConnected] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState({
    address: null as string | null,
    ethBalance: null as string | null,
  });
  const [correctChain, setCorrectChain] = useState(false);

  const [provider, setProvider] = useState<ethers.BrowserProvider | ethers.JsonRpcProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  const [publicRpcProvider, setPublicRpcProvider] = useState<ethers.JsonRpcProvider | null>(null);

  useEffect(() => {
    try {
      if (!PUBLIC_RPC_URL) {
        console.error("PUBLIC_RPC_URL non definito. Assicurati che la variabile d'ambiente sia caricata correttamente.");
        setPublicRpcProvider(null);
        setProvider(null);
        return;
      }
      const rpc = new ethers.JsonRpcProvider(PUBLIC_RPC_URL);
      setPublicRpcProvider(rpc);
      setProvider(rpc); // Inizializza con il provider pubblico
    } catch (error) {
      console.error("Errore nell'inizializzazione del public RPC provider:", error);
      setPublicRpcProvider(null);
      setProvider(null);
    }
  }, []);

  const updateWalletInfo = useCallback(async () => {
    if (!window.ethereum) {
      setWalletConnected(false);
      setBalanceInfo({ address: null, ethBalance: null });
      setCorrectChain(false);
      setSigner(null);
      if (publicRpcProvider) {
        setProvider(publicRpcProvider);
      } else {
        setProvider(null);
      }
      return;
    }

    try {
      const currentBrowserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await currentBrowserProvider.listAccounts();
      const currentAddress = accounts.length > 0 ? accounts[0].address : null;

      if (currentAddress) {
        const currentSigner = await currentBrowserProvider.getSigner(currentAddress);
        setSigner(currentSigner);
        setProvider(currentBrowserProvider);

        const network = await currentBrowserProvider.getNetwork();
        const currentChainId = Number(network.chainId);

        const balanceWei = await currentBrowserProvider.getBalance(currentAddress);
        const ethBalance = ethers.formatEther(balanceWei);

        setWalletConnected(true);
        setBalanceInfo({ address: currentAddress, ethBalance });
        setCorrectChain(currentChainId === desiredChainId);
      } else {
        setWalletConnected(false);
        setBalanceInfo({ address: null, ethBalance: null });
        setSigner(null);
        setCorrectChain(false);
        if (publicRpcProvider) {
          setProvider(publicRpcProvider);
        } else {
          setProvider(null);
        }
      }
    } catch (error) {
      console.error("Errore nell'aggiornamento delle info del wallet:", error);
      setWalletConnected(false);
      setBalanceInfo({ address: null, ethBalance: null });
      setCorrectChain(false);
      setSigner(null);
      if (publicRpcProvider) {
        setProvider(publicRpcProvider);
      } else {
        setProvider(null);
      }
    }
  }, [desiredChainId, publicRpcProvider]);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      alert("MetaMask non è installato! Si prega di installarlo per continuare.");
      return;
    }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      localStorage.setItem("walletConnected", "true");
      await updateWalletInfo();
    } catch (error: any) {
      console.error("Errore nella connessione al wallet:", error);
      alert("Errore durante la connessione al wallet: " + (error.message || error.reason || "Errore sconosciuto."));
      setWalletConnected(false);
      localStorage.removeItem("walletConnected");
      if (publicRpcProvider) {
        setProvider(publicRpcProvider);
      } else {
        setProvider(null);
      }
    }
  }, [updateWalletInfo, publicRpcProvider]);

  const switchChain = useCallback(async () => {
    if (!window.ethereum) return false;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${desiredChainId.toString(16)}` }],
      });
      await updateWalletInfo();
      return true;
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        let networkConfig: any;
        if (desiredChainId === 11155111) {
          networkConfig = {
            chainId: `0x${desiredChainId.toString(16)}`,
            chainName: "Sepolia Test Network",
            rpcUrls: [PUBLIC_RPC_URL],
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          };
        }

        if (networkConfig) {
          try {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [networkConfig],
            });
            await updateWalletInfo();
            return true;
          } catch (addError) {
            console.error("Errore nell'aggiunta della rete:", addError);
            return false;
          }
        } else {
          console.error("Nessuna configurazione di rete trovata per desiredChainId:", desiredChainId);
          return false;
        }
      } else {
        console.error("Errore nello switch della rete:", switchError);
        return false;
      }
    }
  }, [desiredChainId, updateWalletInfo]);

  const disconnectWallet = useCallback(() => {
    setWalletConnected(false);
    setBalanceInfo({ address: null, ethBalance: null });
    setCorrectChain(false);
    setSigner(null);
    localStorage.removeItem("walletConnected");
    if (publicRpcProvider) {
      setProvider(publicRpcProvider);
    } else {
      setProvider(null);
    }
  }, [publicRpcProvider]);

  useEffect(() => {
    const initWalletOnLoad = async () => {
      if (!publicRpcProvider) return;

      if (window.ethereum) {
        const userPreviouslyConnected = localStorage.getItem("walletConnected") === "true";
        if (userPreviouslyConnected || window.ethereum.selectedAddress) {
          await connectWallet(); // Tenta la connessione automatica se c'è un account selezionato
        } else {
          setProvider(publicRpcProvider);
        }
      } else {
        setProvider(publicRpcProvider);
      }
    };

    initWalletOnLoad();

    const handleAccountsChanged = (accounts: string[]) => {
      console.log("Accounts changed:", accounts);
      updateWalletInfo();
    };

    const handleChainChanged = async (chainId: string) => {
      console.log("Chain changed:", parseInt(chainId, 16));
      await updateWalletInfo();
    };

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);

      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      };
    }
  }, [connectWallet, updateWalletInfo, publicRpcProvider]);

  return {
    walletConnected,
    balanceInfo: {
      address: balanceInfo.address,
      ethBalance: balanceInfo.ethBalance,
    },
    connectWallet,
    correctChain,
    provider,
    signer,
    switchChain,
    disconnectWallet,
  };
};