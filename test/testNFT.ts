import { expect } from "chai";
import { ethers } from "hardhat";
import { parseUnits } from "ethers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { NFTcontract } from "../typechain-types";
import { VRFCoordinatorV2_5Mock } from "../typechain-types";

describe("NFTcontract", function () {
  let nftContract: NFTcontract;
  let vrfCoordinatorMock: VRFCoordinatorV2_5Mock;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  const keyHash = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
  const callbackGasLimit = 100000;
  const numWords = 1;
  const name = "CityNFT";
  const symbol = "CNFT";
  const initialMintingCost = parseUnits("1", 18);
  const initialMaxSupply = 100;

  async function getRequestId(tx: any): Promise<bigint> {
    const receipt = await tx.wait();
    if (!receipt) throw new Error("Transaction receipt is null");
    const eventLog = receipt.logs.find((log: any) => {
      try {
        const parsed = nftContract.interface.parseLog(log);
        return parsed?.name === "RandomNumberRequested";
      } catch {
        return false;
      }
    });
    if (!eventLog) throw new Error("RandomNumberRequested event not found");
    const parsedEvent = nftContract.interface.parseLog(eventLog);
    return parsedEvent?.args[0] as bigint;
  }

  async function mintNFT(): Promise<bigint> {
    const tx = await nftContract.connect(owner).requestRandomNumber({ value: initialMintingCost });
    const receipt = await tx.wait();
    if (!receipt) throw new Error("Transaction receipt is null");
    const transferLog = receipt.logs.find((log: any) => {
      try {
        const parsed = nftContract.interface.parseLog(log);
        return parsed?.name === "Transfer";
      } catch {
        return false;
      }
    });
    if (!transferLog) throw new Error("Transfer event not found");
    const parsedEvent = nftContract.interface.parseLog(transferLog);
    const tokenId = parsedEvent?.args.tokenId as bigint;
    const requestId = await getRequestId(tx);
    await vrfCoordinatorMock.fulfillRandomWords(requestId, await nftContract.getAddress());
    return tokenId;
  }

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const VRFCoordinatorV2_5MockFactory = await ethers.getContractFactory("VRFCoordinatorV2_5Mock");
    vrfCoordinatorMock = (await VRFCoordinatorV2_5MockFactory.deploy(0, 0, 1e9)) as unknown as VRFCoordinatorV2_5Mock;
    await vrfCoordinatorMock.waitForDeployment();

    const subTx = await vrfCoordinatorMock.createSubscription();
    const subReceipt = await subTx.wait();
    if (!subReceipt) throw new Error("Subscription receipt is null");
    const subLog = subReceipt.logs[0];
    const subEvent = vrfCoordinatorMock.interface.parseLog(subLog);
    if (!subEvent) throw new Error("Subscription event not found");
    const mockSubscriptionId = subEvent.args.subId;

    const fundAmount = ethers.parseUnits("10", 18);
    await vrfCoordinatorMock.fundSubscription(mockSubscriptionId, fundAmount);

    const NFTcontractFactory = await ethers.getContractFactory("NFTcontract");
    nftContract = (await NFTcontractFactory.deploy(
      await vrfCoordinatorMock.getAddress(),
      keyHash,
      callbackGasLimit,
      numWords,
      name,
      symbol,
      mockSubscriptionId,
      initialMintingCost,
      initialMaxSupply
    )) as unknown as NFTcontract;
    await nftContract.waitForDeployment();

    await vrfCoordinatorMock.addConsumer(mockSubscriptionId, await nftContract.getAddress());
  });

  describe("Creare una nuova collezione NFT", function () {
    it("Dovrebbe impostare correttamente l'owner al deployment", async function () {
      expect(await nftContract.owner()).to.equal(owner.address);
    });

    it("Dovrebbe permettere all'owner di mintare un NFT", async function () {
      const tx = await nftContract.connect(owner).requestRandomNumber({ value: initialMintingCost });
      const requestId = await getRequestId(tx);
      await vrfCoordinatorMock.fulfillRandomWords(requestId, await nftContract.getAddress());
      expect(await nftContract.totalMinted()).to.equal(2);
    });

    it("Dovrebbe fallire se l'Ether inviato è insufficiente", async function () {
      await expect(
        nftContract.connect(owner).requestRandomNumber({ value: parseUnits("0.5", 18) })
      ).to.be.revertedWith("Ether inviato insufficiente");
    });

    it("Dovrebbe fallire se si supera il maxSupply", async function () {
      const subTx = await vrfCoordinatorMock.createSubscription();
      const subReceipt = await subTx.wait();
      if (!subReceipt) throw new Error("Subscription receipt is null");
      const subLog = subReceipt.logs[0];
      const subEvent = vrfCoordinatorMock.interface.parseLog(subLog);
      if (!subEvent) throw new Error("Subscription event not found");
      const subId = subEvent.args.subId;

      const smallMaxSupplyContractFactory = await ethers.getContractFactory("NFTcontract");
      const smallMaxSupplyContract = (await smallMaxSupplyContractFactory.deploy(
        await vrfCoordinatorMock.getAddress(),
        keyHash,
        callbackGasLimit,
        numWords,
        name,
        symbol,
        subId,
        initialMintingCost,
        1
      )) as unknown as NFTcontract;
      await smallMaxSupplyContract.waitForDeployment();
      await vrfCoordinatorMock.addConsumer(subId, await smallMaxSupplyContract.getAddress());

      const tx = await smallMaxSupplyContract.connect(owner).requestRandomNumber({ value: initialMintingCost });
      const requestId = await getRequestId(tx);
      await vrfCoordinatorMock.fulfillRandomWords(requestId, await smallMaxSupplyContract.getAddress());

      await expect(
        smallMaxSupplyContract.connect(owner).requestRandomNumber({ value: initialMintingCost })
      ).to.be.revertedWith("Raggiunta la fornitura massima di NFT");
    });
  });

  describe("Trasferire un NFT da un utente a un altro", function () {
    it("Dovrebbe trasferire un NFT con successo", async function () {
      const tx = await nftContract.connect(owner).requestRandomNumber({ value: initialMintingCost });
      const requestId = await getRequestId(tx);
      await vrfCoordinatorMock.fulfillRandomWords(requestId, await nftContract.getAddress());
      const tokenId = 1;
      await nftContract.connect(owner).transferFrom(owner.address, addr1.address, tokenId);
      expect(await nftContract.ownerOf(tokenId)).to.equal(addr1.address);
    });

    it("Dovrebbe fallire se non sei il proprietario", async function () {
      const tx = await nftContract.connect(owner).requestRandomNumber({ value: initialMintingCost });
      const requestId = await getRequestId(tx);
      await vrfCoordinatorMock.fulfillRandomWords(requestId, await nftContract.getAddress());
      const tokenId = 1;
      const price = parseUnits("2", 18);
      await expect(
        nftContract.connect(addr1).listForSale(tokenId, price)
      ).to.be.revertedWith("Non sei il proprietario");
    });

    it("Dovrebbe trasferire un NFT dopo approvazione", async function () {
      const tx = await nftContract.connect(owner).requestRandomNumber({ value: initialMintingCost });
      const requestId = await getRequestId(tx);
      await vrfCoordinatorMock.fulfillRandomWords(requestId, await nftContract.getAddress());
      const tokenId = 1;
      await nftContract.connect(owner).approve(addr1.address, tokenId);
      await nftContract.connect(addr1).transferFrom(owner.address, addr2.address, tokenId);
      expect(await nftContract.ownerOf(tokenId)).to.equal(addr2.address);
    });
  });

  describe("Impostare il prezzo per l’acquisto di un NFT", function () {
    it("Dovrebbe permettere all'owner di mettere in vendita un NFT", async function () {
      const tx = await nftContract.connect(owner).requestRandomNumber({ value: initialMintingCost });
      const requestId = await getRequestId(tx);
      await vrfCoordinatorMock.fulfillRandomWords(requestId, await nftContract.getAddress());
      const tokenId = 1;
      const price = parseUnits("2", 18);
      await nftContract.connect(owner).listForSale(tokenId, price);
      expect(await nftContract.isForSale(tokenId)).to.equal(true);
      expect(await nftContract.tokenPrices(tokenId)).to.equal(price);
    });

    it("Dovrebbe fallire se il prezzo è zero", async function () {
      const tx = await nftContract.connect(owner).requestRandomNumber({ value: initialMintingCost });
      const requestId = await getRequestId(tx);
      await vrfCoordinatorMock.fulfillRandomWords(requestId, await nftContract.getAddress());
      const tokenId = 1;
      await expect(
        nftContract.connect(owner).listForSale(tokenId, 0)
      ).to.be.revertedWith("Il prezzo deve essere maggiore di zero");
    });
  });

  describe("Permettere all’utente di acquistare un NFT", function () {
    it("Dovrebbe permettere l'acquisto di un NFT", async function () {
      const tx = await nftContract.connect(owner).requestRandomNumber({ value: initialMintingCost });
      const requestId = await getRequestId(tx);
      await vrfCoordinatorMock.fulfillRandomWords(requestId, await nftContract.getAddress());
      const tokenId = 1;
      const price = parseUnits("2", 18);
      await nftContract.connect(owner).listForSale(tokenId, price);
      await nftContract.connect(addr1).buyNFT(tokenId, { value: price });
      expect(await nftContract.ownerOf(tokenId)).to.equal(addr1.address);
    });
  });

  describe("Auction functionality", function () {
    let tokenId: bigint;

    beforeEach(async function () {
      tokenId = await mintNFT();
    });

    it("Should allow the owner to start an auction", async function () {
      const duration = 3600; // 1 ora
      await nftContract.connect(owner).startAuction(tokenId, duration);
      const auction = await nftContract.auctions(tokenId);
      expect(auction.endTime).to.be.gt(0);
      expect(await nftContract.ownerOf(tokenId)).to.equal(await nftContract.getAddress());
    });

    it("Should fail to start an auction if not the owner of the token", async function () {
      await nftContract.connect(owner).transferFrom(owner.address, addr1.address, tokenId);
      await expect(nftContract.connect(owner).startAuction(tokenId, 3600)).to.be.revertedWith("Non sei il proprietario");
    });

    it("Should fail to start an auction if not the contract owner", async function () {
      await expect(nftContract.connect(addr1).startAuction(tokenId, 3600)).to.be.revertedWith("Only callable by owner");
    });

    it("Should fail to start an auction if one already exists", async function () {
      await nftContract.connect(owner).startAuction(tokenId, 3600);
      await expect(nftContract.connect(owner).startAuction(tokenId, 3600)).to.be.revertedWith("Non sei il proprietario");
    });

    it("Should allow placing bids", async function () {
      const duration = 3600;
      await nftContract.connect(owner).startAuction(tokenId, duration);
      const bidAmount1 = parseUnits("1", 18);
      await nftContract.connect(addr1).bid(tokenId, { value: bidAmount1 });
      const auctionAfterFirstBid = await nftContract.auctions(tokenId);
      expect(auctionAfterFirstBid.highestBidder).to.equal(addr1.address);
      expect(auctionAfterFirstBid.highestBid).to.equal(bidAmount1);

      const bidAmount2 = parseUnits("2", 18);
      await nftContract.connect(addr2).bid(tokenId, { value: bidAmount2 });
      const auctionAfterSecondBid = await nftContract.auctions(tokenId);
      expect(auctionAfterSecondBid.highestBidder).to.equal(addr2.address);
      expect(auctionAfterSecondBid.highestBid).to.equal(bidAmount2);
    });

    it("Should fail to place a bid if auction doesn't exist", async function () {
      await expect(nftContract.connect(addr1).bid(tokenId, { value: parseUnits("1", 18) })).to.be.revertedWith("Asta non esistente");
    });

    it("Should fail to place a bid if auction has ended", async function () {
      const duration = 3600;
      await nftContract.connect(owner).startAuction(tokenId, duration);
      await ethers.provider.send("evm_increaseTime", [duration + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(nftContract.connect(addr1).bid(tokenId, { value: parseUnits("1", 18) })).to.be.revertedWith("Asta terminata");
    });

    it("Should fail to place a bid if bid amount is not higher", async function () {
      const duration = 3600;
      await nftContract.connect(owner).startAuction(tokenId, duration);
      await nftContract.connect(addr1).bid(tokenId, { value: parseUnits("1", 18) });
      await expect(nftContract.connect(addr2).bid(tokenId, { value: parseUnits("0.5", 18) })).to.be.revertedWith("Offerta troppo bassa");
    });

    it("Should allow owner to finalize auction and transfer NFT to winner", async function () {
      const duration = 3600;
      await nftContract.connect(owner).startAuction(tokenId, duration);
      const bidAmount = parseUnits("1", 18);
      await nftContract.connect(addr1).bid(tokenId, { value: bidAmount });
      await ethers.provider.send("evm_increaseTime", [duration + 1]);
      await ethers.provider.send("evm_mine", []);
      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
      await nftContract.connect(owner).finalizeAuction(tokenId);
      expect(await nftContract.ownerOf(tokenId)).to.equal(addr1.address);
      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerBalanceAfter).to.be.gt(ownerBalanceBefore);
    });

    it("Should allow owner to finalize auction with no bids, returning NFT to owner", async function () {
      const duration = 3600;
      await nftContract.connect(owner).startAuction(tokenId, duration);
      await ethers.provider.send("evm_increaseTime", [duration + 1]);
      await ethers.provider.send("evm_mine", []);
      await nftContract.connect(owner).finalizeAuction(tokenId);
      expect(await nftContract.ownerOf(tokenId)).to.equal(owner.address);
    });

    it("Should allow losing bidders to withdraw refunds", async function () {
      const duration = 3600;
      await nftContract.connect(owner).startAuction(tokenId, duration);
      const bidAmount1 = parseUnits("1", 18);
      await nftContract.connect(addr1).bid(tokenId, { value: bidAmount1 });
      const bidAmount2 = parseUnits("2", 18);
      await nftContract.connect(addr2).bid(tokenId, { value: bidAmount2 });
      await ethers.provider.send("evm_increaseTime", [duration + 1]);
      await ethers.provider.send("evm_mine", []);
      await nftContract.connect(owner).finalizeAuction(tokenId);
      const addr1BalanceBefore = await ethers.provider.getBalance(addr1.address);
      await nftContract.connect(addr1).withdrawRefund(tokenId);
      const addr1BalanceAfter = await ethers.provider.getBalance(addr1.address);
      expect(addr1BalanceAfter).to.be.gt(addr1BalanceBefore);
    });

    it("Should not allow the winner to withdraw a refund", async function () {
      const duration = 3600;
      await nftContract.connect(owner).startAuction(tokenId, duration);
      const bidAmount = parseUnits("1", 18);
      await nftContract.connect(addr1).bid(tokenId, { value: bidAmount });
      await ethers.provider.send("evm_increaseTime", [duration + 1]);
      await ethers.provider.send("evm_mine", []);
      await nftContract.connect(owner).finalizeAuction(tokenId);
      await expect(nftContract.connect(addr1).withdrawRefund(tokenId)).to.be.revertedWith("Nessun rimborso disponibile");
    });

    it("Should fail to finalize auction before it ends", async function () {
      const duration = 3600;
      await nftContract.connect(owner).startAuction(tokenId, duration);
      await expect(nftContract.connect(owner).finalizeAuction(tokenId)).to.be.revertedWith("Asta non ancora terminata");
    });
  });
});