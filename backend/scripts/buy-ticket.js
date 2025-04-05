#!/usr/bin/env node
/**
 * 票据购买脚本
 * 此脚本用于购买活动票据
 * 使用方法: npx hardhat run scripts/buy-ticket.js --network worldchain
 */

const { ethers } = require("hardhat");
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("🎟️ 开始购票流程...");

  try {
    // 获取网络信息
    const network = await ethers.provider.getNetwork();
    console.log(`已连接到网络: ${network.name} (链ID: ${network.chainId})`);

    // 获取账户信息
    const [buyer] = await ethers.getSigners();
    console.log(`使用账户: ${buyer.address}`);

    // 获取余额
    const balance = await ethers.provider.getBalance(buyer.address);
    console.log(`账户余额: ${ethers.formatEther(balance)} ETH`);

    // 获取合约地址
    const eventTicketingAddress = process.env.WORLD_CHAIN_EVENT_TICKETING_ADDRESS;
    if (!eventTicketingAddress) {
      console.error("错误: 缺少合约地址。请在.env文件中设置WORLD_CHAIN_EVENT_TICKETING_ADDRESS");
      return;
    }
    console.log(`EventTicketing合约地址: ${eventTicketingAddress}`);

    // 获取合约实例
    const EventTicketing = await ethers.getContractFactory("EventTicketing");
    const eventTicketing = await EventTicketing.attach(eventTicketingAddress);

    // 检查合约是否可访问
    try {
      const nextEventId = await eventTicketing.nextEventId();
      console.log(`合约可访问，下一个事件ID: ${nextEventId}`);
    } catch (error) {
      console.error("错误: 无法访问EventTicketing合约:", error.message);
      return;
    }

    // 获取事件ID
    let eventId;
    if (process.env.WORLD_CHAIN_EVENT_ID) {
      eventId = parseInt(process.env.WORLD_CHAIN_EVENT_ID);
    } else {
      // 如果没有设置事件ID，获取第一个事件
      try {
        eventId = 0; // 尝试第一个事件
        console.log(`未找到WORLD_CHAIN_EVENT_ID环境变量，使用默认事件ID: ${eventId}`);
      } catch (error) {
        console.error("错误: 无法找到事件。请创建一个事件或在.env文件中设置WORLD_CHAIN_EVENT_ID");
        return;
      }
    }

    // 获取事件详情
    console.log(`获取事件ID ${eventId} 的详情...`);
    try {
      const eventDetails = await eventTicketing.getEventDetails(eventId);
      
      const eventInfo = {
        name: eventDetails[0],
        description: eventDetails[1],
        eventDate: new Date(Number(eventDetails[2]) * 1000).toLocaleString(),
        totalTickets: eventDetails[3].toString(),
        ticketsSold: eventDetails[4].toString(),
        ticketPrice: ethers.formatEther(eventDetails[5]),
        ticketPriceWei: eventDetails[5].toString(),
        organizer: eventDetails[6],
        isActive: eventDetails[7],
        worldIdRequired: eventDetails[8]
      };

      console.log("事件详情:", eventInfo);

      // 检查事件是否激活
      if (!eventInfo.isActive) {
        console.error("错误: 此事件已被取消或不再活跃");
        return;
      }

      // 检查是否还有票
      if (eventInfo.ticketsSold >= eventInfo.totalTickets) {
        console.error("错误: 此事件已售罄");
        return;
      }

      // 检查事件日期是否在未来
      const eventDate = new Date(Number(eventDetails[2]) * 1000);
      if (eventDate <= new Date()) {
        console.error("错误: 此事件已经过期");
        return;
      }

      // 购买票据
      console.log(`准备购买票据，票价: ${eventInfo.ticketPrice} ETH`);
      
      // 请求用户确认
      console.log("\n⚠️ 即将发送交易购买票据。请确认以上信息无误。");
      console.log("按下回车键继续...");
      await new Promise(resolve => {
        process.stdin.once('data', () => {
          resolve();
        });
      });

      // 发送交易购买票据
      console.log("\n📝 提交购票交易...");
      
      const tx = await eventTicketing.buyTicket(eventId, {
        value: eventInfo.ticketPriceWei,
        gasLimit: 1000000
      });

      console.log(`交易已提交: ${tx.hash}`);
      console.log("等待交易确认...");

      // 等待交易确认
      const receipt = await tx.wait();
      console.log(`交易已确认，区块号: ${receipt.blockNumber}`);

      // 解析事件日志获取票据ID
      const ticketMintedEvent = receipt.logs
        .map(log => {
          try {
            return eventTicketing.interface.parseLog(log);
          } catch (e) {
            return null;
          }
        })
        .filter(log => log !== null && log.name === 'TicketMinted')[0];

      if (ticketMintedEvent) {
        const tokenId = ticketMintedEvent.args[0].toString();
        console.log(`\n✅ 票据购买成功!`);
        console.log(`票据ID: ${tokenId}`);
        console.log(`事件ID: ${eventId}`);
        console.log(`票价: ${eventInfo.ticketPrice} ETH`);

        // 将票据ID保存到.env文件
        console.log(`\n如需在其他脚本中使用此票据ID，请将以下行添加到.env文件:`);
        console.log(`WORLD_CHAIN_TICKET_ID=${tokenId}`);

        // 提示用户生成QR码
        console.log(`\n可以使用以下命令生成此票据的QR码:`);
        console.log(`npx hardhat run scripts/generate-qrcode.js --network worldchain ${tokenId}`);
      } else {
        console.log("无法从交易日志中找到票据ID");
      }

    } catch (error) {
      console.error("获取事件详情或购票时出错:", error.message);
      
      if (error.message.includes("insufficient funds")) {
        console.error("\n余额不足。请确保您有足够的ETH支付票价和gas费用。");
      } else if (error.message.includes("execution reverted")) {
        console.error("\n交易执行失败。可能的原因:");
        console.error("1. 事件不存在");
        console.error("2. 事件已过期或已取消");
        console.error("3. 票据已售罄");
        console.error("4. 支付金额与票价不符");
      }
    }

  } catch (error) {
    console.error("\n❌ 购票流程失败:", error.message);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  }); 