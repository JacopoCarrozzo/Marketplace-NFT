import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../constant/contract';
import { CITY_IMAGES } from '../constant/contract';
import { Link, useNavigate } from 'react-router-dom'; // Importa useNavigate

interface Purchase {
    tokenId: string;
    price: string;
    buyer: string;
    name?: string;
    city?: string;
}

const PurchaseHistory = ({ currentAccount }: { currentAccount: string | null }) => {
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const navigate = useNavigate(); // Inizializza useNavigate

    useEffect(() => {
        const fetchPurchaseHistory = async () => {
            if (!currentAccount) {
                setError("Connetti il tuo wallet per vedere lo storico acquisti.");
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                let provider: ethers.BrowserProvider | ethers.JsonRpcProvider;
                if (window.ethereum) {
                    provider = new ethers.BrowserProvider(window.ethereum);
                } else {
                    provider = new ethers.JsonRpcProvider('https://rpc.sepolia.org');
                }

                const network = await provider.getNetwork();
                if (network.chainId !== BigInt(11155111)) {
                    setError("Collegati alla rete Sepolia.");
                    setLoading(false);
                    return;
                }

                const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

                const currentBlock = await provider.getBlockNumber();
                const fromBlock = Math.max(0, currentBlock - 50000);

                const filter = contract.filters.NFTPurchased(null, currentAccount);
                const logs = await contract.queryFilter(filter, fromBlock, "latest");

                const userPurchases: Purchase[] = [];
                for (const log of logs) {
                    const parsedLog = contract.interface.parseLog(log);
                    if (parsedLog && parsedLog.name === "NFTPurchased") {
                        const { tokenId, buyer, price } = parsedLog.args;
                        let nftName = `NFT #${tokenId.toString()}`;
                        let nftCity = "N/A";

                        try {
                            const metadata = await contract.getTokenMetadata(tokenId);
                            if (metadata) {
                                nftName = metadata.name;
                                nftCity = metadata.city;
                            }
                        } catch (metaError) {
                            console.warn(`Errore nel recuperare metadati per tokenId ${tokenId}:`, metaError);
                        }

                        userPurchases.push({
                            tokenId: tokenId.toString(),
                            price: ethers.formatEther(price),
                            buyer,
                            name: nftName,
                            city: nftCity,
                        });
                    }
                }

                setPurchases(userPurchases.reverse());
            } catch (err) {
                console.error("Errore nel recupero degli eventi:", err);
                setError("Errore durante il recupero dello storico. Assicurati di essere connesso alla rete Sepolia.");
            } finally {
                setLoading(false);
            }
        };

        fetchPurchaseHistory();
    }, [currentAccount]);

    // Funzione per tornare alla home
    const handleGoHome = () => {
        navigate('/'); // Naviga alla root (Home)
    };

    if (loading) {
        return (
            <div className="text-center p-5">
                <div className="animate-spin border-4 border-gray-200 border-t-blue-500 rounded-full w-10 h-10 mx-auto"></div>
                <p className="text-gray-700 mt-2">Caricamento storico acquisti...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-100 text-red-800 p-4 rounded-lg m-5 text-center">
                {error}
            </div>
        );
    }

    return (
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <h2 className="text-3xl font-bold text-center mb-8 text-white-800">Storico Acquisti NFT</h2>
            {purchases.length === 0 ? (
                <p className="text-center text-gray-600 text-lg">Nessun acquisto trovato per questo account.</p>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {purchases.map((purchase) => (
                        <div
                            key={purchase.tokenId}
                            className="bg-white shadow-lg rounded-lg overflow-hidden flex flex-col"
                        >
                            <div className="p-4 flex-1">
                                <h3 className="text-lg font-semibold text-gray-800">
                                    {purchase.name || `NFT #${purchase.tokenId}`}
                                </h3>
                                <div className="h-32 w-full overflow-hidden rounded mt-2">
                                    <img
                                        src={CITY_IMAGES[purchase.city || 'DefaultCity']}
                                        alt={purchase.city || 'Città sconosciuta'}
                                        className="object-cover h-full w-full"
                                        loading="lazy"
                                    />
                                </div>
                                <p className="text-gray-600 mt-2 text-sm">
                                    Città: {purchase.city || "N/A"}
                                </p>
                                
                            </div>
                            <div className="p-4 border-t">
                                {/* BOTTONE "TORNA ALLA HOME" */}
                                <button
                                    onClick={handleGoHome} // Chiama la funzione di navigazione
                                    className="block text-center bg-green-600 text-white py-2 rounded hover:bg-green-700 transition text-sm w-full" // Stile per un bottone "successo" e larghezza piena
                                >
                                    Torna alla Home
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PurchaseHistory;