/**
 * Deploy CrossChainTicketNFT contract to Celo
 * This script deploys the CrossChainTicketNFT contract to the Celo network
 * It uses the EventTicketing contract address from WorldChain deployment
 */

const { ethers, network } = require("hardhat");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  console.log("Starting deployment of CrossChainTicketNFT contract to Celo...");

  // Check if we're on Celo network
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 44787 && chainId !== 42220) {
    console.warn("WARNING: You are not deploying to a Celo network!");
    console.warn(`Current network: ${network.name}, Chain ID: ${chainId}`);
    console.warn("Expected Chain IDs: 44787 (Alfajores Testnet) or 42220 (Mainnet)");
    // Continue anyway, but warn the user
  }

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account balance: ${ethers.formatEther(balance)} CELO`);

  if (balance == 0) {
    console.error("Deployer account has 0 balance. Please ensure you have CELO to pay for gas");
    process.exit(1);
  }

  // Get the WorldChain contract address from .env or ask for it
  let worldChainContractAddress = process.env.WORLD_CHAIN_EVENT_TICKETING_ADDRESS;
  if (!worldChainContractAddress) {
    console.error("WorldChain EventTicketing contract address not found in .env!");
    console.error("Please run the WorldChain deployment first or set WORLD_CHAIN_EVENT_TICKETING_ADDRESS manually");
    process.exit(1);
  }

  console.log(`Using WorldChain EventTicketing contract: ${worldChainContractAddress}`);

  // Generate or use verification secret
  let verificationSecret = process.env.VERIFICATION_SECRET;
  if (!verificationSecret) {
    console.log("Generating new verification secret...");
    verificationSecret = "0x" + crypto.randomBytes(32).toString('hex');
    console.log(`New verification secret generated: ${verificationSecret}`);
  } else {
    console.log("Using verification secret from .env");
  }

  // Convert string to bytes32
  const verificationSecretBytes32 = ethers.encodeBytes32String(verificationSecret.substring(0, 31));

  // Deploy CrossChainTicketNFT contract
  console.log("Deploying CrossChainTicketNFT contract...");
  const CrossChainTicketNFT = await ethers.getContractFactory("CrossChainTicketNFT");
  const crossChainTicketNFT = await CrossChainTicketNFT.deploy(
    "GlobalEvent Tickets", // Name
    "GET",                // Symbol
    worldChainContractAddress, // WorldChain contract address
    "celo",               // Celo chain identifier
    verificationSecretBytes32  // Verification secret
  );

  await crossChainTicketNFT.waitForDeployment();
  const crossChainTicketNFTAddress = await crossChainTicketNFT.getAddress();
  console.log(`CrossChainTicketNFT contract deployed to: ${crossChainTicketNFTAddress}`);

  // Save deployment information
  const deploymentInfo = {
    network: network.name,
    chainId: chainId,
    deployer: deployer.address,
    contracts: {
      CrossChainTicketNFT: crossChainTicketNFTAddress,
      WorldChainContractReference: worldChainContractAddress
    },
    verificationSecret: verificationSecret,
    timestamp: new Date().toISOString()
  };

  // Ensure directory exists
  const deployDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }

  // Write deployment info to file
  const filePath = path.join(deployDir, `celo-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to: ${filePath}`);

  // Try to update .env file
  try {
    const envPath = path.join(__dirname, "../../.env");
    let envContent = "";
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }

    // Add or update environment variables
    const envVars = {
      CELO_CROSS_CHAIN_TICKET_NFT_ADDRESS: crossChainTicketNFTAddress,
      VERIFICATION_SECRET: verificationSecret,
    };

    Object.entries(envVars).forEach(([key, value]) => {
      // Check if variable already exists
      const regex = new RegExp(`^${key}=.*`, "m");
      if (envContent.match(regex)) {
        // Update existing variable
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        // Add new variable
        envContent += `\n${key}=${value}`;
      }
    });

    fs.writeFileSync(envPath, envContent);
    console.log(`.env file updated`);
  } catch (error) {
    console.warn(`.env file update failed: ${error.message}`);
  }

  console.log("Celo CrossChainTicketNFT deployment complete!");
  console.log("Next steps:");
  console.log("1. Verify the contract on Celoscan");
  console.log("2. Set up bridge permissions on both contracts");
  console.log("3. Configure the event organizer app to use both contract addresses");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 