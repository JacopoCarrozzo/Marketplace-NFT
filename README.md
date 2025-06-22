# Moove-NFT Smart Contract

## Descrizione

Questo repository contiene il codice del contratto intelligente `NFTcontract`, componente principale della DApp **Moove-NFT**. La DApp consente agli utenti di acquistare, vendere e partecipare ad aste per NFT unici della collezione **"Moove-NFT"**, dove ogni NFT rappresenta una città europea con una descrizione generata casualmente tramite Chainlink VRF.

## Funzionalità Principali

* **Minting di NFT**: creazione di nuovi NFT pagando un costo di minting. Ogni NFT è associato a una città europea scelta casualmente.
* **Vendita di NFT**: i proprietari possono mettere in vendita i loro NFT a un prezzo fisso.
* **Acquisto di NFT**: acquisto di NFT listati inviando l'importo richiesto.
* **Aste di NFT**: avvio di aste per NFT, con offerte concorrenti. L'asta termina dopo un periodo definito e il miglior offerente vince l'NFT.
* **Generazione Casuale**: utilizzo di Chainlink VRF per associare città agli NFT in modo verificabile.

## Prerequisiti

Assicurati di avere installato:

* **Solidity**: versione ^0.8.20
* **OpenZeppelin**: libreria per ERC721 e utilità (Counters, Strings)
* **Chainlink VRF**: per la generazione di numeri casuali
* **Hardhat** o **Truffle**: per sviluppo, test e deployment
* **Node.js** e **npm**: per la gestione delle dipendenze

---

## Installazione e Configurazione

### 1. Clonare il Repository

```bash
git clone https://github.com/tuo_username/moove-nft.git
cd moove-nft
```

### 2. Installare le Dipendenze

```bash
npm install
```

### 3. Configurare l'Ambiente

Crea un file `.env` nella root del progetto con le seguenti variabili:

```
INFURA_API_KEY=la_tua_infura_key
MNEMONIC="twelve words del tuo wallet"
SUBSCRIPTION_ID=il_tuo_subscription_id_chainlink
```

### 4. Compilare il Contratto

```bash
npx hardhat compile
```

---

## Utilizzo del Contratto

### Deployment

Per deployare il contratto, utilizza uno script (es. `scripts/deploy.js`) con i parametri seguenti:

```js
async function main() {
  const NFTcontract = await ethers.getContractFactory("NFTcontract");
  const nft = await NFTcontract.deploy(
    "<VRF_COORDINATOR_ADDRESS>",
    "<KEY_HASH>",
    100000,            // callbackGasLimit
    1,                 // numWords
    "Moove-NFT",      // name
    "MNFT",          // symbol
    process.env.SUBSCRIPTION_ID,
    ethers.utils.parseEther("0.1"), // initialMintingCost
    100                // initialMaxSupply
  );

  await nft.deployed();
  console.log("Moove-NFT deployed at:", nft.address);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
```

Esegui:

```bash
npx hardhat run scripts/deploy.js --network <network>
```

### Minting di NFT

```solidity
function requestRandomNumber() public payable onlyOwner
```

**Requisiti**:

* Invio di almeno `mintingCost` in Ether
* Totale mintati < `maxSupply`

### Listing per la Vendita

```solidity
function listForSale(uint256 tokenId, uint256 price) external
```

**Parametri**:

* `tokenId`: ID del token
* `price`: prezzo in wei

**Requisiti**:

* Devi essere il proprietario
* `price` > 0
* Token non già in vendita

### Acquisto di NFT

```solidity
function buyNFT(uint256 tokenId) external payable
```

**Requisiti**:

* Token deve essere in vendita
* Invio di almeno il prezzo richiesto

### Aste di NFT

#### 1. Avvio dell'Asta

```solidity
function startAuction(uint256 tokenId, uint256 durationInSeconds) external onlyOwner
```

* `tokenId`: ID del token
* `durationInSeconds`: durata dell'asta in secondi

#### 2. Offerte

```solidity
function bid(uint256 tokenId) external payable
```

* L'asta deve essere attiva
* L'offerta deve superare la più alta precedente

#### 3. Chiusura dell'Asta

```solidity
function finalizeAuction(uint256 tokenId) external onlyOwner
```

* L'asta deve essere terminata
* Solo il proprietario o il vincitore può chiamare

#### 4. Ritiro dei Rimborsi

```solidity
function withdrawRefund(uint256 tokenId) external
```

* Devi avere un rimborso disponibile

---

## Dettagli Tecnici

* **Chainlink VRF**: genera numeri casuali per selezionare città da un array `CityData`.
* **Gestione delle Città**: array predefinito di città europee e descrizioni.
* **Logica delle Aste**: NFT in escrow durante l'asta; gestione fondi sicura.

## Eventi

* `RandomNumberRequested(uint256 tokenId, uint256 requestId)`
* `RandomNumberFulfilled(uint256 tokenId, uint256 randomNumber)`
* `TokenMinted(uint256 tokenId)`
* `NFTListedForSale(uint256 tokenId, uint256 price, address seller)`
* `NFTPurchased(uint256 tokenId, address buyer, uint256 price)`
* `AuctionStarted(uint256 tokenId, uint256 endTime)`
* `NewBid(uint256 tokenId, address bidder, uint256 amount)`
* `AuctionEnded(uint256 tokenId, address winner, uint256 amount)`
* `RefundWithdrawn(uint256 tokenId, address bidder, uint256 amount)`

## Funzioni Pubbliche Principali

* `requestRandomNumber()`
* `listForSale(uint256 tokenId, uint256 price)`
* `buyNFT(uint256 tokenId)`
* `startAuction(uint256 tokenId, uint256 durationInSeconds)`
* `bid(uint256 tokenId)`
* `finalizeAuction(uint256 tokenId)`
* `withdrawRefund(uint256 tokenId)`
* `tokenURI(uint256 tokenId)`
* `getTokenMetadata(uint256 tokenId)`

## Considerazioni sulla Sicurezza

* **Gestione dei Fondi**: trasferimenti di Ether eseguiti dopo aggiornamento di stato per prevenire reentrancy.
* **Proprietà**: solo i proprietari possono eseguire azioni sui loro NFT.
* **Escrow**: NFT custoditi dal contratto durante vendite e aste.

## Licenza

Rilasciato sotto licenza **MIT**. Vedi il file `LICENSE` per i dettagli.
