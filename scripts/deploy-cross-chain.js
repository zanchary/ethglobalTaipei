// Script to deploy the cross-chain payment system
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Target chain (World Chain) deployment
  // In real deployment, you'd use different networks for each chain
  console.log("Deploying to World Chain (target chain)...");

  // Deploy the NFT contract
  const EventTicketNFT = await hre.ethers.getContractFactory("EventTicketNFT");
  const ticketNFT = await EventTicketNFT.deploy();
  await ticketNFT.waitForDeployment();
  console.log("EventTicketNFT deployed to:", await ticketNFT.getAddress());

  // Deploy the World ID Verifier
  const WorldIDVerifier = await hre.ethers.getContractFactory("WorldIDVerifier");
  // Use a mock WorldID contract for testing
  const mockWorldID = await hre.ethers.deployContract("MockWorldID");
  await mockWorldID.waitForDeployment();
  
  const worldIDVerifier = await WorldIDVerifier.deploy(
    await mockWorldID.getAddress(),
    "worldtickets.app" // App ID
  );
  await worldIDVerifier.waitForDeployment();
  console.log("WorldIDVerifier deployed to:", await worldIDVerifier.getAddress());

  // Deploy the Cross-Chain Bridge
  const CrossChainBridge = await hre.ethers.getContractFactory("CrossChainBridge");
  const crossChainBridge = await CrossChainBridge.deploy();
  await crossChainBridge.waitForDeployment();
  const crossChainBridgeAddress = await crossChainBridge.getAddress();
  console.log("CrossChainBridge deployed to:", crossChainBridgeAddress);

  // Deploy the Mock Relayer
  const MockRelayer = await hre.ethers.getContractFactory("MockRelayer");
  // 将地址转换为payable
  const mockRelayer = await MockRelayer.deploy(crossChainBridgeAddress);
  await mockRelayer.waitForDeployment();
  console.log("MockRelayer deployed to:", await mockRelayer.getAddress());

  // Deploy the main EventTicketing contract
  const EventTicketing = await hre.ethers.getContractFactory("EventTicketing");
  const eventTicketing = await EventTicketing.deploy(
    await ticketNFT.getAddress(),
    await worldIDVerifier.getAddress(),
    crossChainBridgeAddress // 这是payable的
  );
  await eventTicketing.waitForDeployment();
  console.log("EventTicketing deployed to:", await eventTicketing.getAddress());

  // Set up permissions
  // Grant MINTER_ROLE to the EventTicketing contract
  const minterRole = await ticketNFT.MINTER_ROLE();
  await ticketNFT.grantRole(minterRole, await eventTicketing.getAddress());
  console.log("Granted MINTER_ROLE to EventTicketing contract");

  // Set trusted relayer in the CrossChainBridge
  // For this example, we're setting up for Polygon (chainId 137)
  await crossChainBridge.addTrustedRelayer(137, await mockRelayer.getAddress());
  console.log("Added MockRelayer as trusted relayer for Polygon");

  // Set exchange rate for Polygon (example: 1 MATIC = 0.0004 ETH, so rate = 4)
  await crossChainBridge.setExchangeRate(137, 4);
  console.log("Set exchange rate for Polygon");

  // Source chain deployment (would be on a different network in production)
  console.log("\nDeploying to source chain (Polygon)...");
  
  // Deploy the SourceChainPayment contract
  const SourceChainPayment = await hre.ethers.getContractFactory("SourceChainPayment");
  const sourceChainPayment = await SourceChainPayment.deploy(
    137, // Polygon chain ID
    await mockRelayer.getAddress() // In real deployment, this would be the source chain relayer
  );
  await sourceChainPayment.waitForDeployment();
  console.log("SourceChainPayment deployed to:", await sourceChainPayment.getAddress());

  // Add trusted source chain to relayer
  await mockRelayer.addTrustedSourceChain(137);
  console.log("Added Polygon as trusted source chain in MockRelayer");

  console.log("\nDeployment complete!");
  console.log("\nContract addresses:");
  console.log("EventTicketNFT:", await ticketNFT.getAddress());
  console.log("WorldIDVerifier:", await worldIDVerifier.getAddress());
  console.log("CrossChainBridge:", await crossChainBridge.getAddress());
  console.log("MockRelayer:", await mockRelayer.getAddress());
  console.log("EventTicketing:", await eventTicketing.getAddress());
  console.log("SourceChainPayment:", await sourceChainPayment.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 