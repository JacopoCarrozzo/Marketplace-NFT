import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { useMarketNFTs, NFTItem } from "../hooks/useMarketNFTs";
import { CONTRACT_ADDRESS, CONTRACT_ABI, CITY_IMAGES } from "../constant/contract";
import Info from "./Info";

interface MarketPlaceProps {
  connectedProvider: ethers.BrowserProvider | ethers.JsonRpcProvider | null;
  walletAddress: string | null;
  signer: ethers.Signer | null;
  onNFTAction: () => void;
  setMarketplaceRefreshFunction: React.Dispatch<React.SetStateAction<(() => void) | null>>;
  listedTokenIds: number[];
}

const MarketPlace: React.FC<MarketPlaceProps> = ({
  connectedProvider,
  walletAddress,
  signer,
  onNFTAction,
  setMarketplaceRefreshFunction,
  listedTokenIds,
}) => {
  const { items: nfts, loading, error, fetchNFTs } = useMarketNFTs(connectedProvider);
  const [selectedNFT, setSelectedNFT] = useState<NFTItem | null>(null);
  const [buyingPendingTokenId, setBuyingPendingTokenId] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [userMessage, setUserMessage] = useState<string | null>(null);
  const [isOwnerMap, setIsOwnerMap] = useState<Record<number, boolean>>({});
  const [onChainListedTokenIds, setOnChainListedTokenIds] = useState<number[]>([]);

  const showUserMessage = useCallback((message: string, type: 'success' | 'error' | 'warning' = 'error', duration = 3000) => {
    setUserMessage(message);
    const timer = setTimeout(() => {
      setUserMessage(null);
    }, duration);
    return () => clearTimeout(timer);
  }, []);

  // Funzione per recuperare i tokenId messi in vendita dall'utente
  const fetchListedTokenIds = useCallback(async () => {
    if (!connectedProvider || !walletAddress) return;
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, connectedProvider);
      const totalMinted = await contract.totalMinted();
      const listedTokens: number[] = [];
      // Controlla ogni tokenId fino a totalMinted
      for (let i = 1; i <= totalMinted; i++) {
        try {
          const seller = await contract.sellers(i);
          if (seller.toLowerCase() === walletAddress.toLowerCase()) {
            listedTokens.push(i);
          }
        } catch (e) {
          // Ignora gli errori per i tokenId non validi
          continue;
        }
      }
      setOnChainListedTokenIds(listedTokens);
      // Sincronizza con localStorage
      const saved = localStorage.getItem("listedTokenIds");
      const localListed = saved ? JSON.parse(saved) : [];
      const combinedListed = [...new Set([...localListed, ...listedTokens])];
      localStorage.setItem("listedTokenIds", JSON.stringify(combinedListed));
    } catch (e) {
      console.error("Error fetching listed tokenIds:", e);
    }
  }, [connectedProvider, walletAddress]);

  useEffect(() => {
    setMarketplaceRefreshFunction(() => fetchNFTs);
  }, [fetchNFTs, setMarketplaceRefreshFunction]);

  useEffect(() => {
    fetchNFTs();
    fetchListedTokenIds();
  }, [fetchNFTs, fetchListedTokenIds, onNFTAction]);

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const checkOwnership = useCallback(async (tokenId: number) => {
    if (!connectedProvider || !walletAddress) return false;
    try {
      const readC = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, connectedProvider);
      const owner = await readC.ownerOf(tokenId);
      const isOwner = owner.toLowerCase() === walletAddress.toLowerCase();
      console.log(`Ownership check for tokenId ${tokenId}:`, { tokenId, owner, walletAddress, isOwner });
      return isOwner;
    } catch (e) {
      console.error(`Error checking ownership for tokenId ${tokenId}:`, e);
      return false;
    }
  }, [connectedProvider, walletAddress]);

  useEffect(() => {
    const updateOwnershipAndListed = async () => {
      if (!nfts.length || !walletAddress) return;
      const newIsOwnerMap: Record<number, boolean> = {};
      await Promise.all(nfts.map(async (nft) => {
        newIsOwnerMap[nft.tokenId] = await checkOwnership(Number(nft.tokenId));
        if (onChainListedTokenIds.includes(nft.tokenId)) {
          showUserMessage(`NFT #${nft.tokenId} is listed by you!`, 'warning', 5000);
        }
      }));
      setIsOwnerMap(newIsOwnerMap);
    };
    updateOwnershipAndListed();
  }, [nfts, walletAddress, checkOwnership, onChainListedTokenIds, showUserMessage, onNFTAction]);

  const verifyOnChainState = async (tokenId: number) => {
    if (!connectedProvider) throw new Error("Provider not available");
    const readC = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, connectedProvider);
    const [owner, forSale, price, seller] = await Promise.all([
      readC.ownerOf(tokenId),
      readC.isForSale(tokenId),
      readC.tokenPrices(tokenId),
      readC.sellers(tokenId),
    ]);
    return { owner, forSale, onChainPrice: price as bigint, seller };
  };

  const handleBuyNFT = async (nft: NFTItem) => {
    if (!signer || !walletAddress) {
      showUserMessage("You must connect your wallet to purchase an NFT.", 'error', 4000);
      return;
    }

    setBuyingPendingTokenId(nft.tokenId);
    try {
      const tokenId = Number(nft.tokenId);
      const { owner, forSale, onChainPrice, seller } = await verifyOnChainState(tokenId);

      console.log("Buy NFT Check:", {
        tokenId,
        onChainOwner: owner,
        walletAddress,
        ownerMatches: owner.toLowerCase() === walletAddress.toLowerCase(),
        forSale,
        onChainPrice: ethers.formatEther(onChainPrice),
        nftPrice: nft.price,
        nftOwner: nft.owner,
        seller,
        isListedByUser: onChainListedTokenIds.includes(tokenId),
      });

      if (owner.toLowerCase() === walletAddress.toLowerCase()) {
        showUserMessage("You are the owner of this NFT!", 'error', 4000);
        return;
      }
      if (seller.toLowerCase() === walletAddress.toLowerCase()) {
        showUserMessage("You cannot buy an NFT you listed for sale!", 'error', 4000);
        return;
      }
      if (!forSale) {
        showUserMessage("This NFT is no longer for sale.", 'error', 4000);
        return;
      }

      const priceInWei = ethers.parseEther(nft.price);
      if (priceInWei < onChainPrice) {
        showUserMessage("The price has changed. Please refresh the page and try again.", 'error', 4000);
        return;
      }

      const balance: bigint = await signer.provider!.getBalance(walletAddress);
      if (balance < onChainPrice) {
        showUserMessage("Insufficient balance.", 'error', 4000);
        return;
      }

      const writeC = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      await writeC.buyNFT.estimateGas(tokenId, { value: onChainPrice });
      const tx = await writeC.buyNFT(tokenId, { value: onChainPrice });
      await tx.wait();

      setSuccessMessage(`Successfully purchased NFT #${tokenId}!`);
      onNFTAction();
      setSelectedNFT(null);
      // Rimuovi il tokenId da listedTokenIds dopo l'acquisto
      setOnChainListedTokenIds(prev => prev.filter(id => id !== tokenId));
      localStorage.setItem("listedTokenIds", JSON.stringify(onChainListedTokenIds.filter(id => id !== tokenId)));
    } catch (e: any) {
      console.error("Error during purchase:", e);
      showUserMessage("Error during purchase. Please try again later.", 'error', 4000);
    } finally {
      setBuyingPendingTokenId(null);
    }
  };

  return (
    <div className="max-w-full mx-auto px-6 py-12">
      <h2 className="text-3xl font-bold text-center mb-8 text-white">NFTs for Sale</h2>

      {userMessage && (
        <div className={`fixed top-20 right-4 px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in-out ${
          userMessage.includes('listed by you') ? 'bg-yellow-500' : 'bg-red-500'
        }`}>
          <p className="text-lg font-semibold text-white">{userMessage}</p>
        </div>
      )}

      {successMessage && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center">
          <svg className="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
          {successMessage}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-8">
          <div
            className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"
            role="status"
          >
            <span className="sr-only">Loading...</span>
          </div>
          <p className="text-center text-gray-400 mt-4">Loading NFTs...</p>
        </div>
      ) : error ? (
        <p className="text-center text-red-500">Error: Failed to load NFTs. Please try again later.</p>
      ) : nfts.filter(nft => nft.isForSale).length === 0 ? (
        <p className="text-center text-white">No NFTs for sale at the moment.</p>
      ) : (
        !selectedNFT && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {nfts
              .filter((nft) => nft.isForSale)
              .map((nft) => {
                const isOwner = isOwnerMap[nft.tokenId] || false;
                const isListedByUser = onChainListedTokenIds.includes(nft.tokenId);
                return (
                  <div key={nft.tokenId} className="bg-white shadow-lg rounded-lg flex flex-col transform transition duration-200 hover:scale-105">
                    <div className="p-4 flex-1">
                      <h3 className="text-lg font-semibold text-gray-800">
                        {nft.name}
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
                    <div className="p-4 pb-6 border-t flex space-x-4">
                      <button
                        onClick={() => handleBuyNFT(nft)}
                        disabled={buyingPendingTokenId !== null || isOwner || isListedByUser}
                        className={`flex-1 min-h-[32px] text-center text-white py-2 rounded transition duration-300 ${
                          buyingPendingTokenId === nft.tokenId ? 'bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'
                        } ${isOwner || isListedByUser ? 'cursor-not-allowed opacity-50' : ''}`}
                        onMouseOver={() => console.log(`Button disabled for NFT ${nft.tokenId}:`, {
                          buyingPending: buyingPendingTokenId !== null,
                          isOwner,
                          isListedByUser,
                          walletAddress,
                          nftOwner: nft.owner,
                        })}
                      >
                        {buyingPendingTokenId === nft.tokenId ? (
                          <div className="flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></div>
                            <span className="text-sm">Processing...</span>
                          </div>
                        ) : (
                          "Buy"
                        )}
                      </button>
                      <button
                        onClick={() => setSelectedNFT(nft)}
                        className="flex-1 min-h-[32px] text-center bg-gray-200 text-gray-800 py-2 rounded hover:bg-gray-300"
                        disabled={buyingPendingTokenId !== null}
                      >
                        Show Info
                      </button>
                    </div>
                    {isOwner && (
                      <div className="text-center text-red-500 text-sm mt-2">
                        You are the owner of this NFT!
                      </div>
                    )}
                    {isListedByUser && (
                      <div className="text-center text-yellow-500 text-sm mt-2">
                        You have listed this NFT for sale!
                      </div>
                    )}
                  </div>
                );
              })}
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
            isBuying={buyingPendingTokenId !== null}
          />
        </div>
      )}
    </div>
  );
};

export default MarketPlace;