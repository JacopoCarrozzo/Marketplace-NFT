import React from "react";
import type { NFTItem } from "../hooks/useMarketNFTs";
import { CITY_IMAGES } from "../constant/contract";

// Function to capitalize the first letter (used for CITY_IMAGES lookup)
const capitalizeFirstLetter = (str: string) => {
  if (!str) return "";
  // Ensure the city is capitalized correctly for image lookup
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export interface InfoProps {
  nft: NFTItem;
  // onBookClick for direct purchase action (from marketplace)
  // Made optional with '?' for use in contexts where purchase is not available (e.g., MyNFTs)
  onBookClick?: (price: number, recipient: string) => void;
  // onStartAuctionClick for starting an auction (from owned NFTs)
  // Made optional with '?' and Promise<void> for async functions
  onStartAuctionClick?: (duration: number) => Promise<void>;
  setSelectedNFT: React.Dispatch<React.SetStateAction<NFTItem | null>>;
  // Props for conditional button rendering
  isOwnedByUser?: boolean; // Indicates if the current user owns the NFT
  isForSale?: boolean;     // Indicates if the NFT is currently for direct sale (not in auction)
  isBuying?: boolean;      // Indicates if a purchase is in progress
  successMessage?: string | null; // Success notification
}

const Info: React.FC<InfoProps> = ({
  nft,
  onBookClick,
  onStartAuctionClick,
  setSelectedNFT,
  isOwnedByUser = false,
  isForSale = false,
  isBuying = false,
  successMessage = null,
}) => {
  const recipientAddress = nft.owner; // The owner is the recipient for purchase

  // Debug log to check props
  console.log("Info Props:", {
    isForSale,
    isOwnedByUser,
    onBookClick: !!onBookClick,
    price: nft.price,
    owner: nft.owner,
    isBuying,
    successMessage,
  });

  return (
    // Main container: flex column for vertical layout, centered
    <div className="shadow-lg rounded-lg p-8 mx-auto max-w-2xl flex flex-col items-center bg-white text-gray-800">
      {/* Success notification */}
      {successMessage && (
        <div className="mb-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center w-full">
          <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          {successMessage}
        </div>
      )}

      {/* Image at the top */}
      <div className="w-full mb-8"> {/* Full width, bottom margin */}
        <div className="w-full h-auto max-h-[400px] rounded-lg overflow-hidden">
          <img
            src={CITY_IMAGES[capitalizeFirstLetter(nft.city)] || "/images/default.jpg"}
            alt={nft.name}
            className="w-full h-full object-contain" // object-contain to show the full image
          />
        </div>
      </div>

      {/* Descriptive text (below the image) */}
      <div className="w-full text-center">
        <h2 className="text-4xl font-bold mb-4">{nft.name}</h2>
        <p className="text-lg mb-2"><strong>Token ID:</strong> {nft.tokenId}</p>
        <p className="text-lg mb-2"><strong>City:</strong> {capitalizeFirstLetter(nft.city)}</p>
        <p className="text-lg mb-4">{nft.description}</p>
        {/* Show price or reason why not available */}
        
      </div>

      {/* Action buttons (below the text) */}
      <div className="w-full flex flex-col md:flex-row justify-center space-y-4 md:space-y-0 md:space-x-4 mt-8">
        <button
          className="w-full md:w-auto bg-blue-500 text-white font-semibold py-3 px-6 rounded-lg hover:bg-blue-700 transition duration-300 text-lg"
          onClick={() => setSelectedNFT(null)}
          disabled={isBuying}
        >
          View Other NFTs
        </button>

        {/* "Purchase" button - Visible only if isForSale is true, onBookClick is provided, and not owned by user */}
        {isForSale && onBookClick && !isOwnedByUser && (
          <button
            className={`w-full md:w-auto bg-green-500 text-white font-semibold py-3 px-6 rounded-lg transition duration-300 text-lg ${
              isBuying ? "opacity-50 cursor-not-allowed" : "hover:bg-green-700"
            }`}
            onClick={() => {
              const priceNum = Number(nft.price);
              onBookClick(priceNum, recipientAddress); // Pass the price and owner as recipient
            }}
            disabled={isBuying}
          >
            {isBuying ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Buying...
              </span>
            ) : (
              "Purchase"
            )}
          </button>
        )}

        {/* "Start Auction" button - Visible only if isOwnedByUser is true, onStartAuctionClick is provided, and not for sale */}
        {isOwnedByUser && onStartAuctionClick && !isForSale && (
          <button
            className="w-full md:w-auto bg-blue-500 text-white font-semibold py-3 px-6 rounded-lg hover:bg-blue-700 transition duration-300 text-lg"
            onClick={() => onStartAuctionClick(7 * 24 * 60 * 60)} // Default to 7 days auction duration
            disabled={isBuying}
          >
            Start Auction
          </button>
        )}
      </div>
    </div>
  );
};

export default Info;