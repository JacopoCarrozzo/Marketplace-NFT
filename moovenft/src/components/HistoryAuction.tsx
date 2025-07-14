import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers, formatEther, parseEther, ZeroAddress, type EventLog } from 'ethers';
import { useWalletContext } from '../context/WalletContext';
import { CONTRACT_ADDRESS, CONTRACT_ABI, CITY_IMAGES } from '../constant/contract';

interface Auction {
  tokenId: string;
  name: string;
  city: string;
  imageUrl: string;
  seller: string;
  highestBid: string;
  highestBidder: string;
  auctionEndTime: number;
  status: 'Active' | 'Ended' | 'Finalized';
  winner?: string;
}

const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
const abbreviateAddress = (address: string) => address && address !== ZeroAddress ? `${address.slice(0, 6)}...${address.slice(-4)}` : "None";

const HistoryAuction: React.FC = () => {
  const { provider, signer, walletConnected, correctChain, balanceInfo } = useWalletContext();
  const account = useMemo(() => balanceInfo?.address?.toLowerCase(), [balanceInfo?.address]);

  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [bidAmounts, setBidAmounts] = useState<{ [tokenId: string]: string }>({});
  const [contractOwner, setContractOwner] = useState<string>('');

  const contract = useMemo(() => {
    if (!provider) return null;
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer || provider);
  }, [provider, signer]);

  const fetchAllAuctions = useCallback(async () => {
    if (!contract || !provider) return;
    if (auctions.length === 0) { setLoading(true); }
    setError(null);
    try {
      const now = Math.floor(Date.now() / 1000);
      const fetchedAuctions = new Map<string, Auction>();
      const eventFilter = contract.filters.AuctionEnded();
      const logs = await contract.queryFilter(eventFilter) as EventLog[];
      for (const log of logs) {
        const { tokenId, winner, amount, originalSeller, auctionEndTime } = log.args;
        const safeSeller = (originalSeller || ZeroAddress).toLowerCase();
        const safeWinner = (winner || ZeroAddress).toLowerCase();
        const tokenIdStr = tokenId.toString();
        const metadata = await contract.getTokenMetadata(tokenId);
        fetchedAuctions.set(tokenIdStr, {
          tokenId: tokenIdStr, name: metadata.city, city: metadata.city,
          imageUrl: CITY_IMAGES[capitalize(metadata.city)] || CITY_IMAGES['Unknown'],
          seller: safeSeller, highestBid: formatEther(amount), highestBidder: safeWinner,
          auctionEndTime: Number(auctionEndTime), status: 'Finalized', winner: safeWinner,
        });
      }
      const totalMinted = await contract.totalMinted();
      for (let id = 1; id <= Number(totalMinted); id++) {
        const tokenIdStr = id.toString();
        if (fetchedAuctions.has(tokenIdStr)) continue;
        const auctionData = await contract.auctions(id);
        if (Number(auctionData.endTime) > 0) {
          const seller = await contract.auctionSellers(id);
          const metadata = await contract.getTokenMetadata(id);
          fetchedAuctions.set(tokenIdStr, {
            tokenId: tokenIdStr, name: metadata.name, city: metadata.city,
            imageUrl: CITY_IMAGES[capitalize(metadata.city)] || CITY_IMAGES['Unknown'],
            seller: (seller || ZeroAddress).toLowerCase(),
            highestBid: formatEther(auctionData.highestBid),
            highestBidder: (auctionData.highestBidder || ZeroAddress).toLowerCase(),
            auctionEndTime: Number(auctionData.endTime),
            status: Number(auctionData.endTime) > now ? 'Active' : 'Ended',
          });
        }
      }
      try {
        const owner = await contract.owner();
        setContractOwner(owner.toLowerCase());
      } catch (e) { console.warn("Could not fetch contract owner."); }
      const sortedAuctions = Array.from(fetchedAuctions.values()).sort((a, b) => b.auctionEndTime - a.auctionEndTime);
      setAuctions(sortedAuctions);
    } catch (err: any) {
      console.error("Failed to fetch auctions:", err);
      setError("An error occurred while fetching auction data. Please refresh the page.");
    } finally { setLoading(false); }
  }, [contract, provider, auctions.length]);

  useEffect(() => {
    if (walletConnected && correctChain) {
      fetchAllAuctions();
      const interval = setInterval(fetchAllAuctions, 30000);
      return () => clearInterval(interval);
    }
  }, [walletConnected, correctChain, fetchAllAuctions]);

    const handleBid = async (tokenId: string) => {
        if (!contract || !signer) return alert('Please connect your wallet.');
        const bidAmount = bidAmounts[tokenId];
        if (!bidAmount || isNaN(Number(bidAmount)) || Number(bidAmount) <= 0) { return alert('Please enter a valid bid amount.'); }
        try {
          setLoading(true);
          const tx = await contract.bid(tokenId, { value: parseEther(bidAmount) });
          await tx.wait();
          alert('Bid placed successfully!');
          setBidAmounts(prev => ({ ...prev, [tokenId]: '' }));
          await fetchAllAuctions();
        } catch (err: any) {
          console.error("Bid failed:", err);
          alert(`Error placing bid: ${err.reason || err.message}`);
        } finally { setLoading(false); }
      };
    
      const handleFinalize = async (tokenId: string) => {
        if (!contract || !signer) return alert('Please connect your wallet.');
        try {
          setLoading(true);
          const tx = await contract.finalizeAuction(tokenId);
          await tx.wait();
          alert('Auction finalized successfully!');
          await fetchAllAuctions();
        } catch (err: any) {
          console.error("Finalize failed:", err);
          alert(`Error finalizing auction: ${err.reason || err.message}`);
        } finally { setLoading(false); }
      };
      
      const handleWithdraw = async (tokenId: string) => {
        if (!contract || !signer) return alert('Please connect your wallet.');
        try {
            setLoading(true);
            const tx = await contract.withdrawRefund(tokenId);
            await tx.wait();
            alert("Refund withdrawn successfully!");
            await fetchAllAuctions();
        } catch(err: any) {
            console.error("Withdraw failed:", err);
            alert(`Error withdrawing refund: ${err.reason || err.message}`);
        } finally { setLoading(false); }
      };
      
      // NUOVA LOGICA per la renderizzazione dei pulsanti
      const renderCardActions = (auction: Auction) => {
        const isMyAuction = auction.seller === account;
        const amIHighestBidder = auction.highestBidder === account;
    
        switch (auction.status) {
          case 'Active':
            return (
              <div className="flex space-x-2">
                <input type="text" value={bidAmounts[auction.tokenId] || ''} onChange={e => setBidAmounts(prev => ({ ...prev, [auction.tokenId]: e.target.value }))} placeholder={`> ${auction.highestBid} ETH`} className="w-full px-2 py-1 border rounded" disabled={loading} />
                <button onClick={() => handleBid(auction.tokenId)} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition">Bid</button>
              </div>
            );
          case 'Ended': {
            const isEligibleToFinalize = amIHighestBidder || isMyAuction || contractOwner === account;
            const isEligibleToWithdraw = !amIHighestBidder && auction.highestBidder !== ZeroAddress;

            if (!isEligibleToFinalize && !isEligibleToWithdraw) {
                return <p className="text-sm text-center text-gray-500">Auction has ended. Waiting for action...</p>;
            }

            return (
              <div className="space-y-2">
                {isEligibleToFinalize && (
                  <button onClick={() => handleFinalize(auction.tokenId)} disabled={loading} className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-500 transition">
                    Finalize Auction
                  </button>
                )}
                {isEligibleToWithdraw && (
                  <button onClick={() => handleWithdraw(auction.tokenId)} disabled={loading} className="w-full bg-yellow-500 text-black py-2 rounded hover:bg-yellow-400 transition">
                    Withdraw Refund
                  </button>
                )}
              </div>
            );
          }
          case 'Finalized':
            return <p className="text-sm text-center text-green-700 font-bold">Auction Completed</p>;
          default:
            return null;
        }
      };
    
    if (!walletConnected) return <div className="text-center p-6 text-white text-lg">Please connect your wallet to view auctions.</div>;
    if (!correctChain) return <div className="text-center p-6 text-red-500 text-lg">Please connect to the Sepolia network.</div>;
    
    return (
      <div className="max-w-screen-xl mx-auto px-4 py-8">
        <h2 className="text-3xl font-bold text-center mb-8 text-white">Auction House</h2>

        {loading && auctions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" role="status">
              <span className="sr-only">Loading...</span>
            </div>
            <p className="text-center text-gray-400 mt-4">Loading auctions...</p>
          </div>
        ) : error ? (
          <div className="bg-red-100 text-red-800 p-4 rounded-lg m-5 text-center">{error}</div>
        ) : auctions.length === 0 ? (
          <p className="text-center text-white text-lg">No auctions found.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {auctions.map(auction => (
              <div key={auction.tokenId} className="bg-white shadow-lg rounded-lg overflow-hidden flex flex-col transform transition duration-300 hover:scale-105">
                <img src={auction.imageUrl} alt={auction.name} className="h-48 w-full object-cover"/>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="text-lg font-semibold text-gray-800">{auction.name}</h3>
                  <p className="text-gray-600 text-sm">City: {capitalize(auction.city)}</p>
                  <div className="my-2">
                    <p className="text-gray-800 font-bold text-xl">{auction.highestBid} ETH</p>
                    <p className="text-gray-600 text-sm">{auction.status === 'Finalized' ? 'Winning Bid' : 'Highest Bid'}</p>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                     <p>{auction.status === 'Finalized' ? 'Winner: ' : 'Highest Bidder: '}<span className="font-mono">{abbreviateAddress(auction.highestBidder)}</span></p>
                     
                  </div>
                  <div className="mt-auto pt-4">{renderCardActions(auction)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
};

export default HistoryAuction;