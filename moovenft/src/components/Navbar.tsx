import { Link } from "react-router-dom";
import { useWalletContext } from "../context/WalletContext";

const Navbar = () => {
  const { walletConnected } = useWalletContext();

  return (
    <nav className="p-4 mt-4">
      <div className="container mx-auto flex justify-center">
        <ul className="flex space-x-6 text-gray-300">
          <li>
            <Link to="/" className="hover:text-black transition text-white">HOME</Link>
          </li>
          {walletConnected && (
            <>
              <li>
                <Link to="/my-nft" className="hover:text-black transition text-white">MY NFT</Link>
              </li>
              <li>
                <Link to="/marketplace" className="hover:text-black transition text-white">MARKETPLACE</Link>
              </li>
              <li>
                <Link to="/auctions" className="hover:text-black transition text-white">AUCTIONS</Link>
              </li>
            </>
          )}
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;