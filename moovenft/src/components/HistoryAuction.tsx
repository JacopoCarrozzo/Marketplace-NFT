import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI, CITY_IMAGES } from "../constant/contract";
import { useWalletContext } from "../context/WalletContext";

interface HistoricalAuctionItem {
  tokenId: number;
  endTime: number;
  highestBid: string;
  highestBidder: string;
  isEnded: boolean;
  name: string;
  city: string;
  imageUrl: string;
}

const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";

const HistoryAuction: React.FC = () => {
  const { provider, signer, walletConnected, correctChain, balanceInfo } = useWalletContext();
  const account: string = balanceInfo.address ?? "";
  const [auctions, setAuctions] = useState<HistoricalAuctionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [owner, setOwner] = useState<string>("");

  const fetchAuctions = async () => {
    if (!provider || !account) return;
    setLoading(true);
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      setOwner((await contract.owner()).toLowerCase());
      const total = Number(await contract.totalMinted());
      const now = Math.floor(Date.now() / 1000);
      const list: HistoricalAuctionItem[] = [];

      for (let id = 1; id <= total; id++) {
        let a;
        try { a = await contract.auctions(id); } catch { continue; }
        const end = Number(a.endTime);
        if (end === 0 || end > now) continue;

        let name = `NFT #${id}`, city = "unknown", img = CITY_IMAGES["Unknown"];
        try {
          const [n, , c] = await contract.getTokenMetadata(id);
          name = n || name;
          const lc = c.toLowerCase().trim();
          city = lc || city;
          img = CITY_IMAGES[capitalize(lc)] || img;
        } catch {}

        list.push({
          tokenId: id,
          endTime: end,
          highestBid: ethers.formatEther(a.highestBid as bigint),
          highestBidder: a.highestBidder,
          isEnded: a.ended,
          name,
          city,
          imageUrl: img,
        });
      }

      setAuctions(list.sort((a, b) => a.tokenId - b.tokenId));
    } catch (e: any) {
      console.error("Error fetching auctions:", e.message);
      setLoading(false);
      setAuctions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (provider && walletConnected && correctChain && account) {
      fetchAuctions();
    }
  }, [provider, walletConnected, correctChain, account]);

  const finalize = async (id: number, bidder: string) => {
    if (!signer) {
      alert("You must connect your wallet to finalize the auction.");
      return;
    }
    const isOwner = owner === account.toLowerCase();
    const isWinner = bidder.toLowerCase() === account.toLowerCase();
    if (!isOwner && !isWinner) {
      alert("Only the auction winner or contract owner can finalize this auction.");
      return;
    }
    try {
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      await (await c.finalizeAuction(id)).wait();
      alert("Auction finalized successfully!");
      fetchAuctions();
    } catch (e: any) {
      console.error("Error finalizing auction:", e);
      alert("Error finalizing auction. Please try again later.");
    }
  };

  const withdraw = async (id: number) => {
    if (!signer) {
      alert("You must connect your wallet to withdraw a refund.");
      return;
    }
    try {
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      await (await c.withdrawRefund(id)).wait();
      alert("Refund withdrawn successfully!");
      fetchAuctions();
    } catch (e: any) {
      console.error("Error withdrawing refund:", e);
      alert("Error withdrawing refund. Please try again later.");
    }
  };

  if (!walletConnected) return <p>Connect your wallet</p>;
  if (!correctChain) return <p>Wrong chain</p>;

  return (
    <div className="grid gap-4 p-6">
      {loading && <p>Loading...</p>}
      {auctions.length === 0 && !loading && (
        <p>No closed auctions found.</p>
      )}
      {auctions.map((item) => {
        const expired = item.endTime * 1000 < Date.now();
        const canFinalize = expired && !item.isEnded &&
          (item.highestBidder.toLowerCase() === account.toLowerCase() || owner === account.toLowerCase());
        const canWithdraw = item.isEnded && item.highestBidder.toLowerCase() !== account.toLowerCase();

        return (
          <div key={item.tokenId} className="p-4 bg-white rounded shadow">
            <h3>{item.name} ({capitalize(item.city)})</h3>
            <p>Bid: {item.highestBid} ETH</p>
            <p>Winner: {item.highestBidder || "None"}</p>
            <p>Ended on: {new Date(item.endTime * 1000).toLocaleString()}</p>
            <div className="mt-2 space-x-2">
              {canFinalize && (
                <button
                  onClick={() => finalize(item.tokenId, item.highestBidder)}
                  className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-500"
                >
                  Finalize
                </button>
              )}
              {canWithdraw && (
                <button
                  onClick={() => withdraw(item.tokenId)}
                  className="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-500"
                >
                  Withdraw Refund
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HistoryAuction;