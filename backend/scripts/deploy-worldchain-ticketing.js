/**
 * Deploy EventTicketing contract to WorldChain
 * Used before deploying CrossChainTicketNFT to Celo chain
 * 优化版：检查已部署的合约，只部署未部署的合约
 */

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// 添加延迟函数
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 添加带重试的合约调用函数
async function contractCallWithRetry(fn, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const initialDelay = options.initialDelay || 5000;
  
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      // 检查是否为"Too Many Requests"错误
      if (error.message && error.message.includes("Too Many Requests") && attempt < maxRetries - 1) {
        const waitTime = initialDelay * Math.pow(2, attempt); // 指数退避
        console.log(`遇到"Too Many Requests"错误，等待${waitTime/1000}秒后重试 (${attempt + 1}/${maxRetries})...`);
        await delay(waitTime);
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

async function main() {
  console.log("Starting deployment of WorldChain contracts...");

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account balance: ${ethers.formatEther(balance)} ETH`);

  // 计算所需的大约费用
  const gasPrice = (await ethers.provider.getFeeData()).gasPrice;
  console.log(`Current gas price: ${ethers.formatUnits(gasPrice, "gwei")} gwei`);
  
  // 从.env文件加载已部署的合约地址
  let mockWorldIDAddress = process.env.WORLD_CHAIN_MOCK_WORLD_ID_ADDRESS;
  let worldIDVerifierAddress = process.env.WORLD_CHAIN_WORLD_ID_VERIFIER_ADDRESS;
  let eventTicketNFTAddress = process.env.WORLD_CHAIN_EVENT_TICKET_NFT_ADDRESS;
  let eventTicketingAddress = process.env.WORLD_CHAIN_EVENT_TICKETING_ADDRESS;
  
  // 明确设置交易选项，降低gas消耗
  const txOptions = {
    gasLimit: 2000000, // 增加gasLimit以避免OOG错误
    gasPrice: gasPrice
  };

  // 检查已部署的合约地址是否有效
  console.log(`Loaded contract addresses from .env:`);
  console.log(`- MockWorldID: ${mockWorldIDAddress || 'Not deployed'}`);
  console.log(`- WorldIDVerifier: ${worldIDVerifierAddress || 'Not deployed'}`);
  console.log(`- EventTicketNFT: ${eventTicketNFTAddress || 'Not deployed'}`);
  console.log(`- EventTicketing: ${eventTicketingAddress || 'Not deployed'}`);

  // 检查MockWorldID地址是否存在
  if (!mockWorldIDAddress) {
    console.error("Error: WORLD_CHAIN_MOCK_WORLD_ID_ADDRESS is not set in .env file");
    console.error("Please deploy MockWorldID first or set the address manually");
    process.exit(1);
  }
  console.log(`Using existing MockWorldID at: ${mockWorldIDAddress}`);

  // 部署或使用已部署的WorldIDVerifier
  if (!worldIDVerifierAddress) {
    console.log("Deploying WorldIDVerifier contract...");
    
    // 检查是否有足够的资金
    const estimatedCost = BigInt(2000000) * gasPrice;
    console.log(`Estimated cost for WorldIDVerifier: ${ethers.formatEther(estimatedCost)} ETH`);
    
    if (balance < estimatedCost) {
      console.error(`Insufficient funds for WorldIDVerifier. Need ${ethers.formatEther(estimatedCost)} ETH, have ${ethers.formatEther(balance)} ETH`);
      process.exit(1);
    }

    const appId = ethers.encodeBytes32String("app_ticketing");
    const WorldIDVerifier = await ethers.getContractFactory("WorldIDVerifier");
    
    try {
      const worldIDVerifier = await WorldIDVerifier.deploy(mockWorldIDAddress, appId, txOptions);
      console.log("WorldIDVerifier deployment transaction sent...");
      await worldIDVerifier.waitForDeployment();
      worldIDVerifierAddress = await worldIDVerifier.getAddress();
      console.log(`WorldIDVerifier contract deployed to: ${worldIDVerifierAddress}`);
      
      // 更新.env文件
      updateEnvFile("WORLD_CHAIN_WORLD_ID_VERIFIER_ADDRESS", worldIDVerifierAddress);
    } catch (error) {
      console.error(`Failed to deploy WorldIDVerifier: ${error.message}`);
      if (error.transaction) {
        console.error(`Transaction hash: ${error.transaction.hash || 'unknown'}`);
      }
      if (error.receipt) {
        console.error(`Gas used: ${error.receipt.gasUsed}`);
        console.error(`Contract address: ${error.receipt.contractAddress || 'none'}`);
        console.error(`Transaction status: ${error.receipt.status}`);
      }
      process.exit(1);
    }
  } else {
    console.log(`Using existing WorldIDVerifier at: ${worldIDVerifierAddress}`);
  }

  // 验证已部署的EventTicketNFT合约是否能正常工作
  let eventTicketNFTValid = false;
  if (eventTicketNFTAddress) {
    try {
      console.log(`Checking if EventTicketNFT at ${eventTicketNFTAddress} is valid...`);
      const EventTicketNFT = await ethers.getContractFactory("EventTicketNFT");
      const eventTicketNFT = EventTicketNFT.attach(eventTicketNFTAddress);
      
      // 尝试调用读取合约方法来验证合约有效性
      const name = await eventTicketNFT.name();
      const symbol = await eventTicketNFT.symbol();
      console.log(`Existing EventTicketNFT contract is valid. Name: ${name}, Symbol: ${symbol}`);
      eventTicketNFTValid = true;
    } catch (error) {
      console.log(`Existing EventTicketNFT contract at ${eventTicketNFTAddress} is not valid or accessible.`);
      console.log(`Error: ${error.message}`);
      console.log(`Will deploy a new contract.`);
      eventTicketNFTValid = false;
      eventTicketNFTAddress = null;
    }
  }

  // 部署或使用已部署的EventTicketNFT
  if (!eventTicketNFTValid) {
    console.log("Deploying EventTicketNFT contract...");
    
    // 检查是否有足够的资金
    const estimatedCost = BigInt(2000000) * gasPrice;
    console.log(`Estimated cost for EventTicketNFT: ${ethers.formatEther(estimatedCost)} ETH`);
    
    if (balance < estimatedCost) {
      console.error(`Insufficient funds for EventTicketNFT. Need ${ethers.formatEther(estimatedCost)} ETH, have ${ethers.formatEther(balance)} ETH`);
      process.exit(1);
    }

    try {
      // 获取合约的bytecode
      const EventTicketNFT = await ethers.getContractFactory("EventTicketNFT");
      console.log("EventTicketNFT bytecode size:", EventTicketNFT.bytecode.length / 2 - 1, "bytes");
      
      // 进一步检查合约大小
      if (EventTicketNFT.bytecode.length / 2 - 1 > 24576) {
        console.warn("Warning: Contract size exceeds 24KB limit!");
      }
      
      // 使用更高的gas限制
      const deployOptions = {
        ...txOptions,
        gasLimit: 2500000
      };
      
      // 部署合约 - 使用重试逻辑
      console.log("Sending EventTicketNFT deployment transaction with higher gas limit...");
      
      const eventTicketNFT = await contractCallWithRetry(async () => {
        const contract = await EventTicketNFT.deploy(deployOptions);
        return contract;
      });
      
      console.log("Waiting for deployment confirmation...");
      await contractCallWithRetry(async () => {
        await eventTicketNFT.waitForDeployment();
        return true;
      });
      
      eventTicketNFTAddress = await eventTicketNFT.getAddress();
      console.log(`EventTicketNFT contract deployed to: ${eventTicketNFTAddress}`);
      
      // 检查合约是否有效
      try {
        const name = await eventTicketNFT.name();
        const symbol = await eventTicketNFT.symbol();
        console.log(`Deployed contract verified. Name: ${name}, Symbol: ${symbol}`);
        
        // 更新.env文件
        updateEnvFile("WORLD_CHAIN_EVENT_TICKET_NFT_ADDRESS", eventTicketNFTAddress);
      } catch (error) {
        console.error(`Failed to verify deployed contract: ${error.message}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Failed to deploy EventTicketNFT: ${error.message}`);
      if (error.transaction) {
        console.error(`Transaction hash: ${error.transaction.hash || 'unknown'}`);
      }
      if (error.receipt) {
        console.error(`Gas used: ${error.receipt.gasUsed.toString()}`);
        console.error(`Contract address: ${error.receipt.contractAddress || 'none'}`);
        console.error(`Transaction status: ${error.receipt.status}`);
      }
      // 提供更有用的错误信息
      console.error("\nPossible solutions:");
      console.error("1. Increase gas limit in txOptions");
      console.error("2. Check for contract size issues");
      console.error("3. Ensure all imported contracts are correctly available");
      process.exit(1);
    }
  } else {
    console.log(`Using existing EventTicketNFT at: ${eventTicketNFTAddress}`);
  }

  // 部署或使用已部署的EventTicketing
  if (!eventTicketingAddress) {
    console.log("Deploying EventTicketing contract...");
    
    // 检查是否有足够的资金
    const estimatedCost = BigInt(2000000) * gasPrice;
    console.log(`Estimated cost for EventTicketing: ${ethers.formatEther(estimatedCost)} ETH`);
    
    if (balance < estimatedCost) {
      console.error(`Insufficient funds for EventTicketing. Need ${ethers.formatEther(estimatedCost)} ETH, have ${ethers.formatEther(balance)} ETH`);
      process.exit(1);
    }

    try {
      const bridgeAddress = ethers.ZeroAddress; // Using zero address initially, can be updated later
      const EventTicketing = await ethers.getContractFactory("EventTicketing");
      console.log("EventTicketing bytecode size:", EventTicketing.bytecode.length / 2 - 1, "bytes");
      
      // 使用更高的gas限制
      const deployOptions = {
        ...txOptions,
        gasLimit: 3000000
      };
      
      // 使用重试逻辑部署EventTicketing合约
      console.log("Sending EventTicketing deployment transaction with higher gas limit...");
      const eventTicketing = await contractCallWithRetry(async () => {
        return await EventTicketing.deploy(
          eventTicketNFTAddress,
          worldIDVerifierAddress,
          bridgeAddress,
          deployOptions
        );
      });
      
      console.log("Waiting for deployment confirmation...");
      await contractCallWithRetry(async () => {
        await eventTicketing.waitForDeployment();
        return true;
      });
      
      eventTicketingAddress = await eventTicketing.getAddress();
      console.log(`EventTicketing contract deployed to: ${eventTicketingAddress}`);
      
      // 更新.env文件
      updateEnvFile("WORLD_CHAIN_EVENT_TICKETING_ADDRESS", eventTicketingAddress);
      
      // 设置NFT合约的铸造权限
      console.log("Setting minting permission for EventTicketNFT...");
      const EventTicketNFT = await ethers.getContractFactory("EventTicketNFT");
      const eventTicketNFT = EventTicketNFT.attach(eventTicketNFTAddress);
      const MINTER_ROLE = await eventTicketNFT.MINTER_ROLE();
      
      try {
        // 检查是否已经有铸造权限
        const hasMinterRole = await contractCallWithRetry(async () => {
          return await eventTicketNFT.hasRole(MINTER_ROLE, eventTicketingAddress);
        });
        
        if (!hasMinterRole) {
          const grantTx = await contractCallWithRetry(async () => {
            return await eventTicketNFT.grantRole(MINTER_ROLE, eventTicketingAddress, txOptions);
          });
          
          await contractCallWithRetry(async () => {
            await grantTx.wait();
            return true;
          });
          
          console.log("Minting permission set successfully");
        } else {
          console.log("Minting permission already set");
        }
      } catch (error) {
        console.error(`Failed to set minting permission: ${error.message}`);
      }
    } catch (error) {
      console.error(`Failed to deploy EventTicketing: ${error.message}`);
      if (error.transaction) {
        console.error(`Transaction hash: ${error.transaction.hash || 'unknown'}`);
      }
      if (error.receipt) {
        console.error(`Gas used: ${error.receipt.gasUsed.toString()}`);
        console.error(`Contract address: ${error.receipt.contractAddress || 'none'}`);
        console.error(`Transaction status: ${error.receipt.status}`);
      }
      process.exit(1);
    }
  } else {
    console.log(`Using existing EventTicketing at: ${eventTicketingAddress}`);
  }

  // Save deployment information
  const deploymentInfo = {
    network: network.name,
    chainId: (await ethers.provider.getNetwork()).chainId,
    deployer: deployer.address,
    contracts: {
      MockWorldID: mockWorldIDAddress,
      WorldIDVerifier: worldIDVerifierAddress,
      EventTicketNFT: eventTicketNFTAddress,
      EventTicketing: eventTicketingAddress
    },
    timestamp: new Date().toISOString()
  };

  // Ensure directory exists
  const deployDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deployDir)) {
    fs.mkdirSync(deployDir, { recursive: true });
  }

  // Write deployment info to file
  const filePath = path.join(deployDir, `worldchain-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment info saved to: ${filePath}`);

  console.log("WorldChain contracts deployment complete!");
  console.log(`You can now deploy the CrossChainTicketNFT contract to Celo chain using EventTicketing address: ${eventTicketingAddress}`);
  
  // 输出下一步操作指导
  console.log("\nNext steps:");
  console.log("1. Verify deployed contracts by running:");
  console.log("   npx hardhat run scripts/verify-contracts.js --network worldchain");
  console.log("2. Deploy the CrossChainTicketNFT contract to Celo:");
  console.log("   npx hardhat run scripts/deploy-celo-nft.js --network alfajores");
}

// 更新.env文件
function updateEnvFile(key, value) {
  try {
    const envPath = path.join(__dirname, "../../.env");
    let envContent = "";
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf8");
    }
    
    // 检查变量是否已存在
    const regex = new RegExp(`^${key}=.*`, "m");
    if (envContent.match(regex)) {
      // 更新已存在的变量
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      // 添加新变量
      envContent += `\n${key}=${value}`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log(`.env文件已更新: ${key}=${value}`);
  } catch (error) {
    console.warn(`.env文件更新失败: ${error.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 