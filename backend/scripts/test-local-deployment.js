// 本地测试部署脚本
const { ethers } = require("hardhat");
const deployLocalContracts = require("./deploy-local-test");
require('dotenv').config();

async function main() {
  console.log("开始测试本地部署的合约...");

  // 部署合约
  console.log("首先部署所有合约...");
  const contracts = await deployLocalContracts();
  
  const {
    eventTicketing,
    eventTicketNFT,
    crossChainBridge,
    sourceChainPayment,
    nftBridgeGateway,
    dynamicTicketNFT,
    crossChainTicketNFT
  } = contracts;

  // 获取部署者账户和一些测试账户
  const [deployer, organizer, attendee1, attendee2] = await ethers.getSigners();
  console.log("测试账户:");
  console.log("- 部署者/平台管理员:", deployer.address);
  console.log("- 活动组织者:", organizer.address);
  console.log("- 参与者1:", attendee1.address);
  console.log("- 参与者2:", attendee2.address);

  // 1. 测试创建活动
  console.log("\n测试创建活动...");
  const currentTime = Math.floor(Date.now() / 1000);
  const eventStartTime = currentTime + 3600; // 1小时后开始
  const eventEndTime = currentTime + 7200; // 2小时后结束
  const registrationDeadline = currentTime + 2700; // 45分钟后截止注册

  const createEventTx = await eventTicketing.connect(organizer).createEvent(
    "测试活动", // 名称
    "这是一个测试活动", // 描述
    "上海市", // 地点
    eventStartTime, // 开始时间
    eventEndTime, // 结束时间
    registrationDeadline, // 注册截止时间
    100, // 总票数
    ethers.utils.parseEther("0.01"), // 票价：0.01 ETH
    ethers.constants.AddressZero, // 支付代币地址(使用原生ETH)
    "ipfs://QmTest", // 活动图片IPFS哈希
    { value: ethers.utils.parseEther("0.01") } // 创建活动需要支付平台费用
  );

  const createEventReceipt = await createEventTx.wait();
  // 从事件中获取活动ID
  const eventCreatedEvent = createEventReceipt.events.find(event => event.event === 'EventCreated');
  const eventId = eventCreatedEvent.args.eventId;
  console.log(`活动创建成功，ID: ${eventId}`);

  // 获取活动详情
  const eventDetails = await eventTicketing.events(eventId);
  console.log("活动详情:", {
    name: eventDetails.name,
    organizer: eventDetails.organizer,
    totalTickets: eventDetails.totalTickets.toString(),
    ticketPrice: ethers.utils.formatEther(eventDetails.ticketPrice),
    ticketsAvailable: eventDetails.ticketsAvailable.toString()
  });

  // 2. 测试购买普通门票
  console.log("\n测试购买普通门票...");
  const buyTicketTx = await eventTicketing.connect(attendee1).buyTicket(
    eventId,
    1, // 购买1张票
    { value: eventDetails.ticketPrice } // 支付票价
  );
  await buyTicketTx.wait();
  console.log(`参与者1购买了活动 ${eventId} 的门票`);

  // 检查门票NFT
  const attendee1TicketBalance = await eventTicketNFT.balanceOf(attendee1.address);
  console.log(`参与者1拥有的门票数量: ${attendee1TicketBalance}`);

  // 获取参与者1的第一张门票ID
  const ticketId = await eventTicketNFT.tokenOfOwnerByIndex(attendee1.address, 0);
  console.log(`参与者1的门票ID: ${ticketId}`);

  // 3. 测试铸造动态NFT门票
  console.log("\n测试铸造动态NFT门票...");
  // 授予活动组织者权限铸造动态NFT门票
  const minterRole = await dynamicTicketNFT.MINTER_ROLE();
  await dynamicTicketNFT.grantRole(minterRole, organizer.address);

  const mintDynamicNFTTx = await dynamicTicketNFT.connect(organizer).mint(
    attendee2.address,
    eventId,
    1, // 座位号
    JSON.stringify({ color: "blue", tier: "VIP" }) // 自定义属性
  );
  await mintDynamicNFTTx.wait();
  console.log(`为参与者2铸造了动态NFT门票`);

  // 检查动态NFT门票
  const attendee2DynamicTicketBalance = await dynamicTicketNFT.balanceOf(attendee2.address);
  console.log(`参与者2拥有的动态门票数量: ${attendee2DynamicTicketBalance}`);

  // 获取参与者2的动态门票ID
  const dynamicTicketId = await dynamicTicketNFT.tokenOfOwnerByIndex(attendee2.address, 0);
  console.log(`参与者2的动态门票ID: ${dynamicTicketId}`);

  // 4. 测试更改动态NFT门票状态
  console.log("\n测试更改动态NFT门票状态...");
  const checkInTx = await dynamicTicketNFT.connect(organizer).checkInTicket(dynamicTicketId);
  await checkInTx.wait();
  console.log(`参与者2的动态门票已更改为"已检入"状态`);

  // 验证门票状态
  const ticketInfo = await dynamicTicketNFT.getTicketInfo(dynamicTicketId);
  console.log(`门票状态: ${ticketInfo.state}`); // 1 = CHECKED_IN

  // 5. 测试跨链支付
  console.log("\n测试跨链支付...");
  // 模拟跨链支付流程
  // 首先在源链上进行支付
  const sourceChainPaymentTx = await sourceChainPayment.connect(attendee2).makePayment(
    eventId,
    137, // 目标链ID (Polygon)
    { value: ethers.utils.parseEther("0.02") } // 支付金额
  );
  const sourceChainPaymentReceipt = await sourceChainPaymentTx.wait();
  
  // 从事件中获取支付ID
  const paymentEvent = sourceChainPaymentReceipt.events.find(event => event.event === 'PaymentMade');
  const paymentId = paymentEvent.args.paymentId;
  console.log(`在源链上进行了支付，支付ID: ${paymentId}`);

  // 模拟中继器确认跨链支付
  const txHash = "0x" + "1".repeat(64); // 模拟交易哈希
  const hashedTxId = ethers.utils.solidityKeccak256(["string"], [txHash]);
  
  const recordPaymentTx = await crossChainBridge.connect(deployer).recordCrossChainPayment(
    137, // 源链ID
    hashedTxId, // 哈希化的交易ID
    attendee2.address, // 买家地址
    ethers.constants.AddressZero, // 原生代币
    ethers.utils.parseEther("0.02"), // 支付金额
    eventId // 活动ID
  );
  await recordPaymentTx.wait();
  console.log(`跨链支付已记录到目标链`);

  // 验证跨链支付信息
  const paymentInfo = await crossChainBridge.getPaymentInfo(hashedTxId);
  console.log(`跨链支付信息:`, {
    buyer: paymentInfo.buyer,
    amount: ethers.utils.formatEther(paymentInfo.amount),
    eventId: paymentInfo.eventId.toString(),
    sourceChainId: paymentInfo.sourceChainId.toString(),
    isProcessed: paymentInfo.isProcessed
  });

  // 6. 测试锁定和跨链转移NFT
  console.log("\n测试NFT跨链转移...");
  // 授予eventTicketNFT的批准给NFTBridgeGateway
  const approvalTx = await eventTicketNFT.connect(attendee1).approve(
    nftBridgeGateway.address,
    ticketId
  );
  await approvalTx.wait();
  console.log(`参与者1已授权NFTBridgeGateway锁定其门票NFT`);

  // 锁定并发起跨链迁移
  const lockAndBridgeTx = await nftBridgeGateway.connect(attendee1).lockAndBridge(
    eventTicketNFT.address,
    ticketId,
    137 // 目标链ID (Polygon)
  );
  const lockAndBridgeReceipt = await lockAndBridgeTx.wait();
  
  // 获取桥接请求ID
  const bridgeRequestEvent = lockAndBridgeReceipt.events.find(event => event.name === 'BridgeRequestSent');
  const bridgeRequestId = bridgeRequestEvent.args.requestId;
  console.log(`NFT锁定并发起了跨链迁移，请求ID: ${bridgeRequestId}`);

  // 检查NFT所有权
  const nftOwner = await eventTicketNFT.ownerOf(ticketId);
  console.log(`门票NFT当前所有者: ${nftOwner}`);
  console.log(`NFTBridgeGateway地址: ${nftBridgeGateway.address}`);
  console.log(`NFT已被锁定在桥接合约中`);

  console.log("\n本地测试完成！所有合约功能验证通过。");
}

// 运行测试脚本
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 