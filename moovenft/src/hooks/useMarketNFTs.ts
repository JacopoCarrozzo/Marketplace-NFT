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

  // Funzione helper per ottenere il nome completo della città
  const getFullCityName = (partial: string): string => {
    const possible = Object.keys(CITY_IMAGES);
    const found = possible.find((c) =>
      c.toLowerCase().startsWith(partial.toLowerCase())
    );
    return found || partial;
  };

  const fetchNFTs = useCallback(async () => {
    if (!connectedProvider) {
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

      const totalSupplyBN = await contract.totalSupply();
      const totalSupply = Number(totalSupplyBN);
      const fetchedNFTs: NFTItem[] = [];

      for (let tokenId = 1; tokenId <= totalSupply; tokenId++) {
        try {
          const owner = await contract.ownerOf(tokenId);
          const isForSale = await contract.isForSale(tokenId);
          const priceWei = await contract.tokenPrices(tokenId);

          let tokenUri: string | null = null;
          try {
            tokenUri = await contract.tokenURI(tokenId);
          } catch (uriError) {
            console.warn(`Token ID ${tokenId} - tokenURI non disponibile:`, uriError);
          }

          // Valori di fallback
          let name = `NFT #${tokenId}`;
          let description = "Sconosciuta";
          let city = "Sconosciuta";
          let imageUrl = "";

          if (tokenUri?.startsWith("data:application/json;base64,")) {
            const base64Json = tokenUri.replace("data:application/json;base64,", "");
            let decodedJson = "";
            try {
              decodedJson = atob(base64Json);
              const jsonStart = decodedJson.indexOf("{");
              if (jsonStart === -1) {
                throw new Error("JSON non trovato");
              }
              let jsonStr = decodedJson.substring(jsonStart);
              if (!jsonStr.endsWith("}")) {
                jsonStr += '"}'; // Ripara JSON incompleto
              }

              const metadata = JSON.parse(jsonStr);
              name = metadata.name || name;
              description = metadata.description || description;
              city = metadata.city || metadata.City || city;
              // Correggi il nome della città
              city = getFullCityName(city);
              imageUrl = CITY_IMAGES[city] || "";
            } catch (parseError) {
              console.warn(`Errore parsing tokenId ${tokenId}:`, parseError);
              // Fallback: estrai città con regex
              if (decodedJson) {
                const match = decodedJson.match(/"City"\s*:\s*"([^"]*)/);
                if (match?.[1]) {
                  city = getFullCityName(match[1]);
                  imageUrl = CITY_IMAGES[city] || "";
                }
              }
              name = `NFT #${tokenId} (incompleto)`;
              description = "Dati incompleti";
            }
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
      console.error("Errore fetchNFTs:", e);
      setError(`Errore: ${e.message}`);
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