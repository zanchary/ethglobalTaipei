// 按顺序依次部署合约
const { ethers } = require("hardhat");

async function main() {
  console.log("开始按顺序部署合约...");

  // 获取部署者账户
  const [deployer] = await ethers.getSigners();
  console.log("使用部署者地址:", deployer.address);

  // 获取当前链ID
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  console.log(`当前链ID: ${chainId}`);

  // 存储合约地址
  let mockWorldIDAddress = "";
  let worldIDVerifierAddress = "";
  let eventTicketNFTAddress = "";
  let eventTicketingAddress = "";

  try {
    // 1. 部署MockWorldID合约
    console.log("\n步骤1: 部署MockWorldID合约...");
    const MockWorldID = await ethers.getContractFactory("MockWorldID");
    const mockWorldIDDeployTx = await MockWorldID.deploy();
    const mockWorldID = await mockWorldIDDeployTx.waitForDeployment();
    mockWorldIDAddress = await mockWorldID.getAddress();
    console.log("MockWorldID合约部署成功，地址:", mockWorldIDAddress);

    // 2. 部署WorldIDVerifier合约
    console.log("\n步骤2: 部署WorldIDVerifier合约...");
    const appId = "app_staging_0123456789abcdef0123456789abcdef";
    const WorldIDVerifier = await ethers.getContractFactory("WorldIDVerifier");
    const worldIDVerifierDeployTx = await WorldIDVerifier.deploy(mockWorldIDAddress, appId);
    const worldIDVerifier = await worldIDVerifierDeployTx.waitForDeployment();
    worldIDVerifierAddress = await worldIDVerifier.getAddress();
    console.log("WorldIDVerifier合约部署成功，地址:", worldIDVerifierAddress);

    // 3. 部署EventTicketNFT合约
    console.log("\n步骤3: 部署EventTicketNFT合约...");
    const EventTicketNFT = await ethers.getContractFactory("EventTicketNFT");
    const eventTicketNFTDeployTx = await EventTicketNFT.deploy();
    const eventTicketNFT = await eventTicketNFTDeployTx.waitForDeployment();
    eventTicketNFTAddress = await eventTicketNFT.getAddress();
    console.log("EventTicketNFT合约部署成功，地址:", eventTicketNFTAddress);

    // 4. 部署EventTicketing合约
    console.log("\n步骤4: 部署EventTicketing合约...");
    const EventTicketing = await ethers.getContractFactory("EventTicketing");
    // 使用零地址作为跨链桥的地址
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    const eventTicketingDeployTx = await EventTicketing.deploy(
      eventTicketNFTAddress,
      worldIDVerifierAddress,
      zeroAddress
    );
    const eventTicketing = await eventTicketingDeployTx.waitForDeployment();
    eventTicketingAddress = await eventTicketing.getAddress();
    console.log("EventTicketing合约部署成功，地址:", eventTicketingAddress);

    // 5. 设置权限
    console.log("\n步骤5: 为EventTicketing合约设置铸造权限...");
    const setMinterTx = await eventTicketNFT.setMinter(eventTicketingAddress);
    await setMinterTx.wait();
    console.log("铸造权限设置成功");

    // 输出所有合约地址
    console.log("\n部署总结:");
    console.log("- MockWorldID地址:", mockWorldIDAddress);
    console.log("- WorldIDVerifier地址:", worldIDVerifierAddress);
    console.log("- EventTicketNFT地址:", eventTicketNFTAddress);
    console.log("- EventTicketing地址:", eventTicketingAddress);
    console.log("- 部署者地址:", deployer.address);

    // 输出.env文件格式
    console.log("\n.env文件内容:");
    console.log(`MOCK_WORLD_ID_ADDRESS=${mockWorldIDAddress}`);
    console.log(`WORLD_ID_VERIFIER_ADDRESS=${worldIDVerifierAddress}`);
    console.log(`EVENT_TICKET_NFT_ADDRESS=${eventTicketNFTAddress}`);
    console.log(`EVENT_TICKETING_ADDRESS=${eventTicketingAddress}`);
    console.log(`DEPLOYER_ADDRESS=${deployer.address}`);

  } catch (error) {
    console.error("部署过程中出错:", error);
    // 显示所有已部署的合约地址
    console.log("\n已部署的合约:");
    if (mockWorldIDAddress) console.log("- MockWorldID:", mockWorldIDAddress);
    if (worldIDVerifierAddress) console.log("- WorldIDVerifier:", worldIDVerifierAddress);
    if (eventTicketNFTAddress) console.log("- EventTicketNFT:", eventTicketNFTAddress);
    if (eventTicketingAddress) console.log("- EventTicketing:", eventTicketingAddress);
  }
}

// 运行部署脚本
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("运行时错误:", error);
    process.exit(1);
  }); 