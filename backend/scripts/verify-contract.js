#!/usr/bin/env node
/**
 * 合约验证脚本
 * 此脚本用于在WorldChain上验证智能合约
 * 使用方法: npx hardhat run scripts/verify-contract.js --network worldchain
 */

const { run } = require("hardhat");
require('dotenv').config();

// 添加延迟函数
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 添加带重试的函数执行
async function withRetry(fn, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const initialDelay = options.initialDelay || 5000;
  const description = options.description || "操作";
  
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      // 检查是否为"Too Many Requests"错误或其他可重试错误
      if ((error.message && error.message.includes("Too Many Requests") || 
           error.message && error.message.includes("rate limit") ||
           error.message && error.message.includes("timeout")) && 
          attempt < maxRetries - 1) {
        const waitTime = initialDelay * Math.pow(2, attempt); // 指数退避
        console.log(`${description}遇到错误: ${error.message}`);
        console.log(`等待${waitTime/1000}秒后重试 (${attempt + 1}/${maxRetries})...`);
        await delay(waitTime);
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

async function main() {
  console.log("开始合约验证流程...");

  try {
    // 获取合约地址
    const eventTicketingAddress = process.env.WORLD_CHAIN_EVENT_TICKETING_ADDRESS;
    const eventTicketNFTAddress = process.env.WORLD_CHAIN_EVENT_TICKET_NFT_ADDRESS;
    
    if (!eventTicketingAddress) {
      console.error("错误: 缺少EventTicketing合约地址。请在.env文件中设置WORLD_CHAIN_EVENT_TICKETING_ADDRESS");
      return;
    }

    if (!eventTicketNFTAddress) {
      console.error("错误: 缺少EventTicketNFT合约地址。请在.env文件中设置WORLD_CHAIN_EVENT_TICKET_NFT_ADDRESS");
      return;
    }

    console.log(`EventTicketing合约地址: ${eventTicketingAddress}`);
    console.log(`EventTicketNFT合约地址: ${eventTicketNFTAddress}`);

    // 验证EventTicketNFT合约
    console.log("\n正在验证EventTicketNFT合约...");
    try {
      await withRetry(
        async () => {
          await run("verify:verify", {
            address: eventTicketNFTAddress,
            constructorArguments: [],
          });
        },
        { 
          maxRetries: 5, 
          initialDelay: 10000, 
          description: "EventTicketNFT验证" 
        }
      );
      console.log("✅ EventTicketNFT合约验证成功!");
    } catch (error) {
      if (error.message.includes("Already Verified")) {
        console.log("✅ EventTicketNFT合约已经验证过了");
      } else {
        console.error("❌ EventTicketNFT合约验证失败:", error.message);
      }
    }

    // 获取WorldIDVerifier地址
    const worldIDVerifierAddress = process.env.WORLD_CHAIN_WORLD_ID_VERIFIER_ADDRESS;
    // 获取CrossChainBridge地址
    const crossChainBridgeAddress = process.env.WORLD_CHAIN_CROSS_CHAIN_BRIDGE_ADDRESS;

    if (!worldIDVerifierAddress || !crossChainBridgeAddress) {
      console.log("缺少WorldIDVerifier或CrossChainBridge地址，跳过EventTicketing合约验证");
      console.log("请在.env文件中设置WORLD_CHAIN_WORLD_ID_VERIFIER_ADDRESS和WORLD_CHAIN_CROSS_CHAIN_BRIDGE_ADDRESS");
      return;
    }

    // 验证EventTicketing合约
    console.log("\n正在验证EventTicketing合约...");
    try {
      await withRetry(
        async () => {
          await run("verify:verify", {
            address: eventTicketingAddress,
            constructorArguments: [
              eventTicketNFTAddress,
              worldIDVerifierAddress,
              crossChainBridgeAddress
            ],
          });
        },
        { 
          maxRetries: 5, 
          initialDelay: 10000, 
          description: "EventTicketing验证" 
        }
      );
      console.log("✅ EventTicketing合约验证成功!");
    } catch (error) {
      if (error.message.includes("Already Verified")) {
        console.log("✅ EventTicketing合约已经验证过了");
      } else {
        console.error("❌ EventTicketing合约验证失败:", error.message);
        console.log("请确保构造函数参数与部署时一致。如果参数不同，请手动更新脚本中的参数。");
      }
    }

  } catch (error) {
    console.error("验证过程中出错:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  }); 