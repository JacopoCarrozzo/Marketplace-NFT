import React from "react";
import type { NFTItem } from "../hooks/useMarketNFTs";
import { Link } from "react-router-dom";

export interface InfoProps {
  nft: NFTItem;
  onBookClick: (price: number, recipient: string) => void;
  setSelectedNFT: React.Dispatch<React.SetStateAction<NFTItem | null>>; // 👈 AGGIUNTO

}

const Info: React.FC<InfoProps> = ({ nft, onBookClick, setSelectedNFT }) => {
  // Usa l'indirizzo proprietario come "recipient"
  const recipientAddress = nft.owner;

  return (
    <div className="flex flex-col w-full h-full p-8  rounded-lg">
      <div className="flex-grow flex">
        {/* Immagine */}
        <div className="w-1/3 h-full mr-8">
          <div className="w-full h-full border-4 border-white rounded-lg overflow-hidden">
            <img
             // src={nft.image}           //da  fare brooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo
              alt={nft.name}
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Testo */}
        <div className="w-3/4 text-white">
          <h2 className="text-4xl font-bold mb-4">{nft.name}</h2>
          <p className="text-lg mb-2"><strong>Città:</strong> {nft.city}</p>
          <p className="text-lg mb-4">{nft.description}</p>
          <p className="text-lg mb-2"><strong>Prezzo:</strong> {nft.price} ETH</p>
          </div>
      </div>

      {/* Bottone di azione */}
      <div className="max-w-xl mx-auto rounded-lg mt-8 flex space-x-4">  
        <button
              className="w-full bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-700 transition duration-300"
              onClick={() => setSelectedNFT(null)}>
            Visualiza gli altri NFT
        </button>

        <button
          className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-300"
          onClick={() => {
            const priceNum = Number(nft.price);
            onBookClick(priceNum, recipientAddress);
          }}
        >
          Acquista
        </button>
         
        
      </div>
    </div>
  );
};

export default Info;