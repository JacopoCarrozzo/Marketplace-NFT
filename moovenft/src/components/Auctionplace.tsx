import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../constant/contract";
import { useWalletContext } from "../context/WalletContext";
import { CITY_IMAGES } from "../constant/contract"; // Assicurati che CITY_IMAGES includa un'immagine di fallback
import { Link } from 'react-router-dom'; // Importa Link da react-router-dom

// Importa l'icona. Assicurati che il percorso sia corretto per la tua icona,
// relativa alla posizione di questo file AuctionPlace.tsx.
import historyIcon from '../assets/images/cronologia.png'; 

// Funzione per capitalizzare la prima lettera della città
const capitalizeFirstLetter = (str: string) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

interface AuctionItem {
  tokenId: number;
  endTime: number;
  highestBid: string;
  highestBidder: string;
  isEnded: boolean;
  name: string;
  city: string;
  imageUrl: string; // Proprietà che conterrà l'URL dell'immagine finale
}

interface AuctionPlaceProps {
  onNFTAction: () => void;
  setAuctionRefreshFunction: React.Dispatch<
    React.SetStateAction<(() => void) | null>
  >;
}

const AuctionPlace: React.FC<AuctionPlaceProps> = ({
  onNFTAction,
  setAuctionRefreshFunction,
}) => {
  const { provider, signer, walletConnected, correctChain } =
    useWalletContext();
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bidAmounts, setBidAmounts] = useState<{ [key: number]: string }>({}); // Stato per gli importi delle offerte

  const fetchAuctions = async () => {
    if (!provider) return;
    setLoading(true);
    setError(null);

    try {
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        provider
      );
      const totalMintedBN = await contract.totalMinted();
      const totalMinted = Number(totalMintedBN);
      const now = Math.floor(Date.now() / 1000);
      const lista: AuctionItem[] = [];

      for (let tokenId = 1; tokenId <= totalMinted; tokenId++) {
        const auctionOnChain = await contract.auctions(tokenId);
        const endTime: number = Number(auctionOnChain.endTime);
        const isEnded: boolean = auctionOnChain.ended;
        const highestBidWei: bigint = auctionOnChain.highestBid as bigint;
        const highestBidder: string = auctionOnChain.highestBidder;

        if (endTime > now && !isEnded) {
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

            console.log(
              `Raw City: ${metadataCity}, LowerCase City: ${lowerCaseCity}, Key for Image: ${cityKeyForImage}, Image URL: ${imageUrl}`
            );
          } catch (metadataError: any) {
            console.error(
              `Errore nel recuperare metadata per tokenId ${tokenId}:`,
              metadataError.message
            );
            imageUrl = CITY_IMAGES["Sconosciuta"] || "";
          }

          lista.push({
            tokenId,
            endTime,
            highestBid: ethers.formatEther(highestBidWei),
            highestBidder,
            isEnded,
            name,
            city,
            imageUrl,
          });
        }
      }

      setAuctions(lista);
    } catch (e: any) {
      console.error("Errore fetchAuctions:", e.message);
      setError("Errore nel caricamento delle aste.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (provider && signer && walletConnected && correctChain) {
      fetchAuctions();
    }
  }, [provider, signer, walletConnected, correctChain]);

  useEffect(() => {
    setAuctionRefreshFunction(() => fetchAuctions);
  }, [setAuctionRefreshFunction]);

  useEffect(() => {
    const interval = setInterval(() => {
      setAuctions((prev) => prev.map((a) => ({ ...a })));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleBid = async (tokenId: number, bidAmount: string) => {
    if (!signer || !walletConnected) {
      alert("Devi connettere il tuo wallet per fare un'offerta.");
      return;
    }

    if (!bidAmount || isNaN(Number(bidAmount)) || Number(bidAmount) <= 0) {
      alert("Inserisci un importo valido per l'offerta (maggiore di zero).");
      return;
    }

    const contract = new ethers.Contract(
      CONTRACT_ADDRESS,
      CONTRACT_ABI,
      signer
    );

    try {
      setLoading(true); 

      const auction = await contract.auctions(tokenId);
      const currentHighestBidWei: bigint = auction.highestBid as bigint;
      const bidInWei = ethers.parseEther(bidAmount); 

      if (bidInWei <= currentHighestBidWei) {
        alert("L'offerta deve essere superiore all'offerta attuale.");
        return;
      }

      console.log(`Sending bid for tokenId ${tokenId} with value ${bidAmount} ETH`);
      const tx = await contract.bid(tokenId, { value: bidInWei });
      console.log(`Transaction hash: ${tx.hash}`);
      await tx.wait(); 
      console.log("Transaction confirmed.");

      alert("Offerta inviata con successo!");
      fetchAuctions(); 
      onNFTAction();   
      setBidAmounts(prev => { 
        const newAmounts = { ...prev };
        delete newAmounts[tokenId];
        return newAmounts;
      });
    } catch (e: any) {
      console.error("Errore durante l'invio dell'offerta:", e);
      alert(
        "Errore durante l'invio dell'offerta: " +
          (e.reason || e.code || e.message || "Errore sconosciuto")
      );
    } finally {
      setLoading(false); 
    }
  };

  if (!walletConnected)
    return (
      <div className="p-6 text-center text-gray-700">
        Connetti il wallet per vedere le aste.
      </div>
    );
  if (!correctChain)
    return (
      <div className="p-6 text-center text-gray-700">
        Connettiti alla chain corretta.
      </div>
    );

  return (
    // Aggiungi un div contenitore per posizionamento relativo o header
    <div className="relative max-w-full mx-auto px-4 py-12"> 
      {/* Blocco del link per lo storico acquisti */}
      <div className="absolute top-4 left-4 z-10"> {/* Usa absolute per posizionamento relativo al genitore */}
        <Link to="/AuctionHistory" className="text-blue-600 hover:text-blue-800 flex items-center space-x-2">
          <img src={historyIcon} alt="Storico" className="w-5 h-5 filter invert" />
          <span className="text-md font-semibold text-white">Aste Concluse</span>
        </Link>
      </div>

      <h2 className="text-3xl font-bold text-center mb-8 text-white mt-12"> {/* Aggiungi mt-12 per compensare il link */}
        Aste Attive
      </h2>
      {loading && (
        <p className="text-center text-white text-lg">Caricamento...</p>
      )}
      {error && (
        <p className="text-center text-red-500 text-lg">{error}</p>
      )}
      {!loading && !error && auctions.length === 0 && (
        <p className="text-center text-white text-lg">Nessuna asta attiva.</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {auctions.map((item) => {
          const now = Math.floor(Date.now() / 1000);
          const countdownSeconds = Math.max(item.endTime - now, 0);
          const countdown = `${String(
            Math.floor(countdownSeconds / 3600)
          ).padStart(2, "0")}:${String(
            Math.floor((countdownSeconds % 3600) / 60)
          ).padStart(2, "0")}:${String(countdownSeconds % 60).padStart(
            2,
            "0"
          )}`;

          return (
            <div
              key={item.tokenId}
              className="bg-white shadow-lg rounded-lg overflow-hidden flex flex-col"
            >
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-lg font-semibold text-gray-800">
                  {item.name} ({item.city})
                </h3>
                <div className="h-32 w-full overflow-hidden rounded mt-2 bg-gray-200">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.city}
                      className="object-cover h-full w-full"
                    />
                  ) : (
                    <span className="text-gray-500 text-sm p-2">
                      Immagine non disponibile
                    </span>
                  )}
                </div>
                <p className="text-gray-600 mt-2 text-sm">Città: {item.city}</p>
                <p className="text-gray-600 mt-2 text-sm">
                  Offerta attuale: {item.highestBid} ETH
                </p>
                <p className="text-gray-600 mt-1 text-xs">
                  Tempo rimanente: {countdownSeconds > 0 ? countdown : "Scaduta"}
                </p>
                <div className="mt-4">
                  <input
                    type="number"
                    step="0.0001" 
                    placeholder="Importo offerta (ETH)"
                    className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                    value={bidAmounts[item.tokenId] || ""}
                    onChange={(e) =>
                      setBidAmounts({
                        ...bidAmounts,
                        [item.tokenId]: e.target.value,
                      })
                    }
                    disabled={countdownSeconds <= 0} 
                  />
                </div>
              </div>
              <div className="p-4 border-t">
                <button
                  onClick={() => handleBid(item.tokenId, bidAmounts[item.tokenId])}
                  className={`w-full py-2 rounded transition ${
                    loading || countdownSeconds <= 0
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-500"
                  }`}
                  disabled={loading || countdownSeconds <= 0} 
                >
                  {loading ? "Invio in corso..." : "Fai Offerta"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AuctionPlace;