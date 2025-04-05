// 综合部署脚本 - 用于本地测试环境
const { ethers } = require("hardhat");
require('dotenv').config();

async function main() {
  console.log("开始部署合约到本地测试环境...");

  // 获取部署者账户
  const [deployer] = await ethers.getSigners();
  console.log("使用部署者地址:", deployer.address);

  // 获取当前链ID
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  console.log(`当前链ID: ${chainId}`);

  // 定义合约地址变量，用于存储部署的合约地址
  let eventTicketingAddress;
  let eventTicketNFTAddress;
  let crossChainBridgeAddress;
  let sourceChainPaymentAddress;
  let nftBridgeGatewayAddress;
  let dynamicTicketNFTAddress;
  let crossChainTicketNFTAddress;

  // 1. 部署CrossChainBridge合约
  console.log("\n部署CrossChainBridge合约...");
  const CrossChainBridge = await ethers.getContractFactory("CrossChainBridge");
  const crossChainBridge = await CrossChainBridge.deploy();
  await crossChainBridge.deployed();
  crossChainBridgeAddress = crossChainBridge.address;
  console.log("CrossChainBridge部署完成，地址:", crossChainBridgeAddress);

  // 2. 部署EventTicketNFT合约
  console.log("\n部署EventTicketNFT合约...");
  const EventTicketNFT = await ethers.getContractFactory("EventTicketNFT");
  const eventTicketNFT = await EventTicketNFT.deploy("活动门票NFT", "ETNFT");
  await eventTicketNFT.deployed();
  eventTicketNFTAddress = eventTicketNFT.address;
  console.log("EventTicketNFT部署完成，地址:", eventTicketNFTAddress);

  // 3. 部署EventTicketing合约
  console.log("\n部署EventTicketing合约...");
  const EventTicketing = await ethers.getContractFactory("EventTicketing");
  const platformFeePercentage = 250; // 2.5%
  const eventTicketing = await EventTicketing.deploy(
    platformFeePercentage,
    deployer.address, // 平台收款地址
    eventTicketNFT.address, // 票据NFT合约地址
    crossChainBridge.address // 跨链桥合约地址
  );
  await eventTicketing.deployed();
  eventTicketingAddress = eventTicketing.address;
  console.log("EventTicketing部署完成，地址:", eventTicketingAddress);

  // 4. 部署SourceChainPayment合约
  console.log("\n部署SourceChainPayment合约...");
  const SourceChainPayment = await ethers.getContractFactory("SourceChainPayment");
  const sourceChainPayment = await SourceChainPayment.deploy(
    crossChainBridge.address, // 跨链桥合约地址
    eventTicketing.address // 活动票务合约地址
  );
  await sourceChainPayment.deployed();
  sourceChainPaymentAddress = sourceChainPayment.address;
  console.log("SourceChainPayment部署完成，地址:", sourceChainPaymentAddress);

  // 5. 部署NFTBridgeGateway合约
  console.log("\n部署NFTBridgeGateway合约...");
  const NFTBridgeGateway = await ethers.getContractFactory("NFTBridgeGateway");
  const nftBridgeGateway = await NFTBridgeGateway.deploy();
  await nftBridgeGateway.deployed();
  nftBridgeGatewayAddress = nftBridgeGateway.address;
  console.log("NFTBridgeGateway部署完成，地址:", nftBridgeGatewayAddress);

  // 设置支持的链（对于本地测试环境，我们模拟不同的链ID）
  const testChainIds = [1, 137, 42220]; // 模拟以太坊、Polygon和Celo链ID
  for (const testChainId of testChainIds) {
    if (chainId !== testChainId) {
      await nftBridgeGateway.setSupportedChain(testChainId, true);
      console.log(`已将链ID ${testChainId} 添加为支持的链`);
    }
  }

  // 6. 部署DynamicTicketNFT合约
  console.log("\n部署DynamicTicketNFT合约...");
  const DynamicTicketNFT = await ethers.getContractFactory("DynamicTicketNFT");
  const metadataServerUrl = process.env.METADATA_SERVER_URL || "http://localhost:3000";
  const dynamicTicketNFT = await DynamicTicketNFT.deploy(
    "动态NFT门票", // 名称
    "DYNFT", // 符号
    metadataServerUrl // 元数据服务器URL
  );
  await dynamicTicketNFT.deployed();
  dynamicTicketNFTAddress = dynamicTicketNFT.address;
  console.log("DynamicTicketNFT部署完成，地址:", dynamicTicketNFTAddress);

  // 7. 部署CrossChainTicketNFT合约
  console.log("\n部署CrossChainTicketNFT合约...");
  const CrossChainTicketNFT = await ethers.getContractFactory("CrossChainTicketNFT");
  const crossChainTicketNFT = await CrossChainTicketNFT.deploy(
    "跨链NFT门票", // 名称
    "CCNFT", // 符号
    nftBridgeGateway.address // 桥接网关地址
  );
  await crossChainTicketNFT.deployed();
  crossChainTicketNFTAddress = crossChainTicketNFT.address;
  console.log("CrossChainTicketNFT部署完成，地址:", crossChainTicketNFTAddress);

  // 设置权限和关联
  console.log("\n设置合约权限和关联...");

  // 设置EventTicketNFT的权限
  const minterRole = await eventTicketNFT.MINTER_ROLE();
  await eventTicketNFT.grantRole(minterRole, eventTicketingAddress);
  console.log(`已授予EventTicketing合约(${eventTicketingAddress})在EventTicketNFT上的铸造权限`);

  // 设置CrossChainBridge权限
  const relayerRole = await crossChainBridge.RELAYER_ROLE();
  await crossChainBridge.grantRole(relayerRole, deployer.address); // 测试环境中，部署者作为relayer
  await crossChainBridge.grantRole(relayerRole, sourceChainPaymentAddress);
  console.log(`已授予SourceChainPayment合约(${sourceChainPaymentAddress})在CrossChainBridge上的relayer权限`);

  // 设置DynamicTicketNFT权限
  const dynamicMinterRole = await dynamicTicketNFT.MINTER_ROLE();
  const uriSetterRole = await dynamicTicketNFT.URI_SETTER_ROLE();
  const ticketManagerRole = await dynamicTicketNFT.TICKET_MANAGER_ROLE();

  await dynamicTicketNFT.grantRole(dynamicMinterRole, eventTicketingAddress);
  await dynamicTicketNFT.grantRole(ticketManagerRole, eventTicketingAddress);
  await dynamicTicketNFT.grantRole(uriSetterRole, deployer.address);
  console.log(`已授予EventTicketing合约铸造和管理DynamicTicketNFT的权限`);

  // 设置NFTBridgeGateway权限
  const validatorRole = await nftBridgeGateway.VALIDATOR_ROLE();
  const bridgeOperatorRole = await nftBridgeGateway.BRIDGE_OPERATOR_ROLE();
  
  await nftBridgeGateway.grantRole(validatorRole, deployer.address);
  await nftBridgeGateway.grantRole(bridgeOperatorRole, deployer.address);
  console.log(`已授予部署者在NFTBridgeGateway上的验证者和操作员权限`);

  // 设置CrossChainTicketNFT权限
  const ccMinterRole = await crossChainTicketNFT.MINTER_ROLE();
  await crossChainTicketNFT.grantRole(ccMinterRole, eventTicketingAddress);
  console.log(`已授予EventTicketing合约铸造CrossChainTicketNFT的权限`);

  console.log("\n合约部署和设置完成！");
  console.log("------------------------------------");
  console.log("EventTicketing地址:", eventTicketingAddress);
  console.log("EventTicketNFT地址:", eventTicketNFTAddress);
  console.log("CrossChainBridge地址:", crossChainBridgeAddress);
  console.log("SourceChainPayment地址:", sourceChainPaymentAddress);
  console.log("NFTBridgeGateway地址:", nftBridgeGatewayAddress);
  console.log("DynamicTicketNFT地址:", dynamicTicketNFTAddress);
  console.log("CrossChainTicketNFT地址:", crossChainTicketNFTAddress);
  console.log("------------------------------------");

  // 创建本地测试环境的.env文件内容
  const envContent = `
# 区块链RPC URL
ETHEREUM_RPC_URL="http://localhost:8545"
POLYGON_RPC_URL="http://localhost:8545"
CELO_RPC_URL="http://localhost:8545"

# 合约地址 - 以太坊
ETH_EVENT_TICKETING_ADDRESS="${eventTicketingAddress}"
ETH_EVENT_TICKET_NFT_ADDRESS="${eventTicketNFTAddress}"
ETH_CROSS_CHAIN_BRIDGE_ADDRESS="${crossChainBridgeAddress}"
ETH_SOURCE_CHAIN_PAYMENT_ADDRESS="${sourceChainPaymentAddress}"
ETH_NFT_BRIDGE_GATEWAY_ADDRESS="${nftBridgeGatewayAddress}"
ETH_DYNAMIC_TICKET_NFT_ADDRESS="${dynamicTicketNFTAddress}"
ETH_CROSS_CHAIN_TICKET_NFT_ADDRESS="${crossChainTicketNFTAddress}"

# 合约地址 - Polygon（本地测试环境使用相同地址）
POLYGON_EVENT_TICKETING_ADDRESS="${eventTicketingAddress}"
POLYGON_EVENT_TICKET_NFT_ADDRESS="${eventTicketNFTAddress}"
POLYGON_CROSS_CHAIN_BRIDGE_ADDRESS="${crossChainBridgeAddress}"
POLYGON_SOURCE_CHAIN_PAYMENT_ADDRESS="${sourceChainPaymentAddress}"
POLYGON_NFT_BRIDGE_GATEWAY_ADDRESS="${nftBridgeGatewayAddress}"
POLYGON_DYNAMIC_TICKET_NFT_ADDRESS="${dynamicTicketNFTAddress}"
POLYGON_CROSS_CHAIN_TICKET_NFT_ADDRESS="${crossChainTicketNFTAddress}"

# 合约地址 - Celo（本地测试环境使用相同地址）
CELO_EVENT_TICKETING_ADDRESS="${eventTicketingAddress}"
CELO_EVENT_TICKET_NFT_ADDRESS="${eventTicketNFTAddress}"
CELO_CROSS_CHAIN_BRIDGE_ADDRESS="${crossChainBridgeAddress}"
CELO_SOURCE_CHAIN_PAYMENT_ADDRESS="${sourceChainPaymentAddress}"
CELO_NFT_BRIDGE_GATEWAY_ADDRESS="${nftBridgeGatewayAddress}"
CELO_DYNAMIC_TICKET_NFT_ADDRESS="${dynamicTicketNFTAddress}"
CELO_CROSS_CHAIN_TICKET_NFT_ADDRESS="${crossChainTicketNFTAddress}"

# 部署者地址（测试环境中作为验证者和桥接操作员）
DEPLOYER_ADDRESS="${deployer.address}"
VALIDATOR_ADDRESS="${deployer.address}"
BRIDGE_OPERATOR_ADDRESS="${deployer.address}"

# 测试用私钥 - 请勿在生产环境使用！
VALIDATOR_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# 元数据服务器配置
METADATA_SERVER_URL="http://localhost:3000"
METADATA_SERVER_PORT=3000
`;

  console.log("\n请将以下内容保存到.env文件中:");
  console.log(envContent);

  return {
    eventTicketing: eventTicketing,
    eventTicketNFT: eventTicketNFT,
    crossChainBridge: crossChainBridge,
    sourceChainPayment: sourceChainPayment,
    nftBridgeGateway: nftBridgeGateway,
    dynamicTicketNFT: dynamicTicketNFT,
    crossChainTicketNFT: crossChainTicketNFT
  };
}

// 运行部署脚本
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  module.exports = main;
} 