// 部署跨链NFT门票和动态NFT门票合约
const { ethers } = require("hardhat");
require('dotenv').config();

async function main() {
  console.log("开始部署合约...");

  // 获取部署者账户
  const [deployer] = await ethers.getSigners();
  console.log("使用部署者地址:", deployer.address);

  // 获取当前链ID
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  console.log(`当前链ID: ${chainId}`);

  // 部署NFT桥接网关
  console.log("\n部署NFTBridgeGateway合约...");
  const NFTBridgeGateway = await ethers.getContractFactory("NFTBridgeGateway");
  const nftBridgeGateway = await NFTBridgeGateway.deploy();
  await nftBridgeGateway.deployed();
  console.log("NFTBridgeGateway部署完成，地址:", nftBridgeGateway.address);

  // 设置支持的链
  // 以太坊主网
  if (chainId !== 1) {
    await nftBridgeGateway.setSupportedChain(1, true);
    console.log("已将以太坊主网(1)添加为支持的链");
  }
  
  // Polygon
  if (chainId !== 137) {
    await nftBridgeGateway.setSupportedChain(137, true);
    console.log("已将Polygon(137)添加为支持的链");
  }
  
  // Celo
  if (chainId !== 42220) {
    await nftBridgeGateway.setSupportedChain(42220, true);
    console.log("已将Celo(42220)添加为支持的链");
  }

  // 部署动态NFT门票合约
  console.log("\n部署DynamicTicketNFT合约...");
  const DynamicTicketNFT = await ethers.getContractFactory("DynamicTicketNFT");
  const metadataServerUrl = process.env.METADATA_SERVER_URL || "http://localhost:3000";
  const dynamicTicketNFT = await DynamicTicketNFT.deploy(
    "动态NFT门票", // 名称
    "DYNFT", // 符号
    metadataServerUrl // 元数据服务器URL
  );
  await dynamicTicketNFT.deployed();
  console.log("DynamicTicketNFT部署完成，地址:", dynamicTicketNFT.address);

  // 部署跨链门票NFT合约
  console.log("\n部署CrossChainTicketNFT合约...");
  const CrossChainTicketNFT = await ethers.getContractFactory("CrossChainTicketNFT");
  const crossChainTicketNFT = await CrossChainTicketNFT.deploy(
    "跨链NFT门票", // 名称
    "CCNFT", // 符号
    nftBridgeGateway.address // 桥接网关地址
  );
  await crossChainTicketNFT.deployed();
  console.log("CrossChainTicketNFT部署完成，地址:", crossChainTicketNFT.address);

  // 授予权限
  // DynamicTicketNFT权限设置
  const minterRole = await dynamicTicketNFT.MINTER_ROLE();
  const uriSetterRole = await dynamicTicketNFT.URI_SETTER_ROLE();
  const ticketManagerRole = await dynamicTicketNFT.TICKET_MANAGER_ROLE();

  // 如果有EventTicketing合约，授予其MINTER_ROLE
  if (process.env.EVENT_TICKETING_ADDRESS) {
    await dynamicTicketNFT.grantRole(minterRole, process.env.EVENT_TICKETING_ADDRESS);
    await dynamicTicketNFT.grantRole(ticketManagerRole, process.env.EVENT_TICKETING_ADDRESS);
    console.log(`已授予EventTicketing合约(${process.env.EVENT_TICKETING_ADDRESS})铸造和票据管理权限`);
  }

  // 如果有元数据服务器地址，授予其URI_SETTER_ROLE
  if (process.env.METADATA_SERVER_ADDRESS) {
    await dynamicTicketNFT.grantRole(uriSetterRole, process.env.METADATA_SERVER_ADDRESS);
    console.log(`已授予元数据服务器(${process.env.METADATA_SERVER_ADDRESS})URI设置权限`);
  }

  // CrossChainTicketNFT权限设置
  // 桥接网关已在构造函数中获得BRIDGE_ROLE权限

  // 如果有EventTicketing合约，授予其MINTER_ROLE
  if (process.env.EVENT_TICKETING_ADDRESS) {
    const ccMinterRole = await crossChainTicketNFT.MINTER_ROLE();
    await crossChainTicketNFT.grantRole(ccMinterRole, process.env.EVENT_TICKETING_ADDRESS);
    console.log(`已授予EventTicketing合约(${process.env.EVENT_TICKETING_ADDRESS})跨链NFT铸造权限`);
  }

  // 设置桥接网关的验证者
  // 添加验证者
  if (process.env.VALIDATOR_ADDRESS) {
    const validatorRole = await nftBridgeGateway.VALIDATOR_ROLE();
    await nftBridgeGateway.grantRole(validatorRole, process.env.VALIDATOR_ADDRESS);
    console.log(`已授予地址(${process.env.VALIDATOR_ADDRESS})验证者权限`);
  }

  // 添加桥接操作员
  if (process.env.BRIDGE_OPERATOR_ADDRESS) {
    const bridgeOperatorRole = await nftBridgeGateway.BRIDGE_OPERATOR_ROLE();
    await nftBridgeGateway.grantRole(bridgeOperatorRole, process.env.BRIDGE_OPERATOR_ADDRESS);
    console.log(`已授予地址(${process.env.BRIDGE_OPERATOR_ADDRESS})桥接操作员权限`);
  }

  console.log("\n合约部署和设置完成！");
  console.log("------------------------------------");
  console.log("NFTBridgeGateway地址:", nftBridgeGateway.address);
  console.log("DynamicTicketNFT地址:", dynamicTicketNFT.address);
  console.log("CrossChainTicketNFT地址:", crossChainTicketNFT.address);
  console.log("------------------------------------");
  console.log("请将这些地址添加到您的.env文件中");
}

// 运行部署脚本
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 