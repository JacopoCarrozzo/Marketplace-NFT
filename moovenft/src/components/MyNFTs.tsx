import React, { useEffect, useState } from "react";
import { useMarketNFTs, NFTItem } from "../hooks/useMarketNFTs";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../constant/contract";
import { CITY_IMAGES } from "../constant/contract";
import Info from "./Info";

interface MyNFTProps {
  connectedProvider: ethers.BrowserProvider | ethers.JsonRpcProvider | null;
  walletAddress: string | null;
  signer: ethers.Signer | null;
  onNFTAction: () => void;
  setMarketplaceRefreshFunction: React.Dispatch<
    React.SetStateAction<(() => void) | null>
  >;
}

const MyNFT: React.FC<MyNFTProps> = ({
  connectedProvider,
  walletAddress,
  signer,
  onNFTAction,
  setMarketplaceRefreshFunction,
}) => {
   console.log("MyNFT component rendered");
  const { items: nfts, loading, error, fetchNFTs } = useMarketNFTs(connectedProvider);
  const [selectedNFT, setSelectedNFT] = useState<NFTItem | null>(null);

  // Passa la funzione di refresh a Home
  useEffect(() => {
    setMarketplaceRefreshFunction(() => fetchNFTs);
  }, [fetchNFTs, setMarketplaceRefreshFunction]);
  
  // Aggiorna la lista degli NFT quando cambia onNFTAction
  useEffect(() => {
    onNFTAction();
  }, [onNFTAction, fetchNFTs]);

  // Log aggiuntivi per verificare gli owner direttamente dal contratto
  useEffect(() => {
    const checkOwners = async () => {
      if (!connectedProvider || !nfts.length) return;

      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        connectedProvider
      );

      for (const nft of nfts) {
        try {
          const owner = await contract.ownerOf(Number(nft.tokenId));
          console.log(`Token ID ${nft.tokenId} - Owner dal contratto:`, owner);
        } catch (err) {
          console.error(`Errore nel recuperare owner per tokenId ${nft.tokenId}:`, err);
        }
      }
    };

    checkOwners();
  }, [nfts, connectedProvider]);

  // Funzione per mettere in vendita un NFT
  const handleListForSale = async (nft: NFTItem, priceInEth: string) => {
    if (!signer || !walletAddress) {
      alert("Devi connettere il tuo wallet per mettere in vendita NFT.");
      return;
    }

    if (!connectedProvider) {
      alert("Provider non disponibile per leggere lo stato on-chain.");
      return;
    }

    try {
      const contractRead = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        connectedProvider
      );

      // Verifica che l'utente sia il proprietario
      const onChainOwner = await contractRead.ownerOf(Number(nft.tokenId));
      console.log(`Token ID ${nft.tokenId} - onChainOwner:`, onChainOwner);
      if (onChainOwner.toLowerCase() !== walletAddress.toLowerCase()) {
        alert("Non sei il proprietario di questo NFT!");
        return;
      }

      // Verifica che l'NFT non sia già in vendita
      const isForSaleOnChain = await contractRead.isForSale(Number(nft.tokenId));
      console.log(`Token ID ${nft.tokenId} - isForSale:`, isForSaleOnChain);
      if (isForSaleOnChain) {
        alert("Questo NFT è già in vendita!");
        return;
      }

      // Convalida il prezzo
      let priceInWei: bigint;
      try {
        priceInWei = ethers.parseEther(priceInEth);
        if (priceInWei <= 0) {
          alert("Il prezzo deve essere maggiore di zero.");
          return;
        }
      } catch {
        alert("Prezzo non valido. Inserisci un numero valido in ETH.");
        return;
      }

      // Prepara il contratto per la scrittura
      const contractWrite = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer
      );

      // Stima del gas
      try {
        await contractWrite.listForSale.estimateGas(Number(nft.tokenId), priceInWei);
      } catch (gasError: any) {
        console.error(`Errore stima gas per tokenId ${nft.tokenId}:`, gasError);
        alert(
          `Errore di gas: ${gasError.reason || gasError.message || "Transazione fallita"}`
        );
        return;
      }

      // Invia la transazione
      console.log(`Metto in vendita NFT ${nft.tokenId} per ${priceInEth} ETH`);
      const tx = await contractWrite.listForSale(Number(nft.tokenId), priceInWei);
      console.log(`Hash transazione:`, tx.hash);
      await tx.wait();
      console.log(`Transazione confermata per tokenId ${nft.tokenId}`);

      alert(`NFT #${nft.tokenId} messo in vendita con successo!`);
      onNFTAction(); // Aggiorna la lista
    } catch (e: any) {
      console.error(`Errore messa in vendita NFT ${nft.tokenId}:`, e);
      alert(
        `Errore: ${e.reason || e.message || "Errore sconosciuto"}`
      );
    }
  };

  // Filtra solo gli NFT posseduti dall'utente
  const ownedNFTs = walletAddress
    ? nfts.filter(
        (nft) => nft.owner.toLowerCase() === walletAddress.toLowerCase()
      )
    : [];

  // Log per vedere tutti gli NFT e quelli posseduti
  console.log("All NFTs:", nfts);
  console.log("Owned NFTs:", ownedNFTs);

  return (
    <div className="max-w-full mx-auto px-6 py-12">
      <h2 className="text-3xl font-bold text-center mb-8 text-white">
        I Miei NFT
      </h2>

      {loading && (
        <p className="text-center text-white text-lg">Caricamento NFT...</p>
      )}
      {error && (
        <p className="text-center text-red-500 text-lg">Errore: {error}</p>
      )}
      {!walletAddress && (
        <p className="text-center text-white text-lg">
          Connetti il tuo wallet per vedere i tuoi NFT.
        </p>
      )}

      {!loading && !error && walletAddress && ownedNFTs.length === 0 && (
        <p className="text-center text-white text-lg">
          Non possiedi nessun NFT al momento.
        </p>
      )}

      {!selectedNFT && ownedNFTs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {ownedNFTs.map((nft) => (
            <div
              key={nft.tokenId}
              className="bg-white shadow-lg rounded-lg overflow-hidden flex flex-col"
            >
              <div className="p-4 flex-1">
                <h3 className="text-lg font-semibold text-gray-800">
                  {nft.name}
                </h3>
                <div className="h-32 w-full overflow-hidden rounded">
                  <img
                    src={CITY_IMAGES[nft.city] || "/images/default.jpg"}
                    alt={nft.city}
                    className="object-cover h-full w-full"
                  />
                </div>
                <p className="text-gray-600 mt-2 text-sm">Città: {nft.city}</p>
              </div>

              <div className="p-4 border-t flex space-x-4">
                <button
                  onClick={() => setSelectedNFT(nft)}
                  className="flex-1 block text-center bg-green-500 text-black-800 py-2 rounded hover:bg-green-600 transition"
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
              handleListForSale(
                { ...selectedNFT, price: price.toString(), owner: recipient } as NFTItem,
                price.toString()
              )
            }
          />
        </div>
      )}
    </div>
  );
};

export default MyNFT;