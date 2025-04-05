// 最简化的部署脚本 - 只部署MockWorldID
const { ethers } = require("hardhat");

async function main() {
  console.log("开始部署测试版MockWorldID合约...");

  // 获取部署者账户
  const [deployer] = await ethers.getSigners();
  console.log("使用部署者地址:", deployer.address);

  // 获取当前链ID
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  console.log(`当前链ID: ${chainId}`);

  // 部署MockWorldID合约
  console.log("\n部署MockWorldID合约...");
  const MockWorldID = await ethers.getContractFactory("MockWorldID");
  console.log("合约工厂创建成功...");
  
  try {
    console.log("发送部署交易...");
    const deployTx = await MockWorldID.deploy();
    
    console.log("等待交易确认...");
    const mockWorldID = await deployTx.waitForDeployment();
    
    // 获取部署后的合约地址
    const mockWorldIDAddress = await mockWorldID.getAddress();
    console.log("合约地址:", mockWorldIDAddress);
    
    console.log("\n合约部署成功！");
  } catch (error) {
    console.error("部署失败:", error);
  }
}

// 运行部署脚本
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("运行时错误:", error);
    process.exit(1);
  }); 