import React, { useEffect, useState, useCallback } from "react"; // Added useCallback
import { useMarketNFTs, NFTItem } from "../hooks/useMarketNFTs";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI, CITY_IMAGES } from "../constant/contract";
import Info from "./Info";

interface MarketPlaceProps {
  connectedProvider: ethers.BrowserProvider | ethers.JsonRpcProvider | null;
  walletAddress: string | null;
  signer: ethers.Signer | null;
  onNFTAction: () => void;
  setMarketplaceRefreshFunction: React.Dispatch<React.SetStateAction<(() => void) | null>>;
}

const MarketPlace: React.FC<MarketPlaceProps> = ({
  connectedProvider,
  walletAddress,
  signer,
  onNFTAction,
  setMarketplaceRefreshFunction,
}) => {
  const { items: nfts, loading, error, fetchNFTs } = useMarketNFTs(connectedProvider);
  const [selectedNFT, setSelectedNFT] = useState<NFTItem | null>(null);
  const [isBuying, setIsBuying] = useState(false); // Track purchase loading state
  const [successMessage, setSuccessMessage] = useState<string | null>(null); // Track success notification

  // New state for user messages (similar to Home.tsx)
  const [userMessage, setUserMessage] = useState<string | null>(null);

  // Function to show a temporary message (similar to Home.tsx)
  const showUserMessage = useCallback((message: string, duration = 3000) => {
    setUserMessage(message);
    const timer = setTimeout(() => {
      setUserMessage(null);
    }, duration);
    return () => clearTimeout(timer); // Cleanup function for useEffect
  }, []);

  // Expose fetchNFTs to parent
  useEffect(() => {
    setMarketplaceRefreshFunction(() => fetchNFTs);
  }, [fetchNFTs, setMarketplaceRefreshFunction]);

  // Refresh on external trigger
  useEffect(() => {
    fetchNFTs();
  }, [onNFTAction, fetchNFTs]);

  // Clear success message after 5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Helper to batch on-chain reads
  const verifyOnChainState = async (tokenId: number) => {
    if (!connectedProvider) throw new Error("Provider not available");
    const readC = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, connectedProvider);
    const [owner, forSale, price] = await Promise.all([
      readC.ownerOf(tokenId),
      readC.isForSale(tokenId),
      readC.tokenPrices(tokenId),
    ]);
    return { owner, forSale, onChainPrice: price as bigint };
  };

  const handleBuyNFT = async (nft: NFTItem) => {
    if (!signer || !walletAddress) {
      // Changed from alert() to showUserMessage()
      showUserMessage("You must connect your wallet to purchase an NFT.", 4000);
      return;
    }

    setIsBuying(true);
    try {
      const tokenId = Number(nft.tokenId);
      const { owner, forSale, onChainPrice } = await verifyOnChainState(tokenId);

      console.log("Buy NFT Check:", { owner, walletAddress, tokenId }); // Debug log

      if (owner.toLowerCase() === walletAddress.toLowerCase()) {
        // Changed from alert() to showUserMessage()
        showUserMessage("You cannot buy your own NFT!", 4000);
        return;
      }
      if (!forSale) {
        // Changed from alert() to showUserMessage()
        showUserMessage("This NFT is no longer for sale.", 4000);
        return;
      }

      const priceInWei = ethers.parseEther(nft.price);
      if (priceInWei < onChainPrice) {
        // Changed from alert() to showUserMessage()
        showUserMessage("The price has changed. Please refresh the page and try again.", 4000);
        return;
      }

      const balance: bigint = await signer.provider!.getBalance(walletAddress);
      if (balance < onChainPrice) {
        // Changed from alert() to showUserMessage()
        showUserMessage("Insufficient balance.", 4000);
        return;
      }

      const writeC = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      await writeC.buyNFT.estimateGas(tokenId, { value: onChainPrice });
      const tx = await writeC.buyNFT(tokenId, { value: onChainPrice });
      await tx.wait();

      setSuccessMessage(`Successfully purchased NFT #${tokenId}!`);
      onNFTAction(); // Trigger global refresh
      setSelectedNFT(null); // Close Info view
    } catch (e: any) {
      console.error("Error during purchase:", e);
      // Changed from alert() to showUserMessage()
      showUserMessage("Error during purchase. Please try again later.", 4000);
    } finally {
      setIsBuying(false);
    }
  };

  return (
    <div className="max-w-full mx-auto px-6 py-12">
      <h2 className="text-3xl font-bold text-center mb-8 text-white">NFTs for Sale</h2>

      {/* User message component (similar to Home.tsx) */}
      {userMessage && (
        <div className="fixed top-20 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in-out">
          <p className="text-lg font-semibold">{userMessage}</p>
        </div>
      )}

      {/* Success notification - kept as is for now, could be integrated with userMessage */}
      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center">
          <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          {successMessage}
        </div>
      )}

      {loading ? ( // Modified loading state display
        <div className="flex flex-col items-center justify-center py-8">
          <div
            className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"
            role="status"
          >
            <span className="sr-only">Loading...</span>
          </div>
          <p className="text-center text-gray-400 mt-4">Loading NFTs...</p>
        </div>
      ) : error ? ( // Error display
        <p className="text-center text-red-500">Error: Failed to load NFTs. Please try again later.</p>
      ) : nfts.filter(nft => nft.isForSale).length === 0 ? ( // No NFTs display
        <p className="text-center text-white">No NFTs for sale at the moment.</p>
      ) : ( // NFTs list display
        !selectedNFT && ( // Only show grid if no NFT is selected
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {nfts
              .filter((nft) => nft.isForSale)
              .map((nft) => (
                <div key={nft.tokenId} className="bg-white shadow-lg rounded-lg flex flex-col transform transition duration-200 hover:scale-105">
                  <div className="p-4 flex-1">
                    <h3 className="text-lg font-semibold text-gray-800">
                      {nft.name} {/* e.g. "City NFT #6" */}
                    </h3>
                    <div className="h-32 w-full overflow-hidden rounded bg-gray-200">
                      <img
                        src={CITY_IMAGES[nft.city] || "/images/default.jpg"}
                        alt={nft.city}
                        className="object-cover h-full w-full"
                        loading="lazy"
                      />
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      City: {nft.city}
                    </p>
                    <p className="text-gray-800 font-bold mt-2">Price: {nft.price} ETH</p>
                  </div>
                  <div className="p-4 border-t flex space-x-4">
                    <button
                      onClick={() => handleBuyNFT(nft)}
                      className={`flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-500 ${isBuying ? "opacity-50 cursor-not-allowed" : ""}`}
                      disabled={isBuying}
                    >
                      {isBuying ? "Buying..." : "Buy"}
                    </button>
                    <button
                      onClick={() => setSelectedNFT(nft)}
                      className="flex-1 bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300"
                      disabled={isBuying}
                    >
                      Show Info
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )
      )}

      {selectedNFT && (
        <div className="mt-12">
          <Info
            nft={selectedNFT}
            setSelectedNFT={setSelectedNFT}
            onBookClick={(price: number, recipient: string) =>
              handleBuyNFT({
                ...selectedNFT,
                owner: recipient,
                price: price.toString(),
              } as NFTItem)
            }
            isForSale={selectedNFT.isForSale}
            isOwnedByUser={walletAddress ? selectedNFT.owner.toLowerCase() === walletAddress.toLowerCase() : false}
            isBuying={isBuying}
          />
        </div>
      )}
    </div>
  );
};

export default MarketPlace;