import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../constant/contract";
import { CITY_IMAGES } from "../constant/contract";
import { Link } from "react-router-dom";
import Info from "./Info";

interface AuctionItem {
  tokenId: number;
  endTime: number; // UNIX timestamp
  highestBid: string; // in ETH (string)
  highestBidder: string;
  isEnded: boolean;
  imageUrl: string;
  name: string;
  city: string;
}

interface AuctionPlaceProps {
  connectedProvider: ethers.BrowserProvider | ethers.JsonRpcProvider | null;
  walletAddress: string | null;
  signer: ethers.Signer | null;
  onNFTAction: () => void; // per forzare il refresh da componenti esterni
  setAuctionRefreshFunction: React.Dispatch<React.SetStateAction<(() => void) | null>>;
}

const AuctionPlace: React.FC<AuctionPlaceProps> = ({
  connectedProvider,
  walletAddress,
  signer,
  onNFTAction,
  setAuctionRefreshFunction,
}) => {
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [bidValues, setBidValues] = useState<{ [tokenId: number]: string }>({});

  // Funzione per leggere tutte le aste attive dal contratto
  const fetchAuctions = async () => {
    if (!connectedProvider) return;
    setLoading(true);
    setError(null);

    try {
      const contractRead = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, connectedProvider);
      // Supponiamo che il contratto esponga un array di tokenIds in asta:
      const activeTokenIds: number[] = await contractRead.getActiveAuctions(); 
      const fetched: AuctionItem[] = [];

      for (let tokenId of activeTokenIds) {
        const [
          endTimeBigNumber,
          highestBidWei,
          highestBidder,
          ended,
        ] = await Promise.all([
          contractRead.auctions(tokenId).then((a: any) => a.endTime),
          contractRead.auctions(tokenId).then((a: any) => a.highestBid),
          contractRead.auctions(tokenId).then((a: any) => a.highestBidder),
          contractRead.auctions(tokenId).then((a: any) => a.ended),
        ]);

        // Leggi il metadata on‐chain per nome/city (se il tuo NFT ha metadata on‐chain)
        const tokenUri: string = await contractRead.tokenURI(tokenId);
        // Estraggo nome e city da URI base64 (qui faccio un parse rapido, assumendo JSON base64)
        let name = `NFT #${tokenId}`;
        let city = "";
        try {
          const base64Json = tokenUri.replace("data:application/json;base64,", "");
          const jsonString = atob(base64Json);
          const metadata = JSON.parse(jsonString);
          name = metadata.name;
          city = metadata.City || "";
        } catch {
          // fallback se parsing fallisce
        }

        fetched.push({
          tokenId,
          endTime: endTimeBigNumber.toNumber(),
          highestBid: ethers.formatEther(highestBidWei),
          highestBidder,
          isEnded: ended,
          imageUrl: CITY_IMAGES[city] || "",
          name,
          city,
        });
      }

      setAuctions(fetched);
    } catch (e: any) {
      console.error("Errore fetchAuctions:", e);
      setError("Impossibile caricare le aste. Riprova più tardi.");
    } finally {
      setLoading(false);
    }
  };

  // Rendo disponibile fetchAuctions a componenti esterni (e.g., Home)
  useEffect(() => {
    setAuctionRefreshFunction(() => fetchAuctions);
  }, [setAuctionRefreshFunction]);

  // Ogni volta che onNFTAction cambia, rifaccio il fetch
  useEffect(() => {
    onNFTAction();
  }, [onNFTAction]);

  // Carico le aste alla mount
  useEffect(() => {
    fetchAuctions();
  }, [connectedProvider]);

  // Handler per fare un'offerta
  const handleBid = async (item: AuctionItem) => {
    if (!signer || !walletAddress) {
      alert("Devi connettere il wallet per partecipare all'asta.");
      return;
    }
    if (!connectedProvider) {
      alert("Provider non disponibile.");
      return;
    }

    const bidValue = bidValues[item.tokenId];
    if (!bidValue || isNaN(Number(bidValue)) || Number(bidValue) <= parseFloat(item.highestBid)) {
      alert(`Inserisci un importo maggiore di ${item.highestBid} ETH`);
      return;
    }

    const priceInWei = ethers.parseEther(bidValue);

    try {
      const contractWrite = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      // Verifico che l'asta non sia già terminata on‐chain
      const auctionData: any = await contractWrite.auctions(item.tokenId);
      const now = Math.floor(Date.now() / 1000);
      if (now >= auctionData.endTime.toNumber()) {
        alert("L'asta è già terminata.");
        return;
      }

      // Stimo gas
      try {
        await contractWrite.bid.estimateGas(item.tokenId, { value: priceInWei });
      } catch (gasError: any) {
        console.error("Errore estimateGas bid:", gasError);
        alert("Errore di gas: " + (gasError.reason || gasError.message || ""));
        return;
      }

      // Inoltro l'offerta
      const tx = await contractWrite.bid(item.tokenId, { value: priceInWei });
      await tx.wait();
      alert(`Offerta di ${bidValue} ETH inviata per NFT #${item.tokenId}!`);
      fetchAuctions();
      onNFTAction();
    } catch (e: any) {
      console.error("Errore durante la bid:", e);
      alert("Errore nell'offerta: " + (e.reason || e.message || ""));
    }
  };

  // Handler per concludere l'asta (solo owner/admin)
  const handleFinalize = async (item: AuctionItem) => {
    if (!signer) {
      alert("Devi connettere il wallet per concludere l'asta.");
      return;
    }
    try {
      const contractWrite = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contractWrite.finalizeAuction(item.tokenId);
      await tx.wait();
      alert(`Asta per NFT #${item.tokenId} conclusa.`);
      fetchAuctions();
      onNFTAction();
    } catch (e: any) {
      console.error("Errore finalizeAuction:", e);
      alert("Errore nel concludere l'asta: " + (e.reason || e.message || ""));
    }
  };

  // Handler per ritirare rimborso
  const handleWithdraw = async (item: AuctionItem) => {
    if (!signer) {
      alert("Devi connettere il wallet per ritirare il rimborso.");
      return;
    }
    try {
      const contractWrite = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contractWrite.withdrawRefund(item.tokenId);
      await tx.wait();
      alert(`Rimborso ritirato per NFT #${item.tokenId}.`);
      fetchAuctions();
      onNFTAction();
    } catch (e: any) {
      console.error("Errore withdrawRefund:", e);
      alert("Errore nel ritirare il rimborso: " + (e.reason || e.message || ""));
    }
  };

  return (
    <div className="max-w-full mx-auto px-6 py-12">
      <h2 className="text-3xl font-bold text-center mb-8 text-white">
        Aste NFT
      </h2>

      {loading && (
        <p className="text-center text-white text-lg">Caricamento aste…</p>
      )}
      {error && (
        <p className="text-center text-red-500 text-lg">Errore: {error}</p>
      )}

      {!loading && !error && auctions.length === 0 && (
        <p className="text-center text-white text-lg">
          Nessuna asta attiva al momento.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {auctions.map((item) => {
          const now = Math.floor(Date.now() / 1000);
          const isExpired = now >= item.endTime;
          const countdownSeconds = Math.max(item.endTime - now, 0);
          const countdown = new Date(countdownSeconds * 1000)
            .toISOString()
            .substr(11, 8); // HH:MM:SS

          return (
            <div
              key={item.tokenId}
              className="bg-white shadow-lg rounded-lg overflow-hidden flex flex-col"
            >
              <div className="p-4 flex-1">
                <h3 className="text-lg font-semibold text-gray-800">
                  {item.name} {item.city}
                </h3>
                <div className="h-32 w-full overflow-hidden rounded">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.city}
                      className="object-cover h-full w-full"
                    />
                  ) : (
                    <div className="h-full w-full bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-500 text-sm">
                        Immagine non disponibile
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-gray-600 mt-2 text-sm">
                  Città: {item.city}
                </p>
                <p className="text-gray-800 font-bold mt-1 text-sm">
                  Offerta Massima: {item.highestBid} ETH
                </p>
                <p className="text-gray-600 mt-1 text-xs">
                  {isExpired
                    ? "Asta scaduta"
                    : `Tempo rimanente: ${countdown}`}
                </p>
                {item.isEnded && (
                  <p className="text-red-500 mt-1 text-xs">
                    Conclusa
                  </p>
                )}
              </div>

              <div className="p-4 border-t flex flex-col space-y-2">
                {!item.isEnded && !isExpired && (
                  <>
                    <input
                      type="text"
                      placeholder={`Ex: >${item.highestBid}`}
                      value={bidValues[item.tokenId] || ""}
                      onChange={(e) =>
                        setBidValues((prev) => ({
                          ...prev,
                          [item.tokenId]: e.target.value,
                        }))
                      }
                      className="w-full border border-gray-300 rounded p-2 text-sm"
                    />
                    <button
                      onClick={() => handleBid(item)}
                      className="block w-full text-center bg-green-600 text-white py-2 rounded hover:bg-green-500 transition"
                    >
                      Fai Offerta
                    </button>
                  </>
                )}

                {isExpired && !item.isEnded && (
                  <button
                    onClick={() => handleFinalize(item)}
                    className="block w-full text-center bg-purple-600 text-white py-2 rounded hover:bg-purple-500 transition"
                  >
                    Concludi Asta
                  </button>
                )}

                {item.isEnded && (
                  <button
                    onClick={() => handleWithdraw(item)}
                    className="block w-full text-center bg-yellow-600 text-white py-2 rounded hover:bg-yellow-500 transition"
                  >
                    Ritira Rimborso
                  </button>
                )}

                <button
                  onClick={() => (
                    // Se vuoi mostrare un dettaglio con Info come nel MarketPlace
                    setBidValues((prev) => ({ ...prev })) // placeholder
                  )}
                  className="block w-full text-center bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300 transition"
                >
                  Mostra Info
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