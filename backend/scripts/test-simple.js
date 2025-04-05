// 简化版测试脚本 - 只测试EventTicketing和EventTicketNFT
const { ethers } = require("hardhat");
const deploySimple = require("./deploy-simple");
require('dotenv').config();

async function main() {
  console.log("开始测试基本票务功能...");

  // 部署合约
  console.log("首先部署基本票务合约...");
  const contracts = await deploySimple();
  
  const {
    eventTicketing,
    eventTicketNFT
  } = contracts;

  // 获取部署者账户和一些测试账户
  const [deployer, organizer, attendee1, attendee2] = await ethers.getSigners();
  console.log("测试账户:");
  console.log("- 部署者/平台管理员:", deployer.address);
  console.log("- 活动组织者:", organizer.address);
  console.log("- 参与者1:", attendee1.address);
  console.log("- 参与者2:", attendee2.address);

  // 先验证组织者
  console.log("\n验证活动组织者...");
  const verifyOrganizerTx = await eventTicketing.verifyOrganizer(organizer.address);
  await verifyOrganizerTx.wait();
  console.log("已验证活动组织者");

  // 1. 测试创建活动
  console.log("\n测试创建活动...");
  const currentTime = Math.floor(Date.now() / 1000);
  const eventStartTime = currentTime + 3600; // 1小时后开始
  const eventEndTime = currentTime + 7200; // 2小时后结束
  const registrationDeadline = currentTime + 2700; // 45分钟后截止注册

  // 活动组织者需要有一些ETH来支付创建活动的费用
  const transferTx = await deployer.sendTransaction({
    to: organizer.address,
    value: ethers.parseEther("1.0")
  });
  await transferTx.wait();
  console.log("已向活动组织者转入1 ETH");

  // 创建活动
  const createEventTx = await eventTicketing.connect(organizer).createEvent(
    "测试活动", // 名称
    "这是一个简单的测试活动", // 描述
    currentTime, // 开始时间
    eventStartTime, // 结束时间
    eventEndTime, // 结束时间
    100, // 总票数
    ethers.parseEther("0.01"), // 票价：0.01 ETH
    false, // 是否允许转售
    0, // 转售截止时间
    "ipfs://QmTest", // 活动图片URI
    false, // 是否需要World ID验证
    { value: ethers.parseEther("0.01") } // 创建活动需要支付平台费用
  );

  console.log("等待创建活动交易确认...");
  const createEventReceipt = await createEventTx.wait();
  
  // ethers v6中事件处理稍有不同
  const eventCreatedEvent = createEventReceipt.logs.find(
    log => log.fragment && log.fragment.name === 'EventCreated'
  );
  
  if (!eventCreatedEvent) {
    console.error("未找到EventCreated事件");
    return;
  }
  
  const eventId = eventCreatedEvent.args[0]; // 第一个参数是eventId
  console.log(`活动创建成功，ID: ${eventId}`);

  // 获取活动详情
  const eventDetails = await eventTicketing.events(eventId);
  console.log("活动详情:", {
    name: eventDetails.name,
    organizer: eventDetails.organizer,
    totalTickets: eventDetails.totalTickets.toString(),
    ticketPrice: ethers.formatEther(eventDetails.ticketPrice),
    ticketsAvailable: eventDetails.ticketsAvailable.toString()
  });

  // 2. 测试购买门票
  console.log("\n测试购买门票...");
  
  // 向参与者1转入一些ETH
  const transferTx1 = await deployer.sendTransaction({
    to: attendee1.address,
    value: ethers.parseEther("0.1")
  });
  await transferTx1.wait();
  console.log("已向参与者1转入0.1 ETH");
  
  const buyTicketTx = await eventTicketing.connect(attendee1).buyTicket(
    eventId,
    { value: eventDetails.ticketPrice } // 支付票价
  );
  const buyTicketReceipt = await buyTicketTx.wait();
  console.log(`参与者1购买了活动 ${eventId} 的门票`);

  // 搜索TicketMinted事件
  const ticketMintedEvent = buyTicketReceipt.logs.find(
    log => log.fragment && log.fragment.name === 'TicketMinted'
  );
  
  if (!ticketMintedEvent) {
    console.error("未找到TicketMinted事件");
    return;
  }
  
  const ticketId1 = ticketMintedEvent.args[0]; // 第一个参数是tokenId
  console.log(`门票ID: ${ticketId1}`);

  // 再购买一张给参与者2
  const transferTx2 = await deployer.sendTransaction({
    to: attendee2.address,
    value: ethers.parseEther("0.1")
  });
  await transferTx2.wait();
  console.log("已向参与者2转入0.1 ETH");
  
  const buyTicket2Tx = await eventTicketing.connect(attendee2).buyTicket(
    eventId,
    { value: eventDetails.ticketPrice } // 支付票价
  );
  const buyTicket2Receipt = await buyTicket2Tx.wait();
  console.log(`参与者2购买了活动 ${eventId} 的门票`);

  // 搜索TicketMinted事件
  const ticketMintedEvent2 = buyTicket2Receipt.logs.find(
    log => log.fragment && log.fragment.name === 'TicketMinted'
  );
  
  if (!ticketMintedEvent2) {
    console.error("未找到TicketMinted事件");
    return;
  }
  
  const ticketId2 = ticketMintedEvent2.args[0]; // 第一个参数是tokenId
  console.log(`门票ID: ${ticketId2}`);

  // 3. 检查门票NFT
  console.log("\n检查门票NFT...");
  
  // 检查参与者1的门票
  const attendee1TicketBalance = await eventTicketNFT.balanceOf(attendee1.address);
  console.log(`参与者1拥有的门票数量: ${attendee1TicketBalance}`);
  
  // 获取门票URI
  const ticketURI1 = await eventTicketNFT.tokenURI(ticketId1);
  console.log(`参与者1门票的URI: ${ticketURI1}`);
  
  // 检查参与者2的门票
  const attendee2TicketBalance = await eventTicketNFT.balanceOf(attendee2.address);
  console.log(`参与者2拥有的门票数量: ${attendee2TicketBalance}`);
  
  // 4. 测试活动状态
  console.log("\n检查活动状态...");
  const updatedEventDetails = await eventTicketing.events(eventId);
  console.log("更新后的活动详情:", {
    totalTickets: updatedEventDetails.totalTickets.toString(),
    ticketsAvailable: updatedEventDetails.ticketsAvailable.toString(),
    ticketsSold: updatedEventDetails.ticketsSold.toString()
  });
  
  // 5. 测试检票功能
  console.log("\n测试检票功能...");
  // 由活动组织者检票
  const validateTicketTx = await eventTicketing.connect(organizer).validateTicket(eventId, ticketId1);
  await validateTicketTx.wait();
  console.log(`参与者1的门票已被验证`);
  
  // 检查门票状态
  const isValidated = await eventTicketing.isTicketValidated(eventId, ticketId1);
  console.log(`参与者1的门票验证状态: ${isValidated ? "已验证" : "未验证"}`);
  
  console.log("\n基本票务功能测试完成！");
}

// 运行测试脚本
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 