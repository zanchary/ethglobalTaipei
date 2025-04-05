// 简化版部署脚本 - 只部署EventTicketing和EventTicketNFT
const { ethers } = require("hardhat");
require('dotenv').config();

async function main() {
  console.log("开始部署基本票务合约...");

  // 获取部署者账户
  const [deployer] = await ethers.getSigners();
  console.log("使用部署者地址:", deployer.address);

  // 获取当前链ID
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  console.log(`当前链ID: ${chainId}`);

  // 定义合约地址变量
  let eventTicketingAddress;
  let eventTicketNFTAddress;
  let mockWorldIDAddress;
  let worldIDVerifierAddress;

  // 1. 部署MockWorldID合约
  console.log("\n部署MockWorldID合约...");
  const MockWorldID = await ethers.getContractFactory("MockWorldID");
  
  console.log("发送部署交易...");
  const mockWorldIDDeployTx = await MockWorldID.deploy();
  
  console.log("等待交易确认...");
  const mockWorldID = await mockWorldIDDeployTx.waitForDeployment();
  
  // 获取部署后的合约地址
  mockWorldIDAddress = await mockWorldID.getAddress();
  console.log("MockWorldID部署完成，地址:", mockWorldIDAddress);

  // 2. 部署WorldIDVerifier合约
  console.log("\n部署WorldIDVerifier合约...");
  const WorldIDVerifier = await ethers.getContractFactory("WorldIDVerifier");
  
  console.log("发送部署交易...");
  const worldIDVerifierDeployTx = await WorldIDVerifier.deploy(
    mockWorldIDAddress, // 传入MockWorldID地址
    "app_testing" // 应用ID
  );
  
  console.log("等待交易确认...");
  const worldIDVerifier = await worldIDVerifierDeployTx.waitForDeployment();
  
  // 获取部署后的合约地址
  worldIDVerifierAddress = await worldIDVerifier.getAddress();
  console.log("WorldIDVerifier部署完成，地址:", worldIDVerifierAddress);

  // 3. 部署EventTicketNFT合约
  console.log("\n部署EventTicketNFT合约...");
  const EventTicketNFT = await ethers.getContractFactory("EventTicketNFT");
  
  console.log("发送部署交易...");
  const deployTx = await EventTicketNFT.deploy();
  
  console.log("等待交易确认...");
  // 在ethers v6中需要等待交易确认
  const eventTicketNFT = await deployTx.waitForDeployment();
  
  // 获取部署后的合约地址
  eventTicketNFTAddress = await eventTicketNFT.getAddress();
  console.log("EventTicketNFT部署完成，地址:", eventTicketNFTAddress);
  
  // 对于简化版，我们不使用跨链桥，所以传入零地址
  console.log("\n使用零地址作为跨链桥地址(简化版)");
  const crossChainBridgeAddress = "0x0000000000000000000000000000000000000000";
  
  // 4. 部署EventTicketing合约
  console.log("\n部署EventTicketing合约...");
  const EventTicketing = await ethers.getContractFactory("EventTicketing");
  
  console.log("发送部署交易...");
  const eventTicketingDeployTx = await EventTicketing.deploy(
    eventTicketNFTAddress,  // 票据NFT合约地址
    worldIDVerifierAddress,  // WorldID验证器地址
    crossChainBridgeAddress  // 跨链桥合约地址 (零地址)
  );
  
  console.log("等待交易确认...");
  const eventTicketing = await eventTicketingDeployTx.waitForDeployment();
  
  // 获取部署后的合约地址
  eventTicketingAddress = await eventTicketing.getAddress();
  console.log("EventTicketing部署完成，地址:", eventTicketingAddress);

  // 设置权限和关联
  console.log("\n设置合约权限和关联...");

  // 设置EventTicketNFT的权限
  const minterRole = await eventTicketNFT.MINTER_ROLE();
  const grantRoleTx = await eventTicketNFT.grantRole(minterRole, eventTicketingAddress);
  await grantRoleTx.wait();
  console.log(`已授予EventTicketing合约(${eventTicketingAddress})在EventTicketNFT上的铸造权限`);

  console.log("\n合约部署和设置完成！");
  console.log("------------------------------------");
  console.log("EventTicketing地址:", eventTicketingAddress);
  console.log("EventTicketNFT地址:", eventTicketNFTAddress);
  console.log("WorldIDVerifier地址:", worldIDVerifierAddress);
  console.log("MockWorldID地址:", mockWorldIDAddress);
  console.log("------------------------------------");

  // 创建简化的.env文件内容
  const envContent = `
# 合约地址
EVENT_TICKETING_ADDRESS="${eventTicketingAddress}"
EVENT_TICKET_NFT_ADDRESS="${eventTicketNFTAddress}"
WORLD_ID_VERIFIER_ADDRESS="${worldIDVerifierAddress}"
MOCK_WORLD_ID_ADDRESS="${mockWorldIDAddress}"

# 部署者地址
DEPLOYER_ADDRESS="${deployer.address}"
`;

  console.log("\n请将以下内容保存到.env文件中:");
  console.log(envContent);

  return {
    eventTicketing: eventTicketing,
    eventTicketNFT: eventTicketNFT,
    worldIDVerifier: worldIDVerifier,
    mockWorldID: mockWorldID
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