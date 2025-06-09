import React, { useEffect } from "react";
import { useMarketNFTs, NFTItem } from "../hooks/useMarketNFTs";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../constant/contract";
import { CITY_IMAGES } from "../constant/contract";
import { Link } from "react-router-dom";
import Info from "./Info";

interface MarketPlaceProps {
  connectedProvider: ethers.BrowserProvider | ethers.JsonRpcProvider | null;
  walletAddress: string | null;
  signer: ethers.Signer | null;
  onNFTAction: () => void; // Funzione per refresh esterni
  setMarketplaceRefreshFunction: React.Dispatch<
    React.SetStateAction<(() => void) | null>
  >;
}

const MarketPlace: React.FC<MarketPlaceProps> = ({
  connectedProvider,
  walletAddress,
  signer,
  onNFTAction,
  setMarketplaceRefreshFunction,
}) => {
  const { items: nfts, loading, error, fetchNFTs } = useMarketNFTs(
    connectedProvider
  );

  // Passo la reference a fetchNFTs verso Home per poterla richiamare dall’alto
  useEffect(() => {
    setMarketplaceRefreshFunction(() => fetchNFTs);
  }, [fetchNFTs, setMarketplaceRefreshFunction]);

  // Ogni volta che onNFTAction cambia, richiamo fetchNFTs
  useEffect(() => {
    onNFTAction();
  }, [onNFTAction, fetchNFTs]);

  const [selectedNFT, setSelectedNFT] = React.useState<NFTItem | null>(null);

  // Funzione per gestire l'acquisto di un NFT
  const handleBuyNFT = async (nft: NFTItem) => {
    if (!signer || !walletAddress) {
      alert("Devi connettere il tuo wallet per acquistare NFT.");
      return;
    }

    // 1) Verifico chi è l’owner on‐chain nel momento in cui l'utente clicca
    if (!connectedProvider) {
      alert("Provider non disponibile per leggere lo stato on‐chain.");
      return;
    }

    const contractRead = new ethers.Contract(
      CONTRACT_ADDRESS,
      CONTRACT_ABI,
      connectedProvider
    );

    let onChainOwner: string;
    try {
      onChainOwner = await contractRead.ownerOf(Number(nft.tokenId));
  console.log(">>> onChainOwner:", onChainOwner);
  console.log(">>> walletAddress:", walletAddress);
    } catch (ownerError) {
      console.error("Errore nel recuperare owner on‐chain:", ownerError);
      alert("Impossibile recuperare l'owner on‐chain, riprova più tardi.");
      return;
    }

    if (onChainOwner.toLowerCase() === walletAddress.toLowerCase()) {
      alert("Non puoi comprare il tuo stesso NFT!");
      return;
    }

    try {
      // 2) Preparo il contratto in scrittura con il signer
      const contractWrite = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer
      );

      // 3) Controllo se l'NFT è ancora in vendita on‐chain
      const isForSaleOnChain: boolean = await contractWrite.isForSale(
        Number(nft.tokenId)
      );
      console.log("NFT è in vendita on‐chain?", isForSaleOnChain);
      if (!isForSaleOnChain) {
        alert("Questo NFT non è più in vendita.");
        return;
      }

      // 4) Confronto il prezzo on‐chain con quello presente in frontend
      const priceOnChainWei: bigint = await contractWrite.tokenPrices(
        Number(nft.tokenId)
      );
      const priceInWei: bigint = ethers.parseEther(nft.price); // restituisce bigint
      console.log(
        "Prezzo on‐chain (ETH):",
        ethers.formatEther(priceOnChainWei)
      );
      console.log("Prezzo frontend (ETH):", nft.price);

      if (priceInWei < priceOnChainWei) {
        alert("Il prezzo è cambiato: aggiorna la pagina e riprova.");
        return;
      }

      // 5) Controllo il bilancio del wallet (in bigint)
      const balance: bigint | undefined = await signer.provider?.getBalance(
        walletAddress
      );
      if (!balance || balance < priceInWei) {
        alert("Saldo insufficiente per completare l'acquisto.");
        return;
      }
      console.log(
        `Bilancio (${walletAddress}): ${ethers.formatEther(balance)} ETH`
      );

      // 6) Stima del gas prima di inviare la transazione
      try {
        await contractWrite.buyNFT.estimateGas(Number(nft.tokenId), {
          value: priceInWei,
        });
      } catch (gasError: any) {
        console.error("estimateGas error:", gasError);
        alert(
          "Errore di gas: " +
            (gasError.reason || gasError.message || "Transazione fallita")
        );
        return;
      }

      // 7) Invia la transazione di acquisto
      console.log(
        `Tentativo di acquistare NFT ${nft.tokenId} per ${nft.price} ETH`
      );
      const tx = await contractWrite.buyNFT(Number(nft.tokenId), {
        value: priceInWei,
      });
      console.log("Hash transazione:", tx.hash);
      await tx.wait();
      console.log("Transazione di acquisto confermata!");

      alert(`Hai acquistato con successo l'NFT #${nft.tokenId}!`);
      onNFTAction(); // Forzo il refresh della lista dopo l’acquisto
    } catch (e: any) {
      console.error("Errore durante l'acquisto dell'NFT:", e);
      alert(
        "Errore durante l'acquisto dell'NFT: " +
          (e.reason || e.message || "Errore sconosciuto")
      );
    }
  };

  return (
    <div className="max-w-full mx-auto px-6 py-12">
      <h2 className="text-3xl font-bold text-center mb-8 text-white">
        NFT in vendita
      </h2>

      {loading && (
        <p className="text-center text-white text-lg">Caricamento NFT…</p>
      )}
      {error && (
        <p className="text-center text-red-500 text-lg">Errore: {error}</p>
      )}

      {!loading && !error && nfts.length === 0 && (
        <p className="text-center text-white text-lg">
          Nessun NFT in vendita al momento.
        </p>
      )}

      {!selectedNFT && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {nfts
              .filter((nft) => nft.isForSale)      // ← passo in più: tengo solo gli NFT “in vendita”
              .map((nft: NFTItem) => (
            <div
              key={nft.tokenId}
              className="bg-white shadow-lg rounded-lg overflow-hidden flex flex-col"
            >
              <div className="p-4 flex-1">
                <h3 className="text-lg font-semibold text-gray-800">
                  {nft.name} {nft.city}
                </h3>
                <div className="h-32 w-full overflow-hidden rounded">
                  <img
                    src={CITY_IMAGES[nft.city]}
                    alt={nft.city}
                    className="object-cover h-full w-full"
                  />
                </div>
                <p className="text-gray-600 mt-2 text-sm">
                  Città: {nft.city}
                </p>
                <p className="text-gray-800 font-bold mt-auto text-sm">
                  Prezzo: {nft.price} ETH
                </p>
              </div>

              <div className="p-4 border-t flex space-x-4">
                <button
                  onClick={() => handleBuyNFT(nft)}
                  className="flex-1 block text-center bg-blue-600 text-gray-200 py-2 rounded hover:bg-gray-300 transition"
                >
                  Acquista
                </button>

                <button
                  onClick={() => setSelectedNFT(nft)}
                  className="flex-1 block text-center bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300 transition"
                >
                  Mostra Info
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedNFT && (
        <div className="mt-12">
          <Info
            nft={selectedNFT}
            setSelectedNFT={setSelectedNFT}
            onBookClick={(price, recipient) =>
              handleBuyNFT({
                ...selectedNFT,
                owner: recipient,
                price: price.toString(),
              } as NFTItem)
            }
          />
        </div>
      )}
    </div>
  );
};

export default MarketPlace;