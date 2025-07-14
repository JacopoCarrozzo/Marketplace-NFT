import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../constant/contract";
import { useWalletContext } from "../context/WalletContext";
import { CITY_IMAGES } from "../constant/contract";
import { Link } from 'react-router-dom';

import historyIcon from '../assets/images/cronologia.png'; 

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
  imageUrl: string;
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
  const { provider, signer, walletConnected, correctChain, balanceInfo } =
    useWalletContext();
  const walletAddress = balanceInfo.address?.toLowerCase() ?? "";
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bidAmounts, setBidAmounts] = useState<{ [key: number]: string }>({});
  const [bidErrors, setBidErrors] = useState<{ [key: number]: string | null }>({});
  const [placingBidTokenId, setPlacingBidTokenId] = useState<number | null>(null);

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
          let city = "unknown";
          let imageUrl = ""; 

          try {
            const [metadataName, description, metadataCity] =
              await contract.getTokenMetadata(tokenId);
            name = metadataName || name;
            const lowerCaseCity = metadataCity.toLowerCase().trim();
            city = lowerCaseCity || "unknown"; 
            
            const cityKeyForImage = capitalizeFirstLetter(lowerCaseCity); 
            imageUrl = CITY_IMAGES[cityKeyForImage] || CITY_IMAGES["Unknown"] || "";

            console.log(
              `Raw City: ${metadataCity}, LowerCase City: ${lowerCaseCity}, Key for Image: ${cityKeyForImage}, Image URL: ${imageUrl}`
            );
          } catch (metadataError: any) {
            console.error(
              `Error fetching metadata for tokenId ${tokenId}:`,
              metadataError.message
            );
            imageUrl = CITY_IMAGES["Unknown"] || "";
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
      console.error("Error in fetchAuctions:", e);
      setError("Failed to load auctions. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (provider) {
      fetchAuctions();
    }
  }, [provider]);

  useEffect(() => {
    setAuctionRefreshFunction(() => fetchAuctions);
  }, [setAuctionRefreshFunction, fetchAuctions]);

  useEffect(() => {
    const interval = setInterval(() => {
      setAuctions((prev) => prev.map((a) => ({ ...a })));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const validateBid = (tokenId: number, bidAmount: string, currentHighestBid: string) => {
    if (!bidAmount || isNaN(Number(bidAmount)) || Number(bidAmount) <= 0) {
      return "Please enter a valid bid amount (greater than zero).";
    }
    const bidInEth = Number(bidAmount);
    const currentBidInEth = Number(currentHighestBid);
    if (bidInEth <= currentBidInEth) {
      return "Your bid must be higher than the current bid.";
    }
    return null;
  };

  const handleBidInputChange = (tokenId: number, value: string, currentHighestBid: string) => {
    setBidAmounts((prev) => ({
      ...prev,
      [tokenId]: value,
    }));
    const error = validateBid(tokenId, value, currentHighestBid);
    setBidErrors((prev) => ({
      ...prev,
      [tokenId]: error,
    }));
  };

  const handleBid = async (tokenId: number, bidAmount: string) => {
    if (!signer || !walletConnected) {
      alert("You must connect your wallet to place a bid.");
      return;
    }
    if (!correctChain) {
      alert("Please connect to the Sepolia network (Chain ID: 11155111) to place a bid.");
      return;
    }

    setPlacingBidTokenId(tokenId);
    try {
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer
      );

      const auction = await contract.auctions(tokenId);
      const currentHighestBidWei: bigint = auction.highestBid as bigint;
      const bidInWei = ethers.parseEther(bidAmount);

      if (bidInWei <= currentHighestBidWei) {
        alert("Your bid must be higher than the current highest bid.");
        return;
      }
      const tokenOwner = await contract.ownerOf(tokenId);
      if (tokenOwner.toLowerCase() === walletAddress.toLowerCase()) {
        alert("You cannot bid on your own auction.");
        return;
      }

      console.log(`Sending bid for tokenId ${tokenId} with value ${bidAmount} ETH`);
      const tx = await contract.bid(tokenId, { value: bidInWei });
      console.log(`Transaction hash: ${tx.hash}`);
      await tx.wait();
      console.log("Transaction confirmed.");

      alert("Bid placed successfully!");
      fetchAuctions();
      onNFTAction();
      setBidAmounts((prev) => {
        const newAmounts = { ...prev };
        delete newAmounts[tokenId];
        return newAmounts;
      });
      setBidErrors((prev) => ({
        ...prev,
        [tokenId]: null,
      }));
    } catch (e: any) {
      console.error("Error placing bid:", e);
      alert("Error placing bid. Please try again later.");
    } finally {
      setPlacingBidTokenId(null);
    }
  };

  if (!walletConnected)
    return (
      <div className="p-6 text-center text-white pt-8">
        Connect your wallet to view auctions.
      </div>
    );
  if (!correctChain)
    return (
      <div className="p-6 text-center text-red-500 pt-8">
        Please connect to the Sepolia network (Chain ID: 11155111).
      </div>
    );

  return (
    <div className="relative max-w-full mx-auto px-4 py-12 pt-8">
      <div className="absolute top-4 left-4 z-10">
        <Link to="/auction-history" className="text-blue-600 hover:text-blue-800 flex items-center space-x-2">
          <img src={historyIcon} alt="History" className="w-5 h-5 filter invert" />
          <span className="text-md font-semibold text-white">Closed Auctions</span>
        </Link>
      </div>

      <h2 className="text-3xl font-bold text-center mb-8 text-white mt-12">
        Active Auctions
      </h2>
      
      {loading ? (
        <div className="flex flex-col items-center justify-center py-8">
          <div
            className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"
            role="status"
          >
            <span className="sr-only">Loading...</span>
          </div>
          <p className="text-center text-gray-400 mt-4">Loading auctions...</p>
        </div>
      ) : error ? (
        <p className="text-center text-red-500 text-lg">{error}</p>
      ) : auctions.length === 0 ? (
        <p className="text-center text-white text-lg">No active auctions.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {auctions.map((item) => {
            const now = Math.floor(Date.now() / 1000);
            const countdownSeconds = Math.max(item.endTime - now, 0);

            // Calcolo del tempo rimanente in giorni, ore, minuti, secondi
            const days = Math.floor(countdownSeconds / (24 * 3600));
            const hours = Math.floor((countdownSeconds % (24 * 3600)) / 3600);
            const minutes = Math.floor((countdownSeconds % 3600) / 60);
            const seconds = countdownSeconds % 60;

            // Formato leggibile
            const timeRemaining = countdownSeconds > 0
              ? days > 0
                ? `${days}d ${hours}h ${minutes}m`
                : `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
              : "Ended";

            const isMyBid = item.highestBidder.toLowerCase() === walletAddress && Number(item.highestBid) > 0;
            const bidError = bidErrors[item.tokenId];

            return (
              <div
                key={item.tokenId}
                className={`bg-white shadow-lg rounded-lg overflow-hidden flex flex-col transform transition duration-200 hover:scale-105 ${
                  isMyBid ? "border-2 border-green-500" : ""
                }`}
              >
                <div className="p-4 flex-1 flex flex-col">
                  <div className="relative">
                    <h3 className="text-lg font-semibold text-gray-800">
                      {item.name} ({item.city})
                    </h3>
                    {isMyBid && (
                      <span className="absolute top-0 right-0 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded-bl">
                        Your Bid
                      </span>
                    )}
                  </div>
                  <div className="h-32 w-full overflow-hidden rounded mt-2 bg-gray-200">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.city}
                        className="object-cover h-full w-full"
                      />
                    ) : (
                      <span className="text-gray-500 text-sm p-2">
                        Image not available
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600 mt-2 text-sm">City: {item.city}</p>
                  <p className="text-gray-600 mt-2 text-sm">
                    Current bid: {item.highestBid} ETH
                  </p>
                  <p className="text-gray-600 mt-1 text-xs">
                    Time remaining: {timeRemaining}
                  </p>
                  <div className="mt-4">
                    <input
                      type="number"
                      step="0.0001"
                      placeholder="Bid amount (ETH)"
                      className={`w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500 text-gray-900 ${
                        bidError ? "border-red-500" : "border-gray-300"
                      }`}
                      value={bidAmounts[item.tokenId] || ""}
                      onChange={(e) =>
                        handleBidInputChange(item.tokenId, e.target.value, item.highestBid)
                      }
                      disabled={countdownSeconds <= 0}
                    />
                    {bidError && (
                      <p className="text-red-500 text-xs mt-1">{bidError}</p>
                    )}
                  </div>
                </div>
                <div className="p-4 border-t">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleBid(item.tokenId, bidAmounts[item.tokenId] || "");
                    }}
                    className={`w-full py-2 rounded transition ${
                      placingBidTokenId === item.tokenId || countdownSeconds <= 0 || bidError
                        ? "bg-green-600 cursor-not-allowed"
                        : "bg-green-600 text-white hover:bg-green-500"
                    }`}
                    disabled={placingBidTokenId !== null || countdownSeconds <= 0 || !!bidError}
                  >
                    {placingBidTokenId === item.tokenId ? (
                      <span className="flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                        Placing bid...
                      </span>
                    ) : (
                      "Place Bid"
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AuctionPlace;