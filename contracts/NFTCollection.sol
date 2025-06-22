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
    // Mapping per salvare chi è il venditore “reale” quando l’NFT è in escrow
    mapping(uint256 => address) public sellers;

    struct Auction {
        uint256 tokenId;
        uint256 endTime;
        address highestBidder;
        uint256 highestBid;
        bool ended;
        mapping(address => uint256) bids; // saldo rimborsi per ciascun offerente
    }
    // Mapping da tokenId a Auction
    mapping(uint256 => Auction) public auctions;

    // Eventi
    event RandomNumberRequested (uint256 indexed tokenId, uint256 requestId);
    event RandomNumberFulfilled (uint256 indexed tokenId, uint256 randomNumber);
    event TokenMinted (uint256 indexed tokenId);
    event DebugRequestId(uint256 requestId);
    event NFTMetadata(uint256 indexed tokenId, string name, string description, string city, string luckyNumber, string tourChance);
    event NFTListedForSale(uint256 indexed tokenId, uint256 price, address indexed seller);
    event NFTPurchased(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event AuctionStarted(uint256 indexed tokenId, uint256 endTime);
    event NewBid(uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event AuctionEnded(uint256 indexed tokenId, address winner, uint256 amount);
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
        // Verifica che numWords sia maggiore di zero
        require(numWords_ > 0, "numWords must be > 0");

        vrfCoordinator   = vrfCoordinator_;
        s_keyHash        = keyHash_;
        callbackGasLimit = callbackGasLimit_;
        numWords         = numWords_;
        s_subscriptionId = subscriptionId_;

        mintingCost = initialMintingCost;
        maxSupply   = initialMaxSupply;

        _tokenIdCounter.increment(); // Inizia da 1, se vuoi che il primo ID sia 0 rimuovi questa riga.

        // Inizializzazione delle città
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
        require(owner == msg.sender, "Non sei il proprietario");
        require(price > 0, "Il prezzo deve essere maggiore di zero");
        require(!isForSale[tokenId], "Gia in vendita");

        // 1) Sposta fisicamente l'NFT dal venditore al contratto
        _transfer(owner, address(this), tokenId);

        // 2) Salva il venditore “reale” in mappatura
        sellers[tokenId] = owner;

        // 3) Imposta lo stato “in vendita” e il prezzo
        isForSale[tokenId] = true;
        tokenPrices[tokenId] = price;

        emit NFTListedForSale(tokenId, price, owner);
    }

    function buyNFT(uint256 tokenId) external payable {
        require(isForSale[tokenId], "Questo NFT non e' in vendita");
        uint256 price = tokenPrices[tokenId];
        require(msg.value >= price, "Fondi insufficienti");

        address seller = sellers[tokenId];
        require(seller != address(0), "Venditore non valido");

        // 1) Togli lo stato “in vendita” per evitare rientri
        isForSale[tokenId] = false;
        tokenPrices[tokenId] = 0;
        sellers[tokenId] = address(0);

        // 2) Trasferisci l’NFT dal contratto al compratore
        _transfer(address(this), msg.sender, tokenId);
         address buyer = msg.sender;


        // 3) Invia i fondi al venditore originale
        (bool sent, ) = payable(seller).call{ value: price }("");
        require(sent, "Trasferimento fondi fallito");

        // Se chi ha chiamato ha inviato più del prezzo, rimandiamo il resto
        if (msg.value > price) {
            uint256 diff = msg.value - price;
            (bool refundSent, ) = payable(msg.sender).call{ value: diff }("");
            require(refundSent, "Rimborso fallito");
        }

        emit NFTPurchased(tokenId, msg.sender, price);

        if (msg.value > price) {
        uint256 diff = msg.value - price;
        (bool refundSent, ) = payable(buyer).call{ value: diff }("");
        require(refundSent, "Rimborso fallito");
    }

    }

    function totalMinted() public view returns (uint256) {
        return _tokenIdCounter.current();
    }

    function requestRandomNumber() public payable onlyOwner {
        require(msg.value >= mintingCost, "Ether inviato insufficiente");
        require(_tokenIdCounter.current() <= maxSupply, "Raggiunta la fornitura massima di NFT");

        uint256 currentTokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(msg.sender, currentTokenId);
        _randomNumbers[currentTokenId] = UNSET;

        uint256 requestId;
        // Chiamata standard per VRF v2.5 con la struct RandomWordsRequest
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
            // Se la chiamata fallisce, revert con il messaggio d'errore.
            // NON si deve tornare all'interfaccia vecchia/deprecata.
            revert(string(abi.encodePacked("Random number request failed: ", reason)));
        }

        _requestIdToTokenId[requestId] = currentTokenId;
        _requestIdFulfilled[requestId] = false;

        emit RandomNumberRequested(currentTokenId, requestId);
        emit DebugRequestId(requestId);
    }


    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        require(_requestIdToTokenId[requestId] > 0, "Richiesta non valida ");
        require(!_requestIdFulfilled[requestId], "Richiesta eseguita");
        require(randomWords.length > 0, "Nessun numero casuale ricevuto");

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
        emit TokenMinted(tokenId); // Emetti questo evento solo dopo che tutti i metadati sono impostati.
    }

    function tokenURI (uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) { revert("Token non esistente"); }
        require (_randomNumbers[tokenId] != UNSET, "Metadati non ancora generati");
        return _tokenURIs[tokenId];
    }

    function getRandomResult(uint256 tokenId) external view returns (uint256) {
        if (_ownerOf(tokenId) == address(0)) revert("Token non esistente");
        uint256 rnd = _randomNumbers[tokenId];
        if (rnd == UNSET) {
            return 0; // Se non è stato ancora generato il numero casuale, ritorna 0 (o un altro valore sentinella)
        }
        return rnd;
    }

    function getCityAndDescription(uint256 randomNumber) internal view returns (string memory city, string memory description) {
        require(randomNumber < cities.length, "Numero casuale non valido");
        CityData memory data = cities[randomNumber];
        return (data.city, string(abi.encodePacked("A unique NFT representing the city of ", data.city, ". ", data.description)));
    }

    function getTokenMetadata(uint256 tokenId) public view returns (string memory name, string memory description, string memory city, string memory luckyNumber, string memory tourChance) {
        if (_ownerOf(tokenId) == address(0)) {
            revert("Token non esistente");
        }
        require(_randomNumbers[tokenId] != UNSET, "Metadati non ancora generati");

        name = _tokenNames[tokenId];
        description = _tokenDescriptions[tokenId];
        city = _tokenCities[tokenId];
        luckyNumber = Strings.toString(_tokenLuckyNumbers[tokenId]);
        tourChance = _tokenTourChances[tokenId];
    }

    function startAuction(uint256 tokenId, uint256 durationInSeconds) external onlyOwner {
        // Controlla che il token esista e che non ci sia già un'asta aperta
        require(ownerOf(tokenId) == msg.sender, "Non sei il proprietario");
        require(auctions[tokenId].endTime == 0, "Asta esistente");

        // Trasferisci l’NFT in escrow al contratto
        _transfer(msg.sender, address(this), tokenId);

        // Imposta i parametri dell’asta
        Auction storage auction = auctions[tokenId];
        auction.tokenId = tokenId;
        auction.endTime = block.timestamp + durationInSeconds;
        auction.highestBidder = address(0);
        auction.highestBid = 0;
        auction.ended = false;

        emit AuctionStarted(tokenId, auction.endTime);
    }

    /// @notice Effettua un’offerta per l’asta di un token
    function bid(uint256 tokenId) external payable {
        Auction storage auction = auctions[tokenId];
        require(auction.endTime != 0, "Asta non esistente");
        require(block.timestamp < auction.endTime, "Asta terminata");
        require(msg.value > auction.highestBid, "Offerta troppo bassa");

        // Se esiste già un highestBidder, accumula il rimborso
        if (auction.highestBidder != address(0)) {
            auction.bids[auction.highestBidder] += auction.highestBid;
        }

        auction.highestBid = msg.value;
        auction.highestBidder = msg.sender;

        emit NewBid(tokenId, msg.sender, msg.value);
    }

    /// @notice Conclude l’asta, trasferisce NFT al vincitore e invia l’Ether all’owner
   function finalizeAuction(uint256 tokenId) external onlyOwner {
    Auction storage a = auctions[tokenId];

    // 2) Copio in variabili locali (in “memory” / stack) i campi che mi servono
    uint256 endTime       = a.endTime;
    address highestBidder = a.highestBidder;
    uint256 highestBid    = a.highestBid;
    bool    alreadyEnded  = a.ended;

    // 3) Tutti i require su variabili locali
    require(endTime != 0,                           "Asta non esistente");
    require(msg.sender == owner() 
         || msg.sender == highestBidder,            "Solo owner o vincitore");
    require(block.timestamp >= endTime,              "Asta non ancora terminata");
    require(!alreadyEnded,                           "Asta conclusa");

    // 4) Unica scrittura in storage
    a.ended = true;

    // --- Ora uso le copie locali per fare trasferimenti ed eventi ---
    if (highestBidder != address(0)) {
        _transfer(address(this), highestBidder, tokenId);
        payable(owner()).transfer(highestBid);
        emit AuctionEnded(tokenId, highestBidder, highestBid);
    } else {
        _transfer(address(this), owner(), tokenId);
        emit AuctionEnded(tokenId, address(0), 0);
    }
}


    /// @notice Permette a chi ha fatto offerte perdenti di ritirare il rimborso
    function withdrawRefund(uint256 tokenId) external {
        Auction storage auction = auctions[tokenId];
        uint256 amount = auction.bids[msg.sender];
        require(amount > 0, "Nessun rimborso disponibile");

        auction.bids[msg.sender] = 0;
        payable(msg.sender).transfer(amount);

        emit RefundWithdrawn(tokenId, msg.sender, amount);
    }

    // Funzioni di utilità per la gestione delle stringhe JSON (le ho lasciate come le avevi)
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
        bytes memory b = bytes(str);
        bytes memory temp = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            temp[i] = b[start + i];
        }
        return string(temp);
    }

    // Funzioni di proprietà (assumo tu abbia un contratto per onlyOwner o una logica simile)
    // Se non hai onlyOwner, queste funzioni non saranno accessibili.
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