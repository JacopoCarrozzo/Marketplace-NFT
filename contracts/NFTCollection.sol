// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "../contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import "./utils/Base64.sol";

struct CityData {
    string city;
    string description;
}

contract NFTcontract is ERC721Enumerable, VRFConsumerBaseV2Plus  {

    using Counters for Counters.Counter;
    Counters.Counter public _tokenIdCounter;

    CityData[] private cities;

    address private immutable vrfCoordinator;
    bytes32 private immutable s_keyHash;
    uint32 private immutable callbackGasLimit;
    uint32 private immutable numWords;
    uint256 private immutable s_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;

    mapping(uint256 => uint256) private _requestIdToTokenId;
    mapping(uint256 => uint256) private _randomNumbers;

    uint256 public mintingCost;
    uint256 public maxSupply;
    uint256 private constant UNSET = type(uint256).max;

    mapping(uint256 => string) private _tokenURIs;
    mapping(uint256 => bool) private _requestIdFulfilled;
    mapping(uint256 => string) private _tokenNames;
    mapping(uint256 => string) private _tokenDescriptions;
    mapping(uint256 => string) private _tokenCities;
    mapping(uint256 => uint256) private _tokenLuckyNumbers;
    mapping(uint256 => string) private _tokenTourChances;
    mapping(uint256 => uint256) public tokenPrices;
    mapping(uint256 => bool) public isForSale;
    mapping(uint256 => bool) private usedNumbers;
    // Mapping to save the "real" seller when the NFT is in escrow
    mapping(uint256 => address) public sellers;

    struct Auction {
        uint256 tokenId;
        uint256 endTime;
        address highestBidder;
        uint256 highestBid;
        bool ended;
        mapping(address => uint256) bids; // refund balance for each bidder
    }
    // Mapping from tokenId to Auction
    mapping(uint256 => Auction) public auctions;

    // Mapping to track the original seller of the NFT put up for auction
    mapping(uint256 => address) public auctionSellers;

    // Events
    event RandomNumberRequested (uint256 indexed tokenId, uint256 requestId);
    event RandomNumberFulfilled (uint256 indexed tokenId, uint256 randomNumber);
    event TokenMinted (uint256 indexed tokenId);
    event DebugRequestId(uint256 requestId);
    event NFTMetadata(uint256 indexed tokenId, string name, string description, string city, string luckyNumber, string tourChance);
    event NFTListedForSale(uint256 indexed tokenId, uint256 price, address indexed seller);
    event NFTPurchased(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event AuctionStarted(uint256 indexed tokenId, uint256 endTime);
    event NewBid(uint256 indexed tokenId, address indexed bidder, uint256 amount);
    
    // NEW, CORRECTED DEFINITION
event AuctionEnded(
    uint256 indexed tokenId, // You had this as indexed already, good!
    address winner,
    uint256 amount,
    address indexed originalSeller, // New argument, indexed for easy filtering
    uint256 auctionEndTime      // New argument
);
    event RefundWithdrawn(uint256 indexed tokenId, address indexed bidder, uint256 amount);
    

    constructor(
        address vrfCoordinator_,
        bytes32 keyHash_,
        uint32 callbackGasLimit_,
        uint32 numWords_,
        string memory name_,
        string memory symbol_,
        uint256 subscriptionId_,
        uint256 initialMintingCost,
        uint256 initialMaxSupply
    )
        ERC721(name_, symbol_)
        VRFConsumerBaseV2Plus(vrfCoordinator_)
    {
        // Verify that numWords is greater than zero
        require(numWords_ > 0, "numWords must be > 0");

        vrfCoordinator   = vrfCoordinator_;
        s_keyHash        = keyHash_;
        callbackGasLimit = callbackGasLimit_;
        numWords         = numWords_;
        s_subscriptionId = subscriptionId_;

        mintingCost = initialMintingCost;
        maxSupply   = initialMaxSupply;

        _tokenIdCounter.increment(); // Start from 1, remove this line if you want the first ID to be 0.

        // Initialization of cities
        cities.push(CityData("Berlin", "The cosmopolitan capital of Germany, rich in history and culture."));
        cities.push(CityData("Paris", "The city of love and fashion, with iconic landmarks and a romantic atmosphere."));
        cities.push(CityData("Rome", "The Eternal City, the cradle of Western civilization with ancient ruins and extraordinary art."));
        cities.push(CityData("Madrid", "The vibrant capital of Spain, famous for its energy, art, and delicious cuisine."));
        cities.push(CityData("Amsterdam", "Known for its picturesque canals, narrow houses, and relaxed atmosphere."));
        cities.push(CityData("Frankfurt", "A major financial center with a mix of modern and traditional architecture."));
        cities.push(CityData("London", "A historic and multicultural metropolis with world-famous attractions."));
        cities.push(CityData("Dublin", "The lively capital of Ireland, famous for its music, cozy pubs, and literary history."));
        cities.push(CityData("Brussels", "The heart of Europe, home to important institutions and famous for chocolate and beer."));
        cities.push(CityData("Zurich", "An elegant and clean Swiss city, known for its high quality of life and picturesque lake."));
        cities.push(CityData("Milan", "The Italian capital of fashion and design, with a rich artistic and cultural history."));
        cities.push(CityData("Barcelona", "A cosmopolitan Spanish city famous for its modernist architecture, beaches, and vibrant nightlife."));
        cities.push(CityData("Florence", "The birthplace of the Italian Renaissance, with artistic masterpieces and breathtaking architecture."));
        cities.push(CityData("Rotterdam", "A modern port city in the Netherlands with innovative architecture and a dynamic atmosphere."));
        cities.push(CityData("Naples", "A vibrant and passionate Italian city, famous for its pizza, ancient history, and unique atmosphere."));
     }

   
    function listForSale(uint256 tokenId, uint256 price) external {
        address owner = ownerOf(tokenId);
        require(owner == msg.sender, "You are not the owner");
        require(price > 0, "Price must be greater than zero");
        require(!isForSale[tokenId], "Already for sale");

        // 1) Physically move the NFT from the seller to the contract
        _transfer(owner, address(this), tokenId);

        // 2) Save the "real" seller in the mapping
        sellers[tokenId] = owner;

        // 3) Set the "for sale" state and price
        isForSale[tokenId] = true;
        tokenPrices[tokenId] = price;

        emit NFTListedForSale(tokenId, price, owner);
    }

    function buyNFT(uint256 tokenId) external payable {
        require(isForSale[tokenId], "This NFT is not for sale");
        uint256 price = tokenPrices[tokenId];
        require(msg.value >= price, "Insufficient funds");

        address seller = sellers[tokenId];
        require(seller != address(0), "Invalid seller");

        // 1) Remove the "for sale" state to prevent re-entry
        isForSale[tokenId] = false;
        tokenPrices[tokenId] = 0;
        sellers[tokenId] = address(0);

        // 2) Transfer the NFT from the contract to the buyer
        _transfer(address(this), msg.sender, tokenId);
        address buyer = msg.sender;

        // 3) Send the funds to the original seller
        (bool sent, ) = payable(seller).call{ value: price }("");
        require(sent, "Funds transfer failed");

        // If the caller sent more than the price, refund the excess
        if (msg.value > price) {
            uint256 diff = msg.value - price;
            (bool refundSent, ) = payable(msg.sender).call{ value: diff }("");
            require(refundSent, "Refund failed");
        }

        emit NFTPurchased(tokenId, msg.sender, price);

        if (msg.value > price) {
            uint256 diff = msg.value - price;
            (bool refundSent, ) = payable(buyer).call{ value: diff }("");
            require(refundSent, "Refund failed");
        }
    }

    function totalMinted() public view returns (uint256) {
        return _tokenIdCounter.current();
    }

    function requestRandomNumber() public payable onlyOwner {
        require(msg.value >= mintingCost, "Insufficient Ether sent");
        require(_tokenIdCounter.current() <= maxSupply, "Maximum NFT supply reached");

        uint256 currentTokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(msg.sender, currentTokenId);
        _randomNumbers[currentTokenId] = UNSET;

        uint256 requestId;
        // Standard call for VRF v2.5 with the RandomWordsRequest struct
        try s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: s_keyHash,
                subId: s_subscriptionId,
                requestConfirmations: REQUEST_CONFIRMATIONS,
                callbackGasLimit: callbackGasLimit,
                numWords: numWords,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({ nativePayment: false })
                )
            })
        ) returns (uint256 rid) {
            requestId = rid;
        } catch Error(string memory reason) {
            // If the call fails, revert with the error message.
            // Do NOT fall back to the old/deprecated interface.
            revert(string(abi.encodePacked("Random number request failed: ", reason)));
        }

        _requestIdToTokenId[requestId] = currentTokenId;
        _requestIdFulfilled[requestId] = false;

        emit RandomNumberRequested(currentTokenId, requestId);
        emit DebugRequestId(requestId);
    }


    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        require(_requestIdToTokenId[requestId] > 0, "Invalid request");
        require(!_requestIdFulfilled[requestId], "Request already fulfilled");
        require(randomWords.length > 0, "No random number received");

        uint256 tokenId = _requestIdToTokenId[requestId];
        uint256 pick = randomWords[0] % cities.length;

        while (usedNumbers[pick]) {
          pick = (pick + 1) % cities.length;
       }
        usedNumbers[pick] = true;

        _randomNumbers[tokenId] = pick;

        _requestIdFulfilled[requestId] = true;

        string memory name = string(abi.encodePacked("City NFT #", Strings.toString(tokenId)));
        (string memory city, string memory description) = getCityAndDescription(pick);
        _tokenNames[tokenId] = name;
        _tokenDescriptions[tokenId] = description;
        _tokenCities[tokenId] = city;

        string memory json = string(abi.encodePacked(
    '{"name":"', name,
    '", "description":"', description,
    '", "City":"', city,
    '"}'
));

        string memory base64 = Base64.encode(bytes(json));
        string memory tokenUri = string(abi.encodePacked("data:application/json;base64,", base64));
        _tokenURIs[tokenId] = tokenUri;

        emit RandomNumberFulfilled(tokenId, pick);
        emit TokenMinted(tokenId); // Emit this event only after all metadata is set.
    }

    function tokenURI (uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) { revert("Token does not exist"); }
        require (_randomNumbers[tokenId] != UNSET, "Metadata not yet generated");
        return _tokenURIs[tokenId];
    }

    function getRandomResult(uint256 tokenId) external view returns (uint256) {
        if (_ownerOf(tokenId) == address(0)) revert("Token does not exist");
        uint256 rnd = _randomNumbers[tokenId];
        if (rnd == UNSET) {
            return 0; // If the random number hasn’t been generated yet, return 0 (or another sentinel value)
        }
        return rnd;
    }

    function getCityAndDescription(uint256 randomNumber) internal view returns (string memory city, string memory description) {
        require(randomNumber < cities.length, "Invalid random number");
        CityData memory data = cities[randomNumber];
        return (data.city, string(abi.encodePacked("A unique NFT representing the city of ", data.city, ". ", data.description)));
    }

    function getTokenMetadata(uint256 tokenId) public view returns (string memory name, string memory description, string memory city, string memory luckyNumber, string memory tourChance) {
        if (_ownerOf(tokenId) == address(0)) {
            revert("Token does not exist");
        }
        require(_randomNumbers[tokenId] != UNSET, "Metadata not yet generated");

        name = _tokenNames[tokenId];
        description = _tokenDescriptions[tokenId];
        city = _tokenCities[tokenId];
        luckyNumber = Strings.toString(_tokenLuckyNumbers[tokenId]);
        tourChance = _tokenTourChances[tokenId];
    }

    function startAuction(uint256 tokenId, uint256 durationInSeconds) external {
        require(ownerOf(tokenId) == msg.sender, "You are not the owner");
        require(auctions[tokenId].endTime == 0, "Auction already exists");

        _transfer(msg.sender, address(this), tokenId);
        auctionSellers[tokenId] = msg.sender;

        Auction storage auction = auctions[tokenId];
        auction.tokenId = tokenId;
        auction.endTime = block.timestamp + durationInSeconds;
        auction.highestBidder = address(0);
        auction.highestBid = 0;
        auction.ended = false;

        emit AuctionStarted(tokenId, auction.endTime);
    }

    /// @notice Place a bid for the auction of a token
    function bid(uint256 tokenId) external payable {
        Auction storage auction = auctions[tokenId];
        require(auction.endTime != 0, "Auction does not exist");
        require(block.timestamp < auction.endTime, "Auction has ended");
        require(msg.value > auction.highestBid, "Bid too low");

        // If there is already a highest bidder, accumulate the refund
        if (auction.highestBidder != address(0)) {
            auction.bids[auction.highestBidder] += auction.highestBid;
        }

        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;

        emit NewBid(tokenId, msg.sender, msg.value);
    }

   function finalizeAuction(uint256 tokenId) external {
    // Retrieve the auction details from storage
    Auction storage a = auctions[tokenId];
    uint256 endTime = a.endTime;
    bool alreadyEnded = a.ended;

    // --- Validation Checks ---
    // Ensure the auction exists (endTime is not 0, meaning it was started)
    require(endTime != 0, "Auction does not exist");
    // Ensure the auction time has passed
    require(block.timestamp >= endTime, "Auction not yet ended");
    // Prevent multiple finalizations for the same auction
    require(!alreadyEnded, "Auction already finalized");

    // Mark the auction as ended within the contract's current state
    // This `ended` flag is used in the `require(!alreadyEnded)` check above.
    a.ended = true;

    // Get the original seller of the auction. This is critical before deleting `auctionSellers[tokenId]`.
    address seller = auctionSellers[tokenId];

    // --- Process Auction Outcome ---
    if (a.highestBidder != address(0)) {
        // If there's a highest bidder, transfer the NFT to them
        _transfer(address(this), a.highestBidder, tokenId);
        // Send the highest bid amount to the original seller
        payable(seller).transfer(a.highestBid);
        // Emit an event for the completed auction (with winner)
        // NOTE: Make sure your `AuctionEnded` event in the contract also includes `originalSeller` and `auctionEndTime`
        // e.g., `event AuctionEnded(uint256 indexed tokenId, address winner, uint256 amount, address indexed originalSeller, uint256 auctionEndTime);`
        emit AuctionEnded(tokenId, a.highestBidder, a.highestBid, seller, endTime);
    } else {
        // If there were no bids, transfer the NFT back to the original seller
        _transfer(address(this), seller, tokenId);
        // Emit an event for the completed auction (no winner)
        emit AuctionEnded(tokenId, address(0), 0, seller, endTime);
    }

    // --- Reset Auction State for Re-listing ---
    // This is crucial for allowing the same NFT to be put up for auction again.
    // `delete` resets all fields of the `Auction` struct for this `tokenId`
    // to their default values (e.g., `endTime` becomes 0, `highestBidder` becomes address(0)).
    // This makes the `require(auctions[tokenId].endTime == 0, "Auction already exists");` check
    // in `startAuction` pass for future listings of this NFT.
    delete auctions[tokenId];

    // Also clear the original seller from the `auctionSellers` mapping.
    // This prevents stale data and ensures a clean state for subsequent auctions.
    auctionSellers[tokenId] = address(0);
}


    /// @notice Allow losing bidders to withdraw their refund
    function withdrawRefund(uint256 tokenId) external {
        Auction storage auction = auctions[tokenId];
        uint256 amount = auction.bids[msg.sender];
        require(amount > 0, "No refund available");

        auction.bids[msg.sender] = 0;
        payable(msg.sender).transfer(amount);

        emit RefundWithdrawn(tokenId, msg.sender, amount);
    }

    // Utility functions for JSON string handling (left as they were)
    function _getStringValue(bytes memory jsonData, string memory key) internal pure returns (string memory) {
        bytes memory keyBytes = bytes(string(abi.encodePacked('"', key, '"')));
        uint256 start = find(jsonData, keyBytes);
        if (start == 0) {
            return "";
        }
        start += keyBytes.length;
        bytes memory colonBytes = bytes(":");
        start = find(jsonData, colonBytes, start);
        if (start == 0) {
            return "";
        }
        start += colonBytes.length;
        bytes memory quoteBytes = bytes('"');
        start = find(jsonData, quoteBytes, start);
        if (start == 0) {
            return "";
        }
        start++;
        uint256 end = find(jsonData, quoteBytes, start);
        if (end == 0) {
            return "";
        }
        return string(slice(jsonData, start, end - start));
    }

    function find(bytes memory haystack, bytes memory needle, uint256 offset) internal pure returns (uint256) {
        for (uint256 i = offset; i <= haystack.length - needle.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                return i;
            }
        }
        return 0;
    }

    function find(bytes memory haystack, bytes memory needle) internal pure returns (uint256) {
        return find(haystack, needle, 0);
    }

    function slice(bytes memory _bytes, uint256 _start, uint256 _length) internal pure returns (bytes memory) {
        bytes memory temp = new bytes(_length);
        for (uint256 i = 0; i < _length; i++) {
            temp[i] = _bytes[_start + i];
        }
        return temp;
    }

    function substring(string memory str, uint256 start, uint256 len) internal pure returns (string memory) {
    bytes memory bapter = bytes(str);
    bytes memory temp = new bytes(len);
    for (uint256 i = 0; i < len; i++) {
        temp[i] = bapter[start + i]; // Usa `bapter` invece di `b`
    }
    return string(temp);
}

    // Ownership functions (assuming you have an onlyOwner contract or similar logic)
    // If you don’t have onlyOwner, these functions won’t be accessible.
    function setMintingCost(uint256 newCost) external onlyOwner {
        mintingCost = newCost;
    }

    function getMintingCost() external view returns (uint256) {
        return mintingCost;
    }

    function setMaxSupply(uint256 newMaxSupply) public onlyOwner {
        maxSupply = newMaxSupply;
    }

    function getMaxSupply() public view returns (uint256) {
        return maxSupply;
    }
}