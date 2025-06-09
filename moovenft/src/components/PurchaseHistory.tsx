import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../constant/contract';

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
                const fromBlock = Math.max(0, currentBlock - 10000);

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
                setError("Errore durante il recupero dello storico.");
            } finally {
                setLoading(false);
            }
        };

        fetchPurchaseHistory();
    }, [currentAccount]);

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '20px' }}>
                <div style={{ border: '4px solid rgba(0, 0, 0, 0.1)', borderRadius: '50%', borderTop: '4px solid #3498db', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto' }}></div>
                <p style={{ color: '#333', marginTop: '10px' }}>Caricamento storico acquisti...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '15px', borderRadius: '8px', margin: '20px 0', textAlign: 'center' }}>
                {error}
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
            <h2 style={{ textAlign: 'center', marginBottom: '25px', color: '#333', fontSize: '24px', fontWeight: 'bold' }}>Storico Acquisti NFT</h2>
            {purchases.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#666', fontSize: '16px' }}>Nessun acquisto trovato per questo account.</p>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                    {purchases.map((purchase, index) => (
                        <div key={index} style={{ backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '20px', textAlign: 'center', transition: 'transform 0.2s',}}>
                            <h3 style={{ margin: '0 0 15px', color: '#007bff', fontSize: '18px', fontWeight: '600' }}>{purchase.name || `NFT #${purchase.tokenId}`}</h3>
                            <p style={{ margin: '8px 0', color: '#555', fontSize: '14px' }}><strong>Token ID:</strong> {purchase.tokenId}</p>
                            {purchase.city && <p style={{ margin: '8px 0', color: '#555', fontSize: '14px' }}><strong>Città:</strong> {purchase.city}</p>}
                            <p style={{ margin: '8px 0', color: '#555', fontSize: '14px' }}><strong>Prezzo:</strong> {purchase.price} ETH</p>
                            <p style={{ margin: '8px 0', color: '#555', fontSize: '14px', wordBreak: 'break-all' }}><strong>Acquirente:</strong> {purchase.buyer}</p>
                            <a href={`https://sepolia.etherscan.io/token/${CONTRACT_ADDRESS}?a=${purchase.tokenId}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '10px', color: '#007bff', textDecoration: 'none', fontSize: '14px', padding: '5px 10px', border: '1px solid #007bff', borderRadius: '5px',}}>Vedi su Etherscan</a>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PurchaseHistory;