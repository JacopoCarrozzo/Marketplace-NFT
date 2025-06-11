import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./components/Home";
import PurchaseHistory from "./components/PurchaseHistory";
import { WalletProvider, useWalletContext } from './context/WalletContext';
import HistoryAuction from "./components/HistoryAuction";

function App() {
  const desiredChainId = 11155111; // Sepolia, come esempio

  return (
    <WalletProvider desiredChainId={desiredChainId}>
      <div className="min-h-screen text-white">
        <Navbar />
        <div className="container mx-auto p-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/my-nft" element={<Home />} />
            <Route path="/MARKETPLACE" element={<Home />} />
            <Route path="/ASTE" element={<Home />} />
            <Route path="/history" element={<PurchaseHistoryWrapper />} />
            <Route path="/AuctionHistory" element={<HistoryAuction />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </WalletProvider>
  );
}

function PurchaseHistoryWrapper() {
  const { balanceInfo } = useWalletContext();
  return <PurchaseHistory currentAccount={balanceInfo.address} />;
}

export default App;