// src/components/Info.tsx

import React from "react";
import type { NFTItem } from "../hooks/useMarketNFTs";
import { CITY_IMAGES } from "../constant/contract";

// Funzione per capitalizzare la prima lettera (utile per CITY_IMAGES)
const capitalizeFirstLetter = (str: string) => {
  if (!str) return "";
  // Assicurati che la città sia capitalizzata correttamente per il lookup delle immagini
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export interface InfoProps {
  nft: NFTItem;
  // onBookClick per l'azione di acquisto diretto (dal marketplace)
  // Resa opzionale con '?' per consentire l'utilizzo in contesti dove non si acquista (es. MyNFTs)
  onBookClick?: (price: number, recipient: string) => void;
  // onStartAuctionClick per l'azione di avvio asta (dai propri NFT)
  // Resa opzionale con '?' e tipo Promise<void> per funzioni async
  onStartAuctionClick?: (duration: number) => Promise<void>; 
  setSelectedNFT: React.Dispatch<React.SetStateAction<NFTItem | null>>;
  // Nuove props per il controllo condizionale dei bottoni
  isOwnedByUser?: boolean; // Indica se l'utente corrente possiede l'NFT
  isForSale?: boolean;    // Indica se l'NFT è attualmente in vendita diretta (non all'asta)
}

const Info: React.FC<InfoProps> = ({ 
  nft, 
  onBookClick, 
  onStartAuctionClick, // Nuova prop
  setSelectedNFT,
  isOwnedByUser = false, // Default a false se non specificato
  isForSale = false      // Default a false se non specificato
}) => {
  const recipientAddress = nft.owner; // L'owner è il destinatario per l'acquisto

  return (
    // Contenitore principale: flex column per layout verticale, centrato
    <div className="shadow-lg rounded-lg p-8 mx-auto max-w-2xl flex flex-col items-center bg-white text-gray-800">
      {/* Immagine al Top */}
      <div className="w-full mb-8"> {/* Larghezza piena, margine inferiore */}
        <div className="w-full h-auto max-h-[400px] rounded-lg overflow-hidden">
          <img
            src={CITY_IMAGES[capitalizeFirstLetter(nft.city)] || "/images/default.jpg"}
            alt={nft.name}
            className="w-full h-full object-contain" // object-contain per vedere l'intera immagine
          />
        </div>
      </div>

      {/* Testo Descrittivo (Sotto l'immagine) */}
      <div className="w-full text-center">
        <h2 className="text-4xl font-bold mb-4">{nft.name}</h2>
        <p className="text-lg mb-2"><strong>Token ID:</strong> {nft.tokenId}</p>
        <p className="text-lg mb-2"><strong>Città:</strong> {capitalizeFirstLetter(nft.city)}</p>
        <p className="text-lg mb-4">{nft.description}</p>
        {/* Mostra il prezzo solo se l'NFT è in vendita diretta e il prezzo è valido */}
        {isForSale && nft.price && nft.price !== "0.0" && (
            <p className="text-lg mb-2"><strong>Prezzo:</strong> {nft.price} ETH</p>
        )}
      </div>

      {/* Bottoni di Azione (Sotto il testo) */}
      <div className="w-full flex flex-col md:flex-row justify-center space-y-4 md:space-y-0 md:space-x-4 mt-8">
        <button
          className="w-full md:w-auto bg-green-500 text-white font-semibold py-3 px-6 rounded-lg hover:bg-gray-700 transition duration-300 text-lg"
          onClick={() => setSelectedNFT(null)}
        >
          Visualizza gli altri NFT
        </button>

        {/* Pulsante "Acquista" - Visibile solo se isForSale è true e onBookClick è fornito */}
        {isForSale && onBookClick && (
          <button
            className="w-full md:w-auto bg-green-500 text-white font-semibold py-3 px-6 rounded-lg hover:bg-green-700 transition duration-300 text-lg"
            onClick={() => {
              const priceNum = Number(nft.price);
              onBookClick(priceNum, recipientAddress); // Passa il prezzo e l'owner come destinatario
            }}
          >
            Acquista
          </button>
        )}
      </div>
    </div>
  );
};

export default Info;