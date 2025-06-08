Moove-NFT Smart Contract
Questo repository contiene il codice del contratto intelligente NFTcontract, parte della DApp Moove-NFT. La DApp consente agli utenti di acquistare, vendere e partecipare ad aste per NFT unici della collezione "Moove-NFT". Ogni NFT rappresenta una città europea con una descrizione unica, generata casualmente tramite Chainlink VRF.
Funzionalità Principali

Minting di NFT: Gli utenti possono creare nuovi NFT pagando un costo di minting. Ogni NFT è associato a una città europea scelta casualmente.
Vendita di NFT: I proprietari possono listare i loro NFT per la vendita a un prezzo fisso.
Acquisto di NFT: Gli utenti possono acquistare NFT listati inviando l'importo richiesto.
Aste di NFT: I proprietari possono avviare aste per i loro NFT, permettendo offerte. L'asta si conclude dopo un periodo definito, e il miglior offerente vince l'NFT.
Generazione Casuale: Chainlink VRF genera numeri casuali per associare città agli NFT in modo verificabile.

Prerequisiti
Per interagire con il contratto, servono i seguenti strumenti e librerie:

Solidity: Versione ^0.8.20.
OpenZeppelin: Per ERC721 e utilità come Counters e Strings.
Chainlink VRF: Per la generazione di numeri casuali.
Hardhat o Truffle: Per sviluppo, test e deployment.
Node.js e npm: Per gestire le dipendenze.

Installazione e Configurazione

Clona il Repository:
git clone https://github.com/tuo_username/moove-nft.git
cd moove-nft


Installa le Dipendenze:
npm install


Configura l'Ambiente:

Crea un file .env con:
Chiave API di Infura o altro provider Ethereum.
Mnemonic del wallet.
Subscription ID di Chainlink VRF.




Compila il Contratto:
npx hardhat compile



Utilizzo del Contratto
Deployment
Per deployare il contratto, usa i seguenti parametri:

vrfCoordinator: Indirizzo del coordinatore VRF di Chainlink.
keyHash: Hash della chiave VRF.
callbackGasLimit: Limite di gas per la callback VRF.
numWords: Numero di parole casuali da generare.
name: Nome della collezione (es. "Moove-NFT").
symbol: Simbolo della collezione (es. "MNFT").
subscriptionId: ID della subscription Chainlink VRF.
initialMintingCost: Costo iniziale di minting (in wei).
initialMaxSupply: Fornitura massima di NFT.

Esempio di script di deployment con Hardhat:
const NFTcontract = await ethers.getContractFactory("NFTcontract");
const nft = await NFTcontract.deploy(
  "indirizzo_vrfCoordinator",
  "keyHash",
  100000, // callbackGasLimit
  1, // numWords
  "Moove-NFT",
  "MNFT",
  subscriptionId,
  ethers.utils.parseEther("0.1"), // 0.1 ETH
  100 // maxSupply
);
await nft.deployed();

Minting di NFT
Richiedi un nuovo NFT con:
function requestRandomNumber() public payable onlyOwner


Requisiti:
Invia almeno mintingCost in Ether.
Il totale di NFT mintati deve essere inferiore a maxSupply.



Listing per la Vendita
Lista un NFT per la vendita:
function listForSale(uint256 tokenId, uint256 price) external


Parametri:
tokenId: ID del token.
price: Prezzo in wei.


Requisiti:
Devi essere il proprietario.
Il prezzo deve essere > 0.
Il token non deve essere già in vendita.



Acquisto di NFT
Acquista un NFT listato:
function buyNFT(uint256 tokenId) external payable


Requisiti:
Il token deve essere in vendita.
Invia almeno il prezzo richiesto.



Avvio di un'Asta
Avvia un'asta per un NFT:
function startAuction(uint256 tokenId, uint256 durationInSeconds) external onlyOwner


Parametri:
tokenId: ID del token.
durationInSeconds: Durata dell'asta.


Requisiti:
Devi essere il proprietario.
Non deve esserci un'asta attiva.



Partecipazione a un'Asta
Fai un'offerta:
function bid(uint256 tokenId) external payable


Requisiti:
L'asta deve essere attiva.
L'offerta deve superare quella più alta.



Conclusione di un'Asta
Concludi un'asta:
function finalizeAuction(uint256 tokenId) external onlyOwner


Requisiti:
L'asta deve essere terminata.
Solo il proprietario o il vincitore può chiamare.



Ritiro dei Rimborsi
Ritira un rimborso dopo un'asta:
function withdrawRefund(uint256 tokenId) external


Requisiti:
Devi avere un rimborso disponibile.



Dettagli Tecnici

Chainlink VRF: Genera numeri casuali per selezionare una città da un array di CityData.
Gestione delle Città: Un array predefinito contiene città e descrizioni. Ogni NFT è associato a una città univoca.
Logica delle Aste: Gli NFT sono trasferiti al contratto come escrow durante l'asta. I fondi sono gestiti in modo sicuro.

Eventi

RandomNumberRequested(uint256 tokenId, uint256 requestId): Richiesta di un numero casuale.
RandomNumberFulfilled(uint256 tokenId, uint256 randomNumber): Numero casuale ricevuto.
TokenMinted(uint256 tokenId): NFT mintato.
NFTListedForSale(uint256 tokenId, uint256 price, address seller): NFT listato per la vendita.
NFTPurchased(uint256 tokenId, address buyer, uint256 price): NFT acquistato.
AuctionStarted(uint256 tokenId, uint256 endTime): Asta avviata.
NewBid(uint256 tokenId, address bidder, uint256 amount): Nuova offerta.
AuctionEnded(uint256 tokenId, address winner, uint256 amount): Asta conclusa.
RefundWithdrawn(uint256 tokenId, address bidder, uint256 amount): Rimborso ritirato.

Funzioni Pubbliche Principali

requestRandomNumber(): Richiede un NFT.
listForSale(uint256 tokenId, uint256 price): Lista un NFT.
buyNFT(uint256 tokenId): Acquista un NFT.
startAuction(uint256 tokenId, uint256 durationInSeconds): Avvia un'asta.
bid(uint256 tokenId): Fa un'offerta.
finalizeAuction(uint256 tokenId): Conclude un'asta.
withdrawRefund(uint256 tokenId): Ritira un rimborso.
tokenURI(uint256 tokenId): Restituisce l'URI del token.
getTokenMetadata(uint256 tokenId): Restituisce i metadati.

Considerazioni sulla Sicurezza

Gestione dei Fondi: I trasferimenti di Ether sono eseguiti dopo l'aggiornamento dello stato per evitare reentrancy.
Proprietà: Solo i proprietari possono eseguire azioni sui loro NFT.
Escrow: Durante vendite e aste, gli NFT sono custoditi dal contratto.

Licenza
Questo progetto è rilasciato sotto la licenza MIT. Vedi il file LICENSE per dettagli.
