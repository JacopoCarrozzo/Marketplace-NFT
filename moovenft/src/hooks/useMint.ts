import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../constant/contract"; // Assicurati che il percorso sia corretto

// --- Hook personalizzato useMint ---
export const useMint = (
  signer: ethers.Signer | null, // Richiede il signer per inviare transazioni
  onMintSuccess?: () => void // Callback opzionale da eseguire al successo del mint
) => {
  const [minting, setMinting] = useState<boolean>(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintSuccess, setMintSuccess] = useState<boolean>(false);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);

  // La funzione mintNFT è racchiusa in useCallback per ottimizzazione
  const mintNFT = useCallback(
    async (mintCost: string) => {
      // mintCost è passato come stringa, verrà convertito in Wei
      if (!signer) {
        setMintError("Connetti il tuo wallet e assicurati di avere un signer.");
        return;
      }

      setMinting(true);
      setMintError(null);
      setMintSuccess(false);
      setMintTxHash(null);

      try {
        const contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          CONTRACT_ABI,
          signer // Collega il contratto al signer per inviare transazioni
        );

        // Converti il costo di minting da ETH a Wei
        const costInWei = ethers.parseEther(mintCost);

        // Verifica il saldo del wallet prima di inviare la transazione
        const walletAddress = await signer.getAddress();
        const balance = await signer.provider?.getBalance(walletAddress);

        if (!balance || balance < costInWei) {
          setMintError("Fondi insufficienti per coprire il costo di minting.");
          setMinting(false);
          return;
        }

        console.log(`Tentativo di mintare un NFT con costo: ${mintCost} ETH`);

        // Stima il gas per la transazione
        try {
          const estimatedGas = await contract.requestRandomNumber.estimateGas({
            value: costInWei,
          });
          console.log("Gas stimato per la transazione:", estimatedGas.toString());
        } catch (gasEstimationError: any) {
          console.error("Errore durante la stima del gas:", gasEstimationError);
          setMintError(
            `Errore durante la stima del gas: ${
              gasEstimationError.reason || gasEstimationError.message || "Errore sconosciuto"
            }`
          );
          setMinting(false);
          return;
        }

        // Invia la transazione per richiedere il numero casuale (e mintare l'NFT)
        const tx = await contract.requestRandomNumber({
          value: costInWei,
        });

        setMintTxHash(tx.hash);
        console.log("Transazione di minting inviata. Hash:", tx.hash);

        await tx.wait(); // Attendi la conferma della transazione
        console.log("Transazione di minting confermata!");

        setMintSuccess(true);
        setMinting(false);

        // Esegui il callback di successo se fornito
        if (onMintSuccess) {
          onMintSuccess();
        }
      } catch (e: any) {
        console.error("Errore durante il minting dell'NFT:", e);
        setMintError(
          `Errore durante il minting: ${
            e.reason || e.data?.message || e.message || "Errore sconosciuto"
          }`
        );
        setMinting(false);
      }
    },
    [signer, onMintSuccess] // Dipendenze per useCallback
  );

  // Funzione per resettare lo stato dell'hook
  const resetMintState = useCallback(() => {
    setMinting(false);
    setMintError(null);
    setMintSuccess(false);
    setMintTxHash(null);
  }, []);

  return { mintNFT, minting, mintError, mintSuccess, mintTxHash, resetMintState };
};