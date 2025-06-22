// src/hooks/useHistoricalAuctions.ts
import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI, CITY_IMAGES } from "../constant/contract";
import { capitalizeFirstLetter } from "../utils/string";

export interface HistoricalAuctionItem {
  tokenId: number;
  startTime: number;
  endTime: number;
  highestBid: string;
  highestBidder: string;
  isEnded: boolean;
  name: string;
  city: string;
  imageUrl: string;
}

export function useHistoricalAuctions(
  provider: ethers.Provider | null,
  currentAccount: string | null
) {
  const [auctions, setAuctions] = useState<HistoricalAuctionItem[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [contractOwner, setOwner] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!provider || !currentAccount) return;
    setLoading(true);
    setError(null);

    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const [ownerAddr, totalMintedBN] = await Promise.all([
        contract.owner().catch(() => null),
        contract.totalMinted()
      ]);
      if (ownerAddr) setOwner(ownerAddr.toLowerCase());

      const totalMinted = Number(totalMintedBN);
      const nowSec = Math.floor(Date.now() / 1000);
      const list: HistoricalAuctionItem[] = [];

      for (let tokenId = 1; tokenId <= totalMinted; tokenId++) {
        let auctionOnChain;
        try {
          auctionOnChain = await contract.auctions(tokenId);
        } catch {
          // mapping non definito, skip
          continue;
        }

        const startTime  = Number(auctionOnChain.startTime);
        const endTime    = Number(auctionOnChain.endTime);
        const isEnded    = Boolean(auctionOnChain.ended);
        const highestBid = ethers.formatEther(auctionOnChain.highestBid as bigint);
        const highestBidder = auctionOnChain.highestBidder as string;

        // se non è scaduta o non valida, skip
        if (endTime === 0 || endTime > nowSec) continue;

        // recupera metadata in try/catch
        let name = `NFT #${tokenId}`, city = "sconosciuta", imageUrl = CITY_IMAGES["Sconosciuta"];
        try {
          const [mName, , mCity] = await contract.getTokenMetadata(tokenId);
          name = mName || name;
          const lcCity = mCity.toLowerCase().trim();
          city = lcCity || city;
          imageUrl = CITY_IMAGES[capitalizeFirstLetter(lcCity)] || imageUrl;
        } catch {
          // mantieni fallback
        }

        list.push({ tokenId, startTime, endTime, isEnded, highestBid, highestBidder, name, city, imageUrl });
      }

      list.sort((a,b) => a.tokenId - b.tokenId);
      setAuctions(list);
    } catch (e: any) {
      console.error(e);
      setError("Errore nel caricamento delle aste storiche.");
    } finally {
      setLoading(false);
    }
  }, [provider, currentAccount]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { auctions, loading, error, contractOwner, refetch: fetch };
}
