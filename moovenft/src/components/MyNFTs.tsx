import React, { useEffect, useState, useCallback } from "react";
import { useMarketNFTs, NFTItem } from "../hooks/useMarketNFTs";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI, CITY_IMAGES } from "../constant/contract";
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

  // New state for user messages (consistent with Home/Marketplace)
  const [userMessage, setUserMessage] = useState<string | null>(null);

  // Function to show a temporary message
  const showUserMessage = useCallback((message: string, duration = 3000) => {
    setUserMessage(message);
    const timer = setTimeout(() => {
      setUserMessage(null);
    }, duration);
    return () => clearTimeout(timer); // Cleanup function for useEffect
  }, []);

  // Pass the refresh function to Home
  useEffect(() => {
    setMarketplaceRefreshFunction(() => fetchNFTs);
  }, [fetchNFTs, setMarketplaceRefreshFunction]);

  // Refresh the NFT list when onNFTAction changes
  useEffect(() => {
    onNFTAction();
  }, [onNFTAction, fetchNFTs]);

  // Additional logs to verify owners directly from the contract
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
          console.log(`Token ID ${nft.tokenId} - Owner from contract:`, owner);
        } catch (err) {
          console.error(`Error fetching owner for tokenId ${nft.tokenId}:`, err);
        }
      }
    };

    checkOwners();
  }, [nfts, connectedProvider]);

  // Function to list an NFT for sale
  const handleListForSale = async (nft: NFTItem, priceInEth: string) => {
    if (!signer || !walletAddress) {
      showUserMessage("You must connect your wallet to list an NFT for sale.", 4000); // Replaced alert
      return;
    }

    if (!connectedProvider) {
      showUserMessage("Provider not available to read on-chain state.", 4000); // Replaced alert
      return;
    }

    try {
      const contractRead = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        connectedProvider
      );

      // Verify that the user is the owner
      const onChainOwner = await contractRead.ownerOf(Number(nft.tokenId));
      console.log(`Token ID ${nft.tokenId} - onChainOwner:`, onChainOwner);
      if (onChainOwner.toLowerCase() !== walletAddress.toLowerCase()) {
        showUserMessage("You are not the owner of this NFT!", 4000); // Replaced alert
        return;
      }

      // Check if the NFT is already listed for sale
      const isForSaleOnChain = await contractRead.isForSale(Number(nft.tokenId));
      console.log(`Token ID ${nft.tokenId} - isForSale:`, isForSaleOnChain);
      if (isForSaleOnChain) {
        showUserMessage("This NFT is already listed for sale!", 4000); // Replaced alert
        return;
      }

      // Validate the price
      let priceInWei: bigint;
      try {
        priceInWei = ethers.parseEther(priceInEth);
        if (priceInWei <= 0) {
          showUserMessage("The price must be greater than zero.", 4000); // Replaced alert
          return;
        }
      } catch {
        showUserMessage("Invalid price. Please enter a valid number in ETH.", 4000); // Replaced alert
        return;
      }

      // Prepare the contract for writing
      const contractWrite = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer
      );

      // Gas estimation
      try {
        await contractWrite.listForSale.estimateGas(Number(nft.tokenId), priceInWei);
      } catch (gasError: any) {
        console.error(`Gas estimation error for tokenId ${nft.tokenId}:`, gasError);
        showUserMessage("Gas error: Transaction failed. Please try again later.", 4000); // Replaced alert
        return;
      }

      // Send the transaction
      console.log(`Listing NFT ${nft.tokenId} for ${priceInEth} ETH`);
      const tx = await contractWrite.listForSale(Number(nft.tokenId), priceInWei);
      console.log(`Transaction hash:`, tx.hash);
      await tx.wait();
      console.log(`Transaction confirmed for tokenId ${nft.tokenId}`);

      showUserMessage(`NFT #${nft.tokenId} successfully listed for sale!`, 4000); // Replaced alert
      onNFTAction(); // Refresh the list
      setSelectedNFT(null); // Close Info view
    } catch (e: any) {
      console.error(`Error listing NFT ${nft.tokenId}:`, e);
      showUserMessage("Error listing NFT. Please try again later.", 4000); // Replaced alert
    }
  };

  // Filter only NFTs owned by the user
  const ownedNFTs = walletAddress
    ? nfts.filter(
        (nft) => nft.owner.toLowerCase() === walletAddress.toLowerCase()
      )
    : [];

  // Logs to see all NFTs and owned NFTs
  console.log("All NFTs:", nfts);
  console.log("Owned NFTs:", ownedNFTs);

  return (
    <div className="max-w-full mx-auto px-6 py-12 pt-8"> {/* Added pt-8 for consistent top spacing */}
      <h2 className="text-3xl font-bold text-center mb-8 text-white">
        My NFTs
      </h2>

      {/* User message component */}
      {userMessage && (
        <div className="fixed top-20 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in-out">
          <p className="text-lg font-semibold">{userMessage}</p>
        </div>
      )}

      {loading ? ( // Display loading spinner when loading
        <div className="flex flex-col items-center justify-center py-8">
          <div
            className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"
            role="status"
          >
            <span className="sr-only">Loading...</span>
          </div>
          <p className="text-center text-gray-400 mt-4">Loading your NFTs...</p>
        </div>
      ) : error ? ( // Display error message if there's an error
        <p className="text-center text-red-500 text-lg">Error: Failed to load NFTs. Please try again later.</p>
      ) : !walletAddress ? ( // Display message if wallet is not connected
        <p className="text-center text-white text-lg">
          Connect your wallet to view your NFTs.
        </p>
      ) : ownedNFTs.length === 0 ? ( // Display message if wallet is connected but no NFTs owned
        <p className="text-center text-white text-lg">
          You don't own any NFTs at the moment.
        </p>
      ) : ( // Display NFT grid if wallet is connected and NFTs are owned
        !selectedNFT && ( // Only show grid if no NFT is selected
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
                  <p className="text-gray-600 mt-2 text-sm">City: {nft.city}</p>
                </div>

                <div className="p-4 border-t flex space-x-4">
                  <button
                    onClick={() => setSelectedNFT(nft)}
                    className="flex-1 block text-center bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300 transition"
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
              handleListForSale(
                { ...selectedNFT, price: price.toString(), owner: recipient } as NFTItem,
                price.toString()
              )
            }
            isForSale={selectedNFT.isForSale} // Prop needed for Info component
            isOwnedByUser={walletAddress ? selectedNFT.owner.toLowerCase() === walletAddress.toLowerCase() : false}
            // You might need an `isListing` or `isAuctioning` prop for the Info component if it shows a loading state
          />
        </div>
      )}
    </div>
  );
};

export default MyNFT;