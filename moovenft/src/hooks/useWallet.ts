// ../hooks/useWallet.ts
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

  // Il provider può essere BrowserProvider (per wallet connesso) o JsonRpcProvider (per letture pubbliche)
  const [provider, setProvider] = useState<ethers.BrowserProvider | ethers.JsonRpcProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  // Inizializza un JsonRpcProvider una volta al mount dell'hook.
  // Questo sarà il provider di fallback per le letture.
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
      // Imposta il provider iniziale a quello pubblico. Sarà sovrascritto se un wallet si connette.
      setProvider(rpc);
    } catch (error) {
      console.error("Errore nell'inizializzazione del public RPC provider:", error);
      setPublicRpcProvider(null); // Assicurati che sia null in caso di fallimento
      setProvider(null); // Nessun provider se l'RPC pubblico fallisce
    }
  }, []); // Esegui solo al mount del componente

  // --- Funzione per ottenere/aggiornare tutte le informazioni del wallet ---
  const updateWalletInfo = useCallback(async () => {
    if (!window.ethereum) {
      // Se MetaMask non è installato, resetta tutto e usa il provider pubblico
      setWalletConnected(false);
      setBalanceInfo({ address: null, ethBalance: null });
      setCorrectChain(false);
      setSigner(null);
      // Mantieni il publicRpcProvider per le letture del marketplace
      if (publicRpcProvider) {
        setProvider(publicRpcProvider);
      } else {
        setProvider(null); // Se anche il publicRpcProvider non è disponibile
      }
      return;
    }

    try {
      const currentBrowserProvider = new ethers.BrowserProvider(window.ethereum);

      const accounts = await currentBrowserProvider.listAccounts(); // Ottieni gli account connessi
      const currentAddress = accounts.length > 0 ? accounts[0].address : null;

      if (currentAddress) {
        // Se c'è un account connesso, usiamo il BrowserProvider e il suo signer
        const currentSigner = await currentBrowserProvider.getSigner(currentAddress);
        setSigner(currentSigner);
        setProvider(currentBrowserProvider); // Imposta il BrowserProvider

        const network = await currentBrowserProvider.getNetwork();
        const currentChainId = Number(network.chainId); // ChainId è BigInt in Ethers v6

        const balanceWei = await currentBrowserProvider.getBalance(currentAddress);
        const ethBalance = ethers.formatEther(balanceWei);

        setWalletConnected(true);
        setBalanceInfo({ address: currentAddress, ethBalance });
        setCorrectChain(currentChainId === desiredChainId);
      } else {
        // Se non ci sono account selezionati/connessi in MetaMask, pulisci lo stato del wallet
        setWalletConnected(false);
        setBalanceInfo({ address: null, ethBalance: null });
        setSigner(null); // Nessun signer se non c'è un account connesso
        setCorrectChain(false); // La chain non è "corretta" se non c'è un wallet connesso
        // Fallback al provider pubblico per le letture del marketplace
        if (publicRpcProvider) {
          setProvider(publicRpcProvider);
        } else {
          setProvider(null); // Nessun provider se publicRpcProvider non è disponibile
        }
      }
    } catch (error) {
      console.error("Errore nell'aggiornamento delle info del wallet:", error);
      // In caso di errore, resetta tutti gli stati e usa il provider pubblico
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
  }, [desiredChainId, publicRpcProvider]); // Dipende anche da publicRpcProvider

  // --- Funzione per connettere il wallet (richiede permesso all'utente) ---
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      alert("MetaMask non è installato! Si prega di installarlo per continuare.");
      return;
    }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      localStorage.setItem("walletConnected", "true"); // Ricorda la connessione
      await updateWalletInfo(); // Aggiorna tutte le info dopo la connessione
    } catch (error: any) {
      console.error("Errore nella connessione al wallet:", error);
      alert("Errore durante la connessione al wallet: " + (error.message || error.reason || "Errore sconosciuto."));
      setWalletConnected(false);
      localStorage.removeItem("walletConnected");
      // In caso di fallimento della connessione, assicurati di usare il public provider
      if (publicRpcProvider) {
        setProvider(publicRpcProvider);
      } else {
        setProvider(null);
      }
    }
  }, [updateWalletInfo, publicRpcProvider]); // Dipende anche da publicRpcProvider

  // --- Funzione per tentare lo switch o l'aggiunta della chain ---
  const switchChain = useCallback(async () => {
    if (!window.ethereum) return false;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${desiredChainId.toString(16)}` }],
      });
      await updateWalletInfo(); // Aggiorna le info del wallet dopo un cambio di rete
      return true; // Lo switch ha avuto successo
    } catch (switchError: any) {
      if (switchError.code === 4902) { // Rete sconosciuta, prova ad aggiungerla
        let networkConfig: any;
        if (desiredChainId === 11155111) { // Sepolia
          networkConfig = {
            chainId: `0x${desiredChainId.toString(16)}`,
            chainName: "Sepolia Test Network",
            rpcUrls: [PUBLIC_RPC_URL], // Usa l'URL da .env
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
            await updateWalletInfo(); // Aggiorna le info del wallet dopo l'aggiunta e lo switch
            return true; // L'aggiunta e lo switch hanno avuto successo
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
    // 1) Puliamo lo stato
    setWalletConnected(false);
    setBalanceInfo({ address: null, ethBalance: null });
    setCorrectChain(false);
    setSigner(null);
    localStorage.removeItem("walletConnected");

    // 2) Imposta il provider al provider pubblico per consentire le letture continue
    if (publicRpcProvider) {
      setProvider(publicRpcProvider);
    } else {
      setProvider(null); // Se non c'è nemmeno il provider pubblico
    }

    // `window.location.reload();` è stato rimosso per un comportamento meno aggressivo.
  }, [publicRpcProvider]);


  useEffect(() => {
    const initWalletOnLoad = async () => {
      // Se il publicRpcProvider non è ancora inizializzato, attendi
      if (!publicRpcProvider) return;

      if (window.ethereum) {
        const userPreviouslyConnected = localStorage.getItem("walletConnected") === "true";
        if (userPreviouslyConnected) {
          await updateWalletInfo(); // Connetti solo se l'utente ha dato consenso in precedenza
        } else {
          // Se non c'è una connessione precedente, usa il publicRpcProvider per le letture iniziali
          setProvider(publicRpcProvider);
        }
      } else {
        // Se MetaMask non è disponibile, assicurati che il provider sia il publicRpcProvider
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
  }, [updateWalletInfo, publicRpcProvider]); // Aggiungi publicRpcProvider alle dipendenze

  return {
    walletConnected,
    balanceInfo: {
      address: balanceInfo.address,
      ethBalance: balanceInfo.ethBalance,
    },
    connectWallet,
    correctChain,
    provider, // Espongo il provider (ora può essere BrowserProvider o JsonRpcProvider)
    signer,   // Espongo il signer
    switchChain,
    disconnectWallet,
  };
};