const { ethers } = require("hardhat");
require('dotenv').config();
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("Starting QR code generation script...");

  try {
    // 获取网络信息
    const network = await ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

    // 加载合约地址
    const eventTicketingAddress = process.env.WORLD_CHAIN_EVENT_TICKETING_ADDRESS;
    const eventTicketNFTAddress = process.env.WORLD_CHAIN_EVENT_TICKET_NFT_ADDRESS;

    if (!eventTicketingAddress || !eventTicketNFTAddress) {
      console.error("错误: 缺少合约地址。请在.env文件中设置WORLD_CHAIN_EVENT_TICKETING_ADDRESS和WORLD_CHAIN_EVENT_TICKET_NFT_ADDRESS");
      return;
    }

    console.log(`EventTicketing合约地址: ${eventTicketingAddress}`);
    console.log(`EventTicketNFT合约地址: ${eventTicketNFTAddress}`);

    // 获取账户连接
    const [deployer] = await ethers.getSigners();
    console.log("使用账户:", deployer.address);

    // 检查账户余额
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`账户余额: ${ethers.formatEther(balance)} ETH`);

    // 获取合约实例
    const EventTicketing = await ethers.getContractFactory("EventTicketing");
    const eventTicketing = EventTicketing.attach(eventTicketingAddress);

    const EventTicketNFT = await ethers.getContractFactory("EventTicketNFT");
    const eventTicketNFT = EventTicketNFT.attach(eventTicketNFTAddress);

    // 检查合约是否可访问
    try {
      const nextEventId = await eventTicketing.nextEventId();
      console.log(`合约可成功访问，下一个事件ID: ${nextEventId}`);
    } catch (error) {
      console.error("错误: 无法访问EventTicketing合约:", error.message);
      return;
    }

    // 从命令行获取票据ID或使用默认值
    const tokenId = process.argv[2] ? Number(process.argv[2]) : 1;
    console.log(`生成票据ID ${tokenId} 的QR码`);

    // 检查票据是否存在
    let ticketExists = false;
    try {
      // 直接尝试获取所有者
      const ticketOwner = await eventTicketNFT.ownerOf(tokenId);
      console.log(`票据所有者: ${ticketOwner}`);
      ticketExists = true;
    } catch (error) {
      if (error.message.includes("owner query for nonexistent token")) {
        console.error(`错误: 票据ID ${tokenId} 不存在`);
      } else if (error.message.includes("execution reverted")) {
        console.error(`错误: 合约执行失败。可能的原因:`);
        console.error("1. 票据ID不存在");
        console.error("2. 票据ID超出了范围");
        console.error("3. 合约地址可能不正确");
      } else {
        console.error("查询票据所有者时出错:", error.message);
      }
      
      // 提供购票建议
      console.log("\n您可能需要先创建票据或购买票据。");
      console.log("例如，运行以下命令创建活动和购买票据:");
      console.log("npx hardhat run scripts/create-event.js --network worldchain");
      console.log("npx hardhat run scripts/buy-ticket.js --network worldchain");
      return;
    }

    if (!ticketExists) {
      return;
    }

    // 获取票据信息
    try {
      const ticketInfo = await eventTicketNFT.getTicketInfo(tokenId);
      console.log(`票据信息:`, {
        eventId: ticketInfo.eventId.toString(),
        ticketIndex: ticketInfo.ticketIndex.toString(),
        purchasePrice: ethers.formatEther(ticketInfo.purchasePrice),
        isUsed: await eventTicketNFT.isTicketUsed(tokenId)
      });

      // 检查票据是否已使用
      const isUsed = await eventTicketNFT.isTicketUsed(tokenId);
      if (isUsed) {
        console.warn("警告: 此票据已被使用");
      }

      // 生成QR码数据
      console.log("从合约生成QR码数据...");
      const qrData = await eventTicketing.generateQRCodeData(tokenId);
      console.log("QR码数据生成 (hex):", qrData);

      // 转换QR数据为base64格式
      const qrDataBase64 = Buffer.from(qrData.slice(2), 'hex').toString('base64');
      console.log("QR码数据 (base64):", qrDataBase64);

      // 保存QR码数据到文件
      const qrDataDir = path.join(__dirname, '../qr-codes');
      if (!fs.existsSync(qrDataDir)) {
        fs.mkdirSync(qrDataDir, { recursive: true });
      }

      // 生成QR码图像
      const qrCodePath = path.join(qrDataDir, `ticket-${tokenId}.png`);
      await QRCode.toFile(qrCodePath, qrDataBase64);
      console.log(`QR码图像已保存到: ${qrCodePath}`);

      // 同时保存原始数据以便于访问
      const qrDataPath = path.join(qrDataDir, `ticket-${tokenId}-data.txt`);
      fs.writeFileSync(qrDataPath, qrDataBase64);
      console.log(`QR码数据已保存到: ${qrDataPath}`);

      // 验证QR码
      console.log("\n验证QR码数据...");
      const maxAgeSeconds = 3600; // 设置最大有效期为1小时
      try {
        const verifyResult = await eventTicketing.verifyQRCode(qrData, maxAgeSeconds);
        
        console.log("验证结果:", {
          isValid: verifyResult[0],
          tokenId: verifyResult[1].toString(),
          eventId: verifyResult[2].toString(),
          owner: verifyResult[3]
        });
      } catch (error) {
        console.error("验证QR码时出错:", error.message);
      }

      // 获取活动详情
      try {
        const eventDetails = await eventTicketing.getEventDetails(ticketInfo.eventId);
        console.log("\n活动详情:");
        console.log({
          name: eventDetails[0],
          description: eventDetails[1],
          date: new Date(Number(eventDetails[2]) * 1000).toISOString(),
          organizer: eventDetails[6]
        });
      } catch (error) {
        console.log("无法获取活动详情:", error.message);
      }

    } catch (error) {
      console.error("获取票据信息时出错:", error.message);
    }
  } catch (error) {
    console.error("运行脚本时发生错误:", error);
  }
}

// 运行脚本
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("运行时错误:", error);
    process.exit(1);
  }); 