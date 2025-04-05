#!/usr/bin/env node
/**
 * 活动创建脚本
 * 此脚本用于创建新的活动，使用预设参数
 * 使用方法: npx hardhat run scripts/create-event.js --network worldchain
 * 
 * 如果需要修改活动参数，请编辑本脚本中的 DEFAULT_EVENT_PARAMS 对象
 * 
 * 注意: 如果遇到"Too Many Requests"错误，请等待几分钟后再试
 */

require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

// 默认活动参数 - 可以根据需要修改这些值
const DEFAULT_EVENT_PARAMS = {
  name: "ETHGlobal Taipei 2025",
  description: "A global hackathon for Ethereum developers in Taipei",
  totalTickets: 100,
  ticketPrice: "0.001", // ETH
  daysInFuture: 7,
  worldIdRequired: false
};

// 延迟函数
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  try {
    console.log("🎫 开始创建活动...");

    // 使用默认参数
    const eventName = DEFAULT_EVENT_PARAMS.name;
    const eventDescription = DEFAULT_EVENT_PARAMS.description;
    const totalTickets = DEFAULT_EVENT_PARAMS.totalTickets;
    const ticketPrice = ethers.parseEther(DEFAULT_EVENT_PARAMS.ticketPrice); // 转换为 wei
    const daysInFuture = DEFAULT_EVENT_PARAMS.daysInFuture;
    const worldIdRequired = DEFAULT_EVENT_PARAMS.worldIdRequired;

    // 计算未来的日期
    const eventDate = Math.floor(Date.now() / 1000) + (daysInFuture * 24 * 60 * 60);

    // 显示参数概述
    console.log("\n📋 活动详情:");
    console.log(`活动名称: ${eventName}`);
    console.log(`活动描述: ${eventDescription}`);
    console.log(`总票数: ${totalTickets}`);
    console.log(`票价: ${DEFAULT_EVENT_PARAMS.ticketPrice} ETH`);
    console.log(`活动日期: ${new Date(eventDate * 1000).toLocaleString()} (${daysInFuture} 天后)`);
    console.log(`是否需要 World ID 验证: ${worldIdRequired ? '是' : '否'}\n`);

    // 获取 Hardhat 运行时环境
    console.log("使用 Hardhat 环境...");
    const [deployer] = await ethers.getSigners();
    const wallet = deployer;
    const networkInfo = await network.provider.send("eth_chainId").then(chainIdHex => {
      const chainId = parseInt(chainIdHex, 16);
      return { chainId, name: network.name };
    });
    
    console.log(`已连接到网络: ${networkInfo.name} (链ID: ${networkInfo.chainId})`);
    console.log(`使用地址: ${wallet.address}`);

    // 确认余额
    const balanceWei = await ethers.provider.getBalance(wallet.address);
    const balance = ethers.formatEther(balanceWei);
    console.log(`账户余额: ${balance} ETH`);
    if (balanceWei === 0n) {
      console.error("错误: 账户余额为零");
      process.exit(1);
    }

    // 获取合约地址
    const contractAddress = process.env.WORLD_CHAIN_EVENT_TICKETING_ADDRESS;
    if (!contractAddress) {
      console.error("错误: 在 .env 文件中未找到 WORLD_CHAIN_EVENT_TICKETING_ADDRESS");
      process.exit(1);
    }

    // 创建合约实例 - 使用合约工厂获取 ABI
    const EventTicketing = await ethers.getContractFactory("EventTicketing");
    const contract = EventTicketing.attach(contractAddress);
    console.log(`使用合约地址: ${contractAddress}`);

    // 请求用户确认
    console.log("\n⚠️ 即将提交交易创建此活动。请确认以上信息无误。");
    console.log("按下回车键继续...");
    await new Promise(resolve => {
      process.stdin.once('data', () => {
        resolve();
      });
    });

    // 创建活动
    console.log("\n📝 提交创建活动的交易...");
    
    // 添加重试逻辑
    let tx = null;
    let attempt = 0;
    const maxAttempts = 3;
    
    while (attempt < maxAttempts) {
      try {
        tx = await contract.createEvent(
          eventName,
          eventDescription,
          eventDate,
          totalTickets,
          ticketPrice,
          worldIdRequired,
          {
            gasLimit: 1000000 // 设置足够高的 gas limit 以确保交易成功
          }
        );
        break; // 如果成功，跳出循环
      } catch (error) {
        attempt++;
        if (error.message && error.message.includes("Too Many Requests") && attempt < maxAttempts) {
          const waitTime = 5000 * Math.pow(2, attempt - 1); // 指数退避：5秒，10秒，20秒
          console.log(`\n⚠️ 请求过于频繁，等待 ${waitTime/1000} 秒后重试 (尝试 ${attempt}/${maxAttempts})...`);
          await delay(waitTime);
          continue;
        }
        throw error; // 其他错误或最后一次尝试失败，抛出异常
      }
    }

    if (!tx) {
      throw new Error("创建活动交易失败，请稍后再试");
    }

    console.log(`交易已提交: ${tx.hash}`);
    console.log("等待交易确认...");

    // 等待交易确认 - 带重试
    let receipt = null;
    attempt = 0;
    
    while (attempt < maxAttempts) {
      try {
        receipt = await tx.wait();
        break; // 如果成功，跳出循环
      } catch (error) {
        attempt++;
        if (error.message && error.message.includes("Too Many Requests") && attempt < maxAttempts) {
          const waitTime = 5000 * Math.pow(2, attempt - 1);
          console.log(`\n⚠️ 确认交易时请求过于频繁，等待 ${waitTime/1000} 秒后重试 (尝试 ${attempt}/${maxAttempts})...`);
          await delay(waitTime);
          continue;
        }
        throw error;
      }
    }

    if (!receipt) {
      throw new Error("无法获取交易收据，但交易可能已成功。请检查区块链浏览器。");
    }

    console.log(`交易已确认，区块号: ${receipt.blockNumber}`);

    // 从事件日志中获取 eventId
    const eventId = receipt.logs
      .map(log => {
        try {
          return contract.interface.parseLog(log);
        } catch (e) {
          return null;
        }
      })
      .filter(log => log !== null && log.name === 'EventCreated')
      .map(log => log.args[0].toString())[0] || "无法确定";

    console.log(`\n✅ 活动创建成功!`);
    console.log(`活动 ID: ${eventId}`);
    console.log(`活动名称: ${eventName}`);
    console.log(`总票数: ${totalTickets}`);
    console.log(`活动日期: ${new Date(eventDate * 1000).toLocaleString()}`);

    // 保存活动信息到文件
    const eventInfo = {
      id: eventId,
      name: eventName,
      description: eventDescription,
      totalTickets,
      ticketPrice: DEFAULT_EVENT_PARAMS.ticketPrice,
      eventDate,
      worldIdRequired,
      transactionHash: tx.hash,
      createdAt: new Date().toISOString()
    };

    const outputDir = path.join(__dirname, '../eventInfo');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputFile = path.join(
      outputDir, 
      `event_${eventId}_${eventName.replace(/[^a-zA-Z0-9]/g, '_')}.json`
    );
    
    fs.writeFileSync(outputFile, JSON.stringify(eventInfo, null, 2));
    console.log(`\n📄 活动信息已保存到: ${outputFile}`);
    
    // 添加到 .env 文件
    console.log(`\n如需在其他脚本中使用此活动ID，请将以下行添加到 .env 文件:`);
    console.log(`WORLD_CHAIN_EVENT_ID=${eventId}`);
    
  } catch (error) {
    console.error("\n❌ 创建活动失败:");
    if (error.message && error.message.includes("Too Many Requests")) {
      console.error("错误: API 请求过于频繁，请稍后再试");
      console.error("建议: 等待几分钟后重试，或尝试以下方法:");
      console.error("1. 修改 hardhat.config.js 文件，使用其他 RPC 提供商");
      console.error("2. 创建新的 Alchemy API 密钥并更新在 .env 文件中");
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
}); 