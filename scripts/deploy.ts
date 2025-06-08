import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const pk = process.env.PRIVATE_KEY!;
  if (!pk.startsWith("0x")) throw new Error("PK non valida");

  const provider = ethers.provider;
  const deployer = new ethers.Wallet(pk, provider);
  console.log("🚀 Deploying with account:", deployer.address);

  const rawSubId = process.env.VRF_SUBSCRIPTION_ID!;
  if (!rawSubId) throw new Error("VRF_SUBSCRIPTION_ID non trovato in .env");

  // Converti in BigInt nativo
  const subscriptionId = BigInt(rawSubId);

  const initialMintingCost = ethers.parseEther("0.01");
  const initialMaxSupply   = 15;

  const VRF_COORDINATOR    = "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B";
  const KEY_HASH           = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae";
  const CALLBACK_GAS_LIMIT = 900_000;
  const NUM_WORDS          = 1;

  const NFTFactory = await ethers.getContractFactory("NFTcontract", deployer);
  const nftContract = await NFTFactory.deploy(
    VRF_COORDINATOR,
    KEY_HASH,
    CALLBACK_GAS_LIMIT,
    NUM_WORDS,
    "Moove City Explorer NFT",
    "MOOVE",
    subscriptionId,       // BigInt -> verrà trattato come BigNumber
    initialMintingCost,
    initialMaxSupply
  );
  await nftContract.waitForDeployment();
  console.log("✅ NFTContract deployed to:", await nftContract.getAddress());

  const coordAbi = ["function addConsumer(uint256 subId, address consumer) external"];
  const coordinator = new ethers.Contract(VRF_COORDINATOR, coordAbi, deployer);
  await (await coordinator.addConsumer(subscriptionId, await nftContract.getAddress())).wait();
  console.log(`🔗 Added consumer ${await nftContract.getAddress()} to subscription ${rawSubId}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
