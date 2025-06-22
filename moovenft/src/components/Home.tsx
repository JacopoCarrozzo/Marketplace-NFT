import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, CONTRACT_ABI } from "../constant/contract";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMarketNFTs, NFTItem } from "../hooks/useMarketNFTs";
import { CITY_IMAGES } from "../constant/contract";
import React from "react";
import Info from "./Info";
import { useMint } from "../hooks/useMint";
import { useWalletContext } from "../context/WalletContext";
import historyIcon from "../assets/images/cronologia.png";
import MarketPlace from "./Marketplace";
import MyNFT from "./MyNFTs";
import AuctionPlace from "./Auctionplace";

function Home() {
  const {
    walletConnected,
    balanceInfo,
    connectWallet,
    correctChain,
    provider,
    signer,
    disconnectWallet,
  } = useWalletContext();

  const [mintCost, setMintCost] = useState<string>("Loading...");
  const [mintCostError, setMintCostError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMintCost = async () => {
      if (!provider || !walletConnected) {
        setMintCost("Waiting for wallet connection...");
        return;
      }
      try {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const cost = await contract.mintingCost();
        setMintCost(ethers.formatEther(cost));
        setMintCostError(null);
      } catch (error) {
        console.error("Errore nel recuperare il costo di minting:", error);
        setMintCost("Unable to fetch minting cost");
        setMintCostError("Failed to load minting cost. Please try again later.");
      }
    };
    fetchMintCost();
  }, [provider, walletConnected]);

  const {
    mintNFT,
    minting: mintPending,
    mintError,
    mintSuccess,
  } = useMint(signer, () => console.log("Minting completato con successo"));

  const [contractOwnerAddress, setContractOwnerAddress] = useState<string | null>(null);
  const [selectedNFT, setSelectedNFT] = React.useState<NFTItem | null>(null);
  const [tokenIdToList, setTokenIdToList] = useState("");
  const [priceToList, setPriceToList] = useState("");
  const [isListingPending, setIsListingPending] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);
  const [marketplaceRefreshFunction, setMarketplaceRefreshFunction] = useState<
    (() => void) | null
  >(null);
  const [tokenIdToAuction, setTokenIdToAuction] = useState("");
  const [durationToAuction, setDurationToAuction] = useState("");
  const [isAuctionPending, setIsAuctionPending] = useState(false);
  const [auctionError, setAuctionError] = useState<string | null>(null);
  const [auctionRefreshFunction, setAuctionRefreshFunction] = useState<
    (() => void) | null
  >(null);

  const { items: marketNFTs, loading: loadingMarketNFTs, error: marketNFTsError, fetchNFTs: fetchMarketNFTs } = useMarketNFTs(provider);

  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  useEffect(() => {
    const fetchContractOwner = async () => {
      if (!provider || !walletConnected) return;
      try {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        const owner = await contract.owner();
        setContractOwnerAddress(owner);
      } catch (error) {
        console.error("Errore nel recupero dell'indirizzo del proprietario del contratto:", error);
        setContractOwnerAddress(null);
      }
    };
    fetchContractOwner();
  }, [provider, walletConnected]);

  const isOwner = walletConnected && balanceInfo.address && contractOwnerAddress && balanceInfo.address.toLowerCase() === contractOwnerAddress.toLowerCase();

  const onNFTActionForAuction = useCallback(() => {
    if (auctionRefreshFunction) auctionRefreshFunction();
  }, [auctionRefreshFunction]);

  const handleBuyNFTFromHome = async (nft: NFTItem) => {
    if (!signer || !balanceInfo.address) {
      alert("Devi connettere il tuo wallet per acquistare NFT.");
      return;
    }
    if (!provider) {
      alert("Provider non disponibile per leggere lo stato on-chain.");
      return;
    }
    const contractRead = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    let onChainOwner: string;
    try {
      onChainOwner = await contractRead.ownerOf(Number(nft.tokenId));
    } catch (ownerError) {
      console.error("Errore nel recuperare owner on-chain:", ownerError);
      alert("Impossibile recuperare l'owner on-chain, riprova più tardi.");
      return;
    }
    if (onChainOwner.toLowerCase() === balanceInfo.address.toLowerCase()) {
      alert("Non puoi comprare il tuo stesso NFT!");
      return;
    }
    try {
      const contractWrite = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const isForSaleOnChain: boolean = await contractWrite.isForSale(Number(nft.tokenId));
      if (!isForSaleOnChain) {
        alert("Questo NFT non è più in vendita.");
        return;
      }
      const priceOnChainWei: bigint = await contractWrite.tokenPrices(Number(nft.tokenId));
      const priceInWei: bigint = ethers.parseEther(nft.price);
      if (priceInWei < priceOnChainWei) {
        alert("Il prezzo è cambiato: aggiorna la pagina e riprova.");
        return;
      }
      const balance: bigint | undefined = await signer.provider?.getBalance(balanceInfo.address);
      if (!balance || balance < priceInWei) {
        alert("Saldo insufficiente per completare l'acquisto.");
        return;
      }
      await contractWrite.buyNFT.estimateGas(Number(nft.tokenId), { value: priceInWei });
      const tx = await contractWrite.buyNFT(Number(nft.tokenId), { value: priceInWei });
      await tx.wait();
      alert(`Hai acquistato con successo l'NFT #${nft.tokenId}!`);
      fetchMarketNFTs();
    } catch (e: any) {
      console.error("Errore durante l'acquisto dell'NFT:", e);
      alert("Errore durante l'acquisto dell'NFT. Riprova più tardi.");
    }
  };

  useEffect(() => {
    if (mintSuccess && marketplaceRefreshFunction) marketplaceRefreshFunction();
  }, [mintSuccess, marketplaceRefreshFunction]);

  const handleListNFTForSale = async () => {
    if (!signer || !walletConnected) {
      alert("Per favore, connetti il tuo wallet.");
      return;
    }
    if (!tokenIdToList || !priceToList) {
      alert("Per favore, inserisci sia l'ID del Token che il Prezzo.");
      return;
    }
    setIsListingPending(true);
    setListingError(null);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    try {
      const yourAddress = await signer.getAddress();
      const ownerOnChain = await contract.ownerOf(Number(tokenIdToList));
      if (yourAddress.toLowerCase() !== ownerOnChain.toLowerCase()) {
        alert("Non sei il proprietario di questo token!");
        setIsListingPending(false);
        return;
      }
      const priceInWei = ethers.parseEther(priceToList);
      if (priceInWei <= BigInt(0)) {
        alert("Il prezzo deve essere maggiore di zero!");
        setIsListingPending(false);
        return;
      }
      const tx = await contract.listForSale(Number(tokenIdToList), priceInWei);
      await tx.wait();
      alert(`NFT #${tokenIdToList} messo in vendita!`);
      if (marketplaceRefreshFunction) marketplaceRefreshFunction();
      fetchMarketNFTs();
    } catch (e: any) {
      console.error("Errore durante la messa in vendita:", e);
      setListingError("Errore durante la messa in vendita. Riprova più tardi.");
    } finally {
      setIsListingPending(false);
    }
  };

  const handleStartAuction = async () => {
    if (!signer || !walletConnected) {
      alert("Per favore, connetti il tuo wallet.");
      return;
    }
    if (!tokenIdToAuction || !durationToAuction) {
      alert("Compila sia l'ID del Token che la durata dell'asta.");
      return;
    }
    setIsAuctionPending(true);
    setAuctionError(null);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    try {
      const yourAddress = await signer.getAddress();
      const ownerOnChain = await contract.ownerOf(Number(tokenIdToAuction));
      if (yourAddress.toLowerCase() !== ownerOnChain.toLowerCase()) {
        alert("Non sei il proprietario di questo token!");
        setIsAuctionPending(false);
        return;
      }
      const durationSeconds = parseInt(durationToAuction);
      if (isNaN(durationSeconds) || durationSeconds <= 0) {
        alert("Durata non valida (deve essere in secondi, > 0).");
        setIsAuctionPending(false);
        return;
      }

      const contractRead = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const auction = await contractRead.auctions(Number(tokenIdToAuction));
      const currentTimeInSeconds = Math.floor(Date.now() / 1000);
      if (Number(auction.endTime) !== 0 && Number(auction.endTime) > currentTimeInSeconds) {
        alert("Questo NFT ha già un'asta esistente attiva. Non può essere rimesso all'asta.");
        setIsAuctionPending(false);
        return;
      }

      const tx = await contract.startAuction(Number(tokenIdToAuction), durationSeconds);
      await tx.wait();
      alert(`Asta avviata per NFT #${tokenIdToAuction} (durata: ${durationSeconds}s).`);
      onNFTActionForAuction();
      fetchMarketNFTs();
    } catch (e: any) {
      console.error("Errore in startAuction:", e);
      setAuctionError("Errore durante l'avvio dell'asta. Riprova più tardi.");
    } finally {
      setIsAuctionPending(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      {selectedNFT ? (
        <div className="mt-12">
          <Info
            nft={selectedNFT}
            setSelectedNFT={setSelectedNFT}
            onBookClick={(price, recipient) =>
              handleBuyNFTFromHome({
                ...selectedNFT,
                owner: recipient,
                price: price.toString(),
              } as NFTItem)
            }
            isForSale={selectedNFT.isForSale}
            isOwnedByUser={false}
          />
        </div>
      ) : (
        <>
          {currentPath === "/" && (
            <>
              <div
                className={`w-64 bg-white shadow-lg rounded-lg p-4 z-10 ${
                  !walletConnected
                    ? "absolute top-[10%] left-1/2 -translate-x-1/2 -translate-y-1/2"
                    : "fixed top-4 mt-4 right-4"
                }`}
              >
                <h2 className="text-lg font-semibold text-gray-700 text-center text-sm">Wallet</h2>
                {!walletConnected ? (
                  <button
                    onClick={connectWallet}
                    className="w-full bg-blue-600 text-white mt-2 font-semibold py-1 px-2 rounded-lg hover:bg-blue-700 transition duration-300 text-sm"
                  >
                    Connect Wallet
                  </button>
                ) : (
                  <>
                    <p className="text-center text-gray-600 text-sm">
                      Wallet connesso: {balanceInfo.address?.substring(0, 6)}…
                      {balanceInfo.address?.slice(-4)}
                    </p>
                    <button
                      onClick={disconnectWallet}
                      className="w-full bg-red-600 text-white mt-2 font-semibold py-1 px-2 rounded-lg hover:bg-red-700 transition duration-300 text-sm"
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
              {walletConnected && (
                <div className="fixed top-8 left-8">
                  <Link to="/purchase-history" className="text-blue-600 hover:text-blue-800 flex items-center space-x-2">
                    <img src={historyIcon} alt="Storico" className="w-5 h-5 filter invert" />
                    <span className="text-md font-semibold text-white">Purchase History</span>
                  </Link>
                </div>
              )}
              {walletConnected && correctChain && isOwner && (
                <div className="max-w-xl mx-auto p-6 mt-4 mb-8 bg-white shadow-lg rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-700 text-center mb-4">Mint a New NFT</h3>
                  <div className="mb-4 text-center">
                    <p className="text-gray-600">Minting Cost: <span className="font-bold">{mintCost}</span></p>
                    {mintCostError && <p className="text-red-500 text-sm">{mintCostError}</p>}
                  </div>
                  <button
                    onClick={() => mintNFT(mintCost)}
                    disabled={mintPending || mintCost === 'Loading...' || mintCost === 'Waiting for wallet connection...' || mintCost === 'Unable to fetch minting cost' || !walletConnected || !correctChain}
                    className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {mintPending ? "Minting NFT... (Please confirm in MetaMask)" : "Mint NFT"}
                  </button>
                  {mintError && <div className="text-red-500 mt-2 text-center">Errore durante il minting. Riprova più tardi.</div>}
                </div>
              )}
              {walletConnected && (
                <div className="p-4 rounded-lg shadow-xl mb-8">
                  {loadingMarketNFTs ? (
                    <p className="text-center text-gray-400">Loading NFT for sale...</p>
                  ) : marketNFTsError ? (
                    <p className="text-center text-red-400">Errore nel caricamento degli NFT. Riprova più tardi.</p>
                  ) : marketNFTs.filter(nft => nft.isForSale).length === 0 ? (
                    <p className="text-center text-gray-400">Nessun NFT in vendita al momento.</p>
                  ) : (
                    <>
                      <h3 className="text-2xl font-bold text-white mb-4 text-center">News in Marketplace</h3>
                      <div className="flex justify-center">
                        <div className="w-full md:w-3/4 px-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {marketNFTs
                              .filter((nft) => nft.isForSale)
                              .slice(0, 3)
                              .map((nft: NFTItem) => (
                                <div
                                  key={nft.tokenId}
                                  className="bg-white shadow-sm rounded-lg overflow-hidden flex flex-col"
                                >
                                  <div className="p-4 flex-1">
                                    <h4 className="text-lg font-semibold text-gray-800">
                                      {nft.name} {nft.city}
                                    </h4>
                                    <div className="h-40 w-full overflow-hidden rounded mt-2">
                                      <img
                                        src={CITY_IMAGES[nft.city]}
                                        alt={nft.city}
                                        className="object-cover h-full w-full"
                                        loading="lazy"
                                      />
                                    </div>
                                    <p className="text-gray-600 mt-3">City: {nft.city}</p>
                                    <p className="text-gray-800 font-bold mt-2">Price: {nft.price} ETH</p>
                                  </div>
                                  <div className="p-4 border-t flex space-x-2">
                                    <button
                                      onClick={() => handleBuyNFTFromHome(nft)}
                                      className="flex-1 text-center bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
                                    >
                                      Buy
                                    </button>
                                    <button
                                      onClick={() => navigate("/marketplace")}
                                      className="flex-1 text-center bg-green-500 text-black py-2 rounded hover:bg-green-600 transition"
                                    >
                                      Go Marketplace
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {walletConnected && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                  <div className="p-6 mt-4 mb-8 bg-white shadow-lg rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-700 text-center mb-4 mt-6">Put your NFT up for Sale</h3>
                    <p className="text-gray-600 mb-4 text-center">Enter the ID of the Token you own and the price in ETH.</p>
                    <div className="mb-4">
                      <label htmlFor="tokenIdToList" className="block text-gray-700 text-sm font-bold mb-2">Token ID:</label>
                      <input
                        id="tokenIdToList"
                        type="number"
                        value={tokenIdToList}
                        onChange={(e) => setTokenIdToList(e.target.value)}
                        placeholder="Es. 1, 2, 3..."
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                      />
                    </div>
                    <div className="mb-6">
                      <label htmlFor="priceToList" className="block text-gray-700 text-sm font-bold mb-2">Price (ETH):</label>
                      <input
                        id="priceToList"
                        type="text"
                        value={priceToList}
                        onChange={(e) => setPriceToList(e.target.value)}
                        placeholder="Es. 0.05, 1.2"
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                      />
                    </div>
                    <button
                      onClick={handleListNFTForSale}
                      disabled={!walletConnected || !correctChain || isListingPending}
                      className="w-full bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isListingPending ? "Listing... (Confirmation in MetaMask)" : "List NFT for Sale"}
                    </button>
                    {listingError && <div className="text-red-500 mt-2 text-center">{listingError}</div>}
                  </div>
                  <div className="p-6 mt-4 mb-8 bg-white shadow-lg rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-700 text-center mb-4">Put Your NFT Up for Auction</h3>
                    <p className="text-gray-600 mb-4 text-center">Enter the Token ID and the duration (in seconds) of the auction.</p>
                    <div className="mb-4">
                      <label htmlFor="tokenIdToAuction" className="block text-gray-700 text-sm font-bold mb-2">Token ID:</label>
                      <input
                        id="tokenIdToAuction"
                        type="number"
                        value={tokenIdToAuction}
                        onChange={(e) => setTokenIdToAuction(e.target.value)}
                        placeholder="Es. 1, 2, 3..."
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                      />
                    </div>
                    <div className="mb-6">
                      <label htmlFor="durationToAuction" className="block text-gray-700 text-sm font-bold mb-2">Auction Duration (seconds):</label>
                      <input
                        id="durationToAuction"
                        type="number"
                        value={durationToAuction}
                        onChange={(e) => setDurationToAuction(e.target.value)}
                        placeholder="Es. 86400 per 24 ore"
                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                      />
                    </div>
                    <button
                      onClick={handleStartAuction}
                      disabled={!walletConnected || !correctChain || isAuctionPending}
                      className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAuctionPending ? "Start Auction... (Confirm in MetaMask)" : "Put Item Up for Sale at Auction"}
                    </button>
                    {auctionError && <div className="text-red-500 mt-2 text-center">{auctionError}</div>}
                  </div>
                </div>
              )}
            </>
          )}
          {currentPath === "/my-nft" && provider && signer && (
            <MyNFT
              connectedProvider={provider}
              walletAddress={balanceInfo.address}
              signer={signer}
              onNFTAction={() => {}}
              setMarketplaceRefreshFunction={setMarketplaceRefreshFunction}
            />
          )}
          {currentPath === "/marketplace" && provider && signer && (
            <MarketPlace
              connectedProvider={provider}
              walletAddress={balanceInfo.address}
              signer={signer}
              onNFTAction={marketplaceRefreshFunction || (() => {})}
              setMarketplaceRefreshFunction={setMarketplaceRefreshFunction}
            />
          )}
          {currentPath === "/auctions" && provider && signer && (
            <AuctionPlace
              onNFTAction={onNFTActionForAuction}
              setAuctionRefreshFunction={setAuctionRefreshFunction}
            />
          )}
        </>
      )}
    </div>
  );
}

export default Home;