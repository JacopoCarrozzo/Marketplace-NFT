// src/components/HistoryAuction.tsx

import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../constant/contract";
import { useWalletContext } from "../context/WalletContext"; // Il tuo contesto WalletContext
import { CITY_IMAGES } from "../constant/contract"; // Assicurati che CITY_IMAGES sia definito con chiavi capitalizzate

// Funzione per capitalizzare la prima lettera della città (riutilizzata)
const capitalizeFirstLetter = (str: string) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

// Interfaccia per un singolo elemento dell'asta storica
interface HistoricalAuctionItem {
  tokenId: number;
  startTime: number;
  endTime: number;
  highestBid: string; // Offerta finale
  highestBidder: string; // Vincitore dell'asta
  isEnded: boolean; // Stato dell'asta (dal contratto)
  name: string; // Nome dell'NFT (es. "City NFT #X")
  city: string; // Città associata all'NFT
  imageUrl: string; // URL dell'immagine
}

const HistoryAuction: React.FC = () => {
  // Estrai balanceInfo e usa balanceInfo.address al posto di 'account'
  const { provider, signer, walletConnected, correctChain, balanceInfo } = useWalletContext();
  const currentAccount = balanceInfo.address; // Ora 'currentAccount' contiene l'indirizzo dell'utente connesso

  const [historicalAuctions, setHistoricalAuctions] = useState<HistoricalAuctionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transactionLoading, setTransactionLoading] = useState<number | null>(null);
  const [contractOwner, setContractOwner] = useState<string | null>(null); // Stato per l'owner del contratto

  const fetchHistoricalAuctions = async () => {
    if (!provider || !currentAccount) return; // Usa currentAccount qui

    setLoading(true);
    setError(null);

    try {
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        provider
      );
      
      // Ottieni l'owner del contratto qui, una volta sola
      const ownerAddress = await contract.owner();
      setContractOwner(ownerAddress.toLowerCase()); // Salva l'owner in minuscolo per confronto

      const totalMintedBN = await contract.totalMinted();
      const totalMinted = Number(totalMintedBN);
      const lista: HistoricalAuctionItem[] = [];
      
      const currentTimeInSeconds = Math.floor(Date.now() / 1000); // Ottieni il timestamp corrente in secondi

      for (let tokenId = 1; tokenId <= totalMinted; tokenId++) {
        const auctionOnChain = await contract.auctions(tokenId);
        const startTime: number = Number(auctionOnChain.startTime);
        const endTime: number = Number(auctionOnChain.endTime);
        const isEnded: boolean = auctionOnChain.ended;
        const highestBidWei: bigint = auctionOnChain.highestBid as bigint;
        const highestBidder: string = auctionOnChain.highestBidder;

  
        if (endTime === 0 || endTime > currentTimeInSeconds) {
            continue; // Salta questa asta se non è scaduta o non valida
        }


        let name = `NFT #${tokenId}`;
        let city = "sconosciuta";
        let imageUrl = "";

        try {
          const [metadataName, description, metadataCity] =
            await contract.getTokenMetadata(tokenId);
          name = metadataName || name;
          const lowerCaseCity = metadataCity.toLowerCase().trim();
          city = lowerCaseCity || "sconosciuta";

          const cityKeyForImage = capitalizeFirstLetter(lowerCaseCity);
          imageUrl = CITY_IMAGES[cityKeyForImage] || CITY_IMAGES["Sconosciuta"] || "";

        } catch (metadataError: any) {
          console.error(
            `Errore nel recuperare metadata per tokenId ${tokenId}:`,
            metadataError.message
          );
          imageUrl = CITY_IMAGES["Sconosciuta"] || "";
        }
        
        lista.push({
          tokenId,
          startTime,
          endTime,
          highestBid: ethers.formatEther(highestBidWei),
          highestBidder,
          isEnded: isEnded,
          name,
          city,
          imageUrl,
        });
      }

      lista.sort((a, b) => a.tokenId - b.tokenId);
      setHistoricalAuctions(lista);
    } catch (e: any) {
      console.error("Errore fetchHistoricalAuctions:", e.message);
      setError("Errore nel caricamento delle aste storiche.");
    } finally {
      setLoading(false);
    }
  };

  // Funzione per finalizzare un'asta
  const handleFinalizeAuction = async (tokenId: number, highestBidder: string) => {
    if (!signer || !walletConnected || !correctChain || !currentAccount || !contractOwner) {
      alert("Connetti il wallet, assicurati di essere sulla chain corretta e che l'owner del contratto sia caricato.");
      return;
    }

    setTransactionLoading(tokenId);

    try {
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer // Usa il signer per inviare transazioni
      );
      
      const isOwner = contractOwner.toLowerCase() === currentAccount.toLowerCase(); // Usa currentAccount
      const isHighestBidder = highestBidder.toLowerCase() === currentAccount.toLowerCase(); // Usa currentAccount

      if (!isOwner && !isHighestBidder) {
          alert("Non sei l'owner del contratto o il vincitore dell'asta. Non puoi finalizzare.");
          return;
      }

      console.log(`Finalizzazione asta per tokenId: ${tokenId}`);
      const tx = await contract.finalizeAuction(tokenId);
      await tx.wait(); // Aspetta la conferma della transazione
      alert("Asta finalizzata con successo!");
      fetchHistoricalAuctions(); // Ricarica le aste per aggiornare lo stato
    } catch (e: any) {
      console.error("Errore nella finalizzazione dell'asta:", e);
      alert("Errore nella finalizzazione dell'asta: " + (e.reason || e.message || "Errore sconosciuto"));
    } finally {
      setTransactionLoading(null); // Rimuovi lo stato di caricamento
    }
  };

  // Funzione per ritirare il rimborso
  const handleWithdrawRefund = async (tokenId: number) => {
    if (!signer || !walletConnected || !correctChain || !currentAccount) { // Usa currentAccount
      alert("Connetti il wallet e assicurati di essere sulla chain corretta.");
      return;
    }

    setTransactionLoading(tokenId);

    try {
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer
      );

      console.log(`Ritiro rimborso per tokenId: ${tokenId}`);
      const tx = await contract.withdrawRefund(tokenId);
      await tx.wait(); // Aspetta la conferma della transazione
      alert("Rimborso ritirato con successo!");
      fetchHistoricalAuctions(); // Ricarica le aste per aggiornare lo stato
    } catch (e: any) {
      console.error("Errore nel ritiro del rimborso:", e);
      alert("Errore nel ritiro del rimborso: " + (e.reason || e.message || "Errore sconosciuto"));
    } finally {
      setTransactionLoading(null); // Rimuovi lo stato di caricamento
    }
  };

  useEffect(() => {
    if (provider && walletConnected && correctChain && currentAccount) { // Usa currentAccount
      fetchHistoricalAuctions();
    }
  }, [provider, walletConnected, correctChain, currentAccount]); // Aggiungi currentAccount alle dipendenze

  if (!walletConnected)
    return (
      <div className="p-6 text-center text-gray-700">
        Connetti il wallet per vedere le aste storiche.
      </div>
    );
  if (!correctChain)
    return (
      <div className="p-6 text-center text-gray-700">
        Connettiti alla chain corretta.
      </div>
    );

  return (
    <div className="max-w-full mx-auto px-4 py-12">
      <h2 className="text-3xl font-bold text-center mb-8 text-white">
         Aste Concluse
      </h2>
      {loading && (
        <p className="text-center text-white text-lg">Caricamento aste...</p>
      )}
      {error && (
        <p className="text-center text-red-500 text-lg">{error}</p>
      )}
      {!loading && !error && historicalAuctions.length === 0 && (
        <p className="text-center text-white text-lg">Nessuna asta scaduta trovata.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {historicalAuctions.map((item) => {
          // La logica dello stato dell'asta qui è ancora utile per il display
          const auctionStatus = item.isEnded
            ? "Terminata"
            : (item.endTime * 1000 < Date.now() ? "Scaduta (non finalizzata)" : "Attiva"); 
          const statusColor = item.isEnded
            ? "bg-red-200 text-red-800"
            : (item.endTime * 1000 < Date.now() ? "bg-yellow-200 text-yellow-800" : "bg-green-200 text-green-800");

          const highestBidderDisplay = item.highestBidder && item.highestBidder !== ethers.ZeroAddress
            ? `${item.highestBidder.substring(0, 6)}...${item.highestBidder.substring(item.highestBidder.length - 4)}`
            : "Nessuno";
          
          const finalBidDisplay = item.highestBid !== "0.0" ? `${item.highestBid} ETH` : "N/A";

          const isAuctionEnded = item.isEnded;
          const isAuctionExpired = item.endTime * 1000 < Date.now(); // Questa sarà sempre true qui

          // La finalizzazione può essere chiamata se l'asta è scaduta E NON è stata finalizzata on-chain,
          // E l'utente connesso è il vincitore O l'owner del contratto
          const showFinalizeButton = isAuctionExpired && !isAuctionEnded && currentAccount && (
              currentAccount.toLowerCase() === item.highestBidder.toLowerCase() || 
              (contractOwner && currentAccount.toLowerCase() === contractOwner) 
          );
          
          // Il rimborso può essere ritirato se l'asta è finalizzata on-chain E l'utente connesso non è il vincitore
          const showWithdrawRefundButton = isAuctionEnded && currentAccount && item.highestBidder.toLowerCase() !== currentAccount.toLowerCase();

          return (
            <div
              key={item.tokenId}
              className="bg-white shadow-lg rounded-lg overflow-hidden flex flex-col"
            >
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-lg font-semibold text-gray-800">
                  {item.name} ({capitalizeFirstLetter(item.city)})
                </h3>
                <div className="h-32 w-full overflow-hidden rounded mt-2 bg-gray-200">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.city}
                      className="object-cover h-full w-full"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-gray-500 text-sm p-2">
                      Immagine non disponibile
                    </span>
                  )}
                </div>
                <p className="text-gray-600 mt-2 text-sm">Città: {capitalizeFirstLetter(item.city)}</p>
                <p className="text-gray-600 mt-2 text-sm">Offerta Finale: {finalBidDisplay}</p>
                <p className="text-gray-600 mt-1 text-sm">Vincitore: {highestBidderDisplay}</p>
                <p className="text-gray-600 mt-1 text-xs">
                  Terminata il: {new Date(item.endTime * 1000).toLocaleString()}
                </p>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold mt-2 ${statusColor}`}>
                  Stato: {auctionStatus}
                </span>

                <div className="mt-4 flex flex-col space-y-2">
                  {showFinalizeButton && (
                    <button
                      onClick={() => handleFinalizeAuction(item.tokenId, item.highestBidder)}
                      className={`w-full py-2 rounded transition ${
                        transactionLoading === item.tokenId 
                          ? "bg-gray-400 cursor-not-allowed" 
                          : "bg-blue-600 text-white hover:bg-blue-500"
                      }`}
                      disabled={transactionLoading === item.tokenId}
                    >
                      {transactionLoading === item.tokenId ? "Finalizzazione..." : "Finalizza Asta"}
                    </button>
                  )}
                  {showWithdrawRefundButton && (
                    <button
                      onClick={() => handleWithdrawRefund(item.tokenId)}
                      className={`w-full py-2 rounded transition ${
                        transactionLoading === item.tokenId 
                          ? "bg-gray-400 cursor-not-allowed" 
                          : "bg-yellow-600 text-white hover:bg-yellow-500"
                      }`}
                      disabled={transactionLoading === item.tokenId}
                    >
                      {transactionLoading === item.tokenId ? "Ritiro..." : "Ritira Rimborso"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HistoryAuction;