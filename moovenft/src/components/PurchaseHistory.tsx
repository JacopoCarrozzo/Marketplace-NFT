import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../constant/contract';
import { CITY_IMAGES } from '../constant/contract';
import { Link, useNavigate } from 'react-router-dom'; 

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

    const navigate = useNavigate(); 

    useEffect(() => {
        const fetchPurchaseHistory = async () => {
            if (!currentAccount) {
                setError("Connect your wallet to view your purchase history."); 
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
                    provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY'); 
                }

                const network = await provider.getNetwork();
                const DESIRED_CHAIN_ID = 11155111; 
                if (network.chainId !== BigInt(DESIRED_CHAIN_ID)) {
                    setError("Please connect to the Sepolia network."); 
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
                            console.warn(`Error fetching metadata for tokenId ${tokenId}:`, metaError); 
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
                console.error("Error fetching events:", err); 
                setError("Error retrieving history. Please ensure you are connected to the Sepolia network."); 
            } finally {
                setLoading(false);
            }
        };

        fetchPurchaseHistory();
    }, [currentAccount]); // Dependency on currentAccount

    // Function to go back to Home
    const handleGoHome = () => {
        navigate('/'); // Navigate to root (Home)
    };

    return (
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-12 pt-8"> {/* Added pt-8 for consistent top spacing */}
            <h2 className="text-3xl font-bold text-center mb-8 text-white">Purchase History</h2> {/* Translated title */}

            {/* Loading Spinner */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-8">
                    <div
                        className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"
                        role="status"
                    >
                        <span className="sr-only">Loading...</span>
                    </div>
                    <p className="text-center text-gray-400 mt-4">Loading purchase history...</p>
                </div>
            ) : error ? (
                <div className="bg-red-100 text-red-800 p-4 rounded-lg m-5 text-center">
                    {error}
                </div>
            ) : !currentAccount ? ( // Explicitly handle no account connected
                 <p className="text-center text-white text-lg">
                    Connect your wallet to view your NFTs. {/* Re-used MyNFTs message */}
                 </p>
            ) : purchases.length === 0 ? (
                <p className="text-center text-gray-600 text-lg">No purchases found for this account.</p> 
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
                                        alt={purchase.city || 'Unknown City'} 
                                        className="object-cover h-full w-full"
                                        loading="lazy"
                                    />
                                </div>
                                <p className="text-gray-600 mt-2 text-sm">
                                    City: {purchase.city || "N/A"}
                                </p>
                                <p className="text-gray-800 font-bold mt-2">Price: {purchase.price} ETH</p> {/* Added Price display */}
                            </div>
                            <div className="p-4 border-t">
                                {/* "Back to Home" button */}
                                <button
                                    onClick={handleGoHome} // Call navigation function
                                    className="block text-center bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition text-sm w-full" // Changed color to blue, consistent with Home buy buttons
                                >
                                    Back to Home 
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