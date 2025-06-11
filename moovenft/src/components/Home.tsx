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

  useEffect(() => {
    const fetchMintCost = async () => {
      if (provider) {
        try {
          const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
          const cost = await contract.mintingCost();
          setMintCost(ethers.formatEther(cost));
        } catch (error) {
          console.error("Errore nel recuperare il costo di minting:", error);
          setMintCost("Error");
        }
      }
    };
    fetchMintCost();
  }, [provider]);

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
      if (provider) {
        try {
          const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
          const owner = await contract.owner();
          setContractOwnerAddress(owner);
        } catch (error) {
          console.error("Errore nel recupero dell'indirizzo del proprietario del contratto:", error);
          setContractOwnerAddress(null);
        }
      }
    };
    fetchContractOwner();
  }, [provider]);

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
      alert("Errore durante l'acquisto dell'NFT: " + (e.reason || e.message || "Errore sconosciuto"));
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
      console.error("RAW ERROR DATA:", e.data);
      let parsed: { name?: string; args?: any } | null = null;
      try { parsed = contract.interface.parseError(e.data) as any; } catch {}
      if (parsed?.name) console.error("DECODED CUSTOM ERROR:", parsed.name, parsed.args);
      else console.warn("Revert generico");
      setListingError(e.reason || e.message);
    } finally { setIsListingPending(false); }
  };

  const handleStartAuction = async () => {
    if (!signer || !walletConnected) {
      alert("Per favor, connetti il tuo wallet.");
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

      // --- INIZIO LOGICA AGGIORNATA: Controllo dell'asta esistente e attiva ---
      const contractRead = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      const auction = await contractRead.auctions(Number(tokenIdToAuction));

      // currentTime in secondi (Unix timestamp)
      const currentTimeInSeconds = Math.floor(Date.now() / 1000); 

      // Controlla se esiste un'asta E se NON è terminata
      // auction.endTime è la timestamp di fine dell'asta.
      // Se auction.endTime > currentTimeInSeconds, significa che l'asta è ancora attiva.
      if (Number(auction.endTime) !== 0 && Number(auction.endTime) > currentTimeInSeconds) {
        alert("Questo NFT ha già un'asta esistente attiva. Non può essere rimesso all'asta.");
        setIsAuctionPending(false);
        return; // Interrompe l'esecuzione della funzione
      }
      // --- FINE LOGICA AGGIORNATA ---

      const tx = await contract.startAuction(Number(tokenIdToAuction), durationSeconds);
      await tx.wait();
      alert(`Asta avviata per NFT #${tokenIdToAuction} (durata: ${durationSeconds}s).`);
      onNFTActionForAuction();
      fetchMarketNFTs();
    } catch (e: any) {
      console.error("Errore in startAuction:", e);
      setAuctionError(e.reason || e.message);
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
              {/* MODIFICA QUI: Classi condizionali per posizionamento del wallet div */}
              <div
                className={`w-64 bg-white shadow-lg rounded-lg p-4 z-10 ${
                  !walletConnected
                    ? "absolute top-[10%] left-1/2 -translate-x-1/2 -translate-y-1/2" // 10% dall'alto quando non connesso
                    : "fixed top-4 mt-4 right-4" // Posizione originale quando connesso
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
                  <Link to="/history" className="text-blue-600 hover:text-blue-800 flex items-center space-x-2">
                    <img src={historyIcon} alt="Storico" className="w-5 h-5 filter invert" />
                    <span className="text-md font-semibold text-white">Storico Acquisti</span>
                  </Link>
                </div>
              )}
              {walletConnected && correctChain && isOwner && (
                <div className="max-w-xl mx-auto p-6 mt-4 mb-8 bg-white shadow-lg rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-700 text-center mb-4">Mint a New NFT</h3>
                  <div className="mb-4 text-center">
                    <p className="text-gray-600">Minting Cost: <span className="font-bold">{mintCost} ETH</span></p>
                  </div>
                  <button
                    onClick={() => mintNFT(mintCost)}
                    disabled={mintPending || mintCost === 'Loading...' || mintCost === 'Error' || !walletConnected || !correctChain}
                    className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {mintPending ? "Minting NFT... (Please confirm in MetaMask)" : "Mint NFT"}
                  </button>
                  {mintError && <div className="text-red-500 mt-2 text-center">Error minting: {mintError}</div>}
                </div>
              )}
              {/* START: Modifica per la visibilità del Marketplace */}
              {walletConnected && ( // Mostra il div solo se il wallet è connesso
                <div className="p-4 rounded-lg shadow-xl mb-8">
                  {loadingMarketNFTs ? (
                    <p className="text-center text-gray-400">Caricamento NFT in vendita...</p>
                  ) : marketNFTsError ? (
                    <p className="text-center text-red-400">Errore: {marketNFTsError}</p>
                  ) : marketNFTs.filter(nft => nft.isForSale).length === 0 ? ( // Se wallet connesso e nessun NFT
                    <p className="text-center text-gray-400">Nessun NFT in vendita al momento.</p>
                  ) : ( // Se wallet connesso e ci sono NFT in vendita
                    <>
                      <h3 className="text-2xl font-bold text-white mb-4 text-center">Novità nel Marketplace</h3>
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
                                    <p className="text-gray-600 mt-3">Città: {nft.city}</p>
                                    <p className="text-gray-800 font-bold mt-2">Prezzo: {nft.price} ETH</p>
                                  </div>
                                  <div className="p-4 border-t flex space-x-2">
                                    <button
                                      onClick={() => handleBuyNFTFromHome(nft)}
                                      className="flex-1 text-center bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
                                    >
                                      Acquista
                                    </button>
                                    <button
                                      onClick={() => navigate("/MARKETPLACE")}
                                      className="flex-1 text-center bg-green-500 text-black py-2 rounded hover:bg-green-600 transition"
                                    >
                                      Vai al Marketplace
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
              {/* END: Modifica per la visibilità del Marketplace */}
              {walletConnected && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                  <div className="p-6 mt-4 mb-8 bg-white shadow-lg rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-700 text-center mb-4 mt-6">Metti il tuo NFT in Vendita</h3>
                    <p className="text-gray-600 mb-4 text-center">Inserisci l'ID del Token che possiedi e il prezzo in ETH.</p>
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
                      <label htmlFor="priceToList" className="block text-gray-700 text-sm font-bold mb-2">Prezzo (ETH):</label>
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
                      {isListingPending ? "Mettendo in vendita... (Conferma in MetaMask)" : "Metti in Vendita NFT"}
                    </button>
                    {listingError && <div className="text-red-500 mt-2 text-center">Error listing: {listingError}</div>}
                  </div>
                  <div className="p-6 mt-4 mb-8 bg-white shadow-lg rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-700 text-center mb-4">Metti il tuo NFT in Vendita all'Asta</h3>
                    <p className="text-gray-600 mb-4 text-center">Inserisci l'ID del Token e la durata (in secondi) dell'asta.</p>
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
                      <label htmlFor="durationToAuction" className="block text-gray-700 text-sm font-bold mb-2">Durata Asta (secondi):</label>
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
                      {isAuctionPending ? "Avvio Asta... (Conferma in MetaMask)" : "Metti in Vendita all'Asta"}
                    </button>
                    {auctionError && <div className="text-red-500 mt-2 text-center">Error start auction: {auctionError}</div>}
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
              onNFTAction={() => {}} // Questa funzione potrebbe dover triggerare un refresh anche qui
              setMarketplaceRefreshFunction={setMarketplaceRefreshFunction}
            />
          )}
          {currentPath === "/MARKETPLACE" && provider && signer && (
            <MarketPlace
              connectedProvider={provider}
              walletAddress={balanceInfo.address}
              signer={signer}
              onNFTAction={marketplaceRefreshFunction || (() => {})}
              setMarketplaceRefreshFunction={setMarketplaceRefreshFunction}
            />
          )}
          {currentPath === "/ASTE" && provider && signer && (
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