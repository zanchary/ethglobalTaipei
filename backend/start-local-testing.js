#!/usr/bin/env node

/**
 * 本地测试环境启动脚本
 * 
 * 这个脚本会:
 * 1. 启动一个本地Hardhat节点
 * 2. 部署所有合约到本地网络
 * 3. 启动元数据服务器和跨链桥监听服务
 * 4. 运行测试脚本
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 启动本地测试环境...');

// 存储所有子进程，以便在Ctrl+C时关闭
const processes = [];

// 创建一个函数来运行命令并返回Promise
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n💻 运行命令: ${command} ${args.join(' ')}`);
    
    const childProcess = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });
    
    if (!options.detached) {
      processes.push(childProcess);
    }

    childProcess.on('close', (code) => {
      if (code !== 0 && !options.ignoreError) {
        reject(new Error(`Command failed with code ${code}`));
      } else {
        resolve();
      }
    });
    
    childProcess.on('error', (err) => {
      reject(err);
    });
  });
}

// 处理Ctrl+C，优雅地关闭所有子进程
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭所有进程...');
  processes.forEach(process => {
    process.kill();
  });
  console.log('再见！👋');
  process.exit();
});

// 主函数
async function main() {
  try {
    // 1. 启动本地Hardhat节点（在后台）
    const hardhatNode = spawn('npx', ['hardhat', 'node'], {
      stdio: 'inherit',
      shell: true,
      detached: true
    });
    processes.push(hardhatNode);
    
    console.log('✅ 本地Hardhat节点已启动');
    
    // 等待节点启动
    console.log('⏳ 等待节点启动（5秒）...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 2. 部署合约
    console.log('\n🏗️ 部署合约...');
    await runCommand('npx', ['hardhat', 'run', 'scripts/deploy-local-test.js', '--network', 'localhost']);
    console.log('✅ 合约部署完成');
    
    // 3. 在后台启动元数据服务器
    console.log('\n🖼️ 启动动态NFT元数据服务器...');
    const metadataServer = spawn('node', ['scripts/dynamic-nft-metadata-server.js'], {
      stdio: 'inherit',
      shell: true,
      detached: true
    });
    processes.push(metadataServer);
    
    // 等待服务器启动
    console.log('⏳ 等待服务器启动（3秒）...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 4. 在后台启动跨链桥监听服务
    console.log('\n🌉 启动跨链桥监听服务...');
    const bridgeService = spawn('node', ['scripts/nft-bridge-service.js'], {
      stdio: 'inherit',
      shell: true,
      detached: true
    });
    processes.push(bridgeService);
    
    // 等待服务启动
    console.log('⏳ 等待服务启动（3秒）...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 5. 运行测试脚本
    console.log('\n🧪 运行测试脚本...');
    await runCommand('npx', ['hardhat', 'run', 'scripts/test-local-deployment.js', '--network', 'localhost']);
    console.log('✅ 测试完成');
    
    console.log('\n🎉 本地测试环境已成功启动！');
    console.log('=============================================');
    console.log('🏗️  Hardhat节点运行中: http://localhost:8545');
    console.log('🖼️  元数据服务器运行中: http://localhost:3000');
    console.log('🌉  跨链桥监听服务运行中');
    console.log('=============================================');
    console.log('要停止所有服务，请按 Ctrl+C');
    
    // 保持脚本运行，直到用户按Ctrl+C
    process.stdin.resume();
    
  } catch (error) {
    console.error('❌ 错误:', error);
    
    // 关闭所有子进程
    processes.forEach(process => {
      process.kill();
    });
    
    process.exit(1);
  }
}

main(); 