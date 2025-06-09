import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export const useWallet = (desiredChainId: number) => {
  const [walletConnected, setWalletConnected] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState({
    address: null as string | null,
    ethBalance: null as string | null,
  });
  const [correctChain, setCorrectChain] = useState(false);

  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  // --- Funzione per ottenere/aggiornare tutte le informazioni del wallet ---
  // Memoizzata per evitare ricreazioni inutili.
  const updateWalletInfo = useCallback(async () => {
    if (!window.ethereum) {
      // Se MetaMask non è installato, resetta tutto
      setWalletConnected(false);
      setBalanceInfo({ address: null, ethBalance: null });
      setCorrectChain(false);
      setProvider(null);
      setSigner(null);
      return;
    }

    try {
      const currentProvider = new ethers.BrowserProvider(window.ethereum);
      // Imposta il provider non appena lo crei. Questo assicura che sia disponibile
      // per operazioni di sola lettura anche se non c'è un signer attivo.
      setProvider(currentProvider); 

      const accounts = await currentProvider.listAccounts(); // Ottieni gli account connessi
      const currentAddress = accounts.length > 0 ? accounts[0].address : null;

      if (currentAddress) {
        const currentSigner = await currentProvider.getSigner(currentAddress);
        setSigner(currentSigner);

        const network = await currentProvider.getNetwork();
        const currentChainId = Number(network.chainId); // ChainId è BigInt in Ethers v6

        const balanceWei = await currentProvider.getBalance(currentAddress);
        const ethBalance = ethers.formatEther(balanceWei);

        setWalletConnected(true);
        setBalanceInfo({ address: currentAddress, ethBalance });
        setCorrectChain(currentChainId === desiredChainId);
      } else {
        // Se non ci sono account selezionati/connessi in MetaMask, pulisci lo stato del wallet
        setWalletConnected(false);
        setBalanceInfo({ address: null, ethBalance: null });
        setSigner(null); // Nessun signer se non c'è un account connesso
        // Il provider potrebbe rimanere se si volesse fare solo operazioni di lettura
        // ma per consistenza con lo stato "non connesso", lo resettiamo.
        setProvider(null); 
        setCorrectChain(false); // La chain non è "corretta" se non c'è un wallet connesso
      }
    } catch (error) {
      console.error("Errore nell'aggiornamento delle info del wallet:", error);
      // In caso di errore, resetta tutti gli stati
      setWalletConnected(false);
      setBalanceInfo({ address: null, ethBalance: null });
      setCorrectChain(false);
      setProvider(null);
      setSigner(null);
    }
  }, [desiredChainId]); // Dipende solo da desiredChainId

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
    }
  }, [updateWalletInfo]); // Dipende solo da updateWalletInfo

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
        // Qui dovresti avere la configurazione completa per tutte le catene supportate.
        // Ho lasciato solo Sepolia come esempio.
        let networkConfig: any;
        if (desiredChainId === 11155111) { // Sepolia
          networkConfig = {
            chainId: `0x${desiredChainId.toString(16)}`,
            chainName: "Sepolia Test Network",
            rpcUrls: ["https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID"], // Assicurati di usare il tuo ID Infura
            nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          };
        }
        // Puoi aggiungere qui altri casi per altre reti se necessario (es. Mainnet, Polygon, BSC)

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
  }, [desiredChainId, updateWalletInfo]); // Dipende anche da updateWalletInfo

    const disconnectWallet = useCallback(() => {
  // 1) Puliamo lo stato
  setWalletConnected(false);
  setBalanceInfo({ address: null, ethBalance: null });
  setCorrectChain(false);
  setProvider(null);
  setSigner(null);
  localStorage.removeItem("walletConnected");

  // 2) Ricarichiamo la pagina per "resettare" React/MetaMask
  window.location.reload();
}, []);



  useEffect(() => {
  const initWalletOnLoad = async () => {
    if (window.ethereum) {
      const userPreviouslyConnected = localStorage.getItem("walletConnected") === "true";
      if (userPreviouslyConnected) {
        await updateWalletInfo(); // 🔁 Connetti solo se l'utente ha dato consenso in precedenza
      }
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
}, [updateWalletInfo]);


  return {
    walletConnected,
    balanceInfo: {
      address: balanceInfo.address,
      ethBalance: balanceInfo.ethBalance,
    },
    connectWallet,
    correctChain,
    provider, // Espongo il provider
    signer,   // Espongo il signer
    switchChain,
    disconnectWallet,
  };
};