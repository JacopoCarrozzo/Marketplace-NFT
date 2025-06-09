import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../constant/contract";
import { CITY_IMAGES } from "../constant/contract";

export interface NFTItem {
  tokenId: number;
  name: string;
  description: string;
  city: string;
  price: string;
  owner: string;
  isForSale: boolean;
  imageUrl: string;
}

export const useMarketNFTs = (
  connectedProvider: ethers.BrowserProvider | ethers.JsonRpcProvider | null
) => {
  const [items, setItems] = useState<NFTItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNFTs = useCallback(async () => {
    if (!connectedProvider) {
      setError("Provider non connesso.");
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        connectedProvider
      );

      // Ottieni il numero totale di token coniati
      const totalMintedBN = await contract.totalMinted();
      const totalMinted = Number(totalMintedBN);

      const fetchedNFTs: NFTItem[] = [];

      for (let i = 1; i <= totalMinted; i++) {
  const tokenId = i;
  try {
    const owner = await contract.ownerOf(tokenId);
    const isForSale = await contract.isForSale(tokenId);
    const priceWei = await contract.tokenPrices(tokenId);
    const tokenUri = await contract.tokenURI(tokenId);

    // Log del tokenURI grezzo
    console.log(`Token ID ${tokenId} - tokenURI:`, tokenUri);

    // Valori di fallback
    let name = `NFT #${tokenId}`;
    let description = "Sconosciuta";
    let city = "Sconosciuta";
    let imageUrl = "";

    // Parsa il tokenURI se è base64 JSON
    if (tokenUri && tokenUri.startsWith("data:application/json;base64,")) {
      try {
        const base64Json = tokenUri.replace("data:application/json;base64,", "");
        const decodedJson = atob(base64Json);
        console.log(`Token ID ${tokenId} - Decoded JSON:`, decodedJson);
        const metadata = JSON.parse(decodedJson);

        name = metadata.name || name;
        description = metadata.description || description;
        city = metadata.city || metadata.City || city;
        console.log(`Token ID ${tokenId} - Parsed Metadata:`, { name, description, city });
        imageUrl = CITY_IMAGES[city] || "";
      } catch (uriError) {
        console.warn(`Errore nel parsing di tokenURI per tokenId ${tokenId}:`, uriError);
      }
    } else {
      console.warn(`Token ID ${tokenId} - tokenURI non è base64 o non presente.`);
    }

    fetchedNFTs.push({
      tokenId,
      name,
      description,
      city,
      price: ethers.formatEther(priceWei),
      owner,
      isForSale,
      imageUrl,
    });
  } catch (tokenError) {
    console.warn(`Errore per tokenId ${tokenId}:`, tokenError);
    continue;
  }
}

      setItems(fetchedNFTs);
    } catch (e: any) {
      console.error("Errore nel recupero degli NFT:", e);
      setError(`Errore nel caricamento degli NFT: ${e.message}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [connectedProvider]);

  useEffect(() => {
    fetchNFTs();
  }, [fetchNFTs]);

  return { items, loading, error, fetchNFTs };
};