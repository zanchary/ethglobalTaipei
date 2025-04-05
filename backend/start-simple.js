#!/usr/bin/env node

/**
 * 简化版本地测试环境启动脚本
 * 
 * 这个脚本会:
 * 1. 启动一个本地Hardhat节点
 * 2. 部署合约: MockWorldID -> WorldIDVerifier -> EventTicketNFT -> EventTicketing
 * 3. 运行基本票务功能测试
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 启动简化版本地测试环境...');

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
        reject(new Error(`命令执行失败，退出码 ${code}`));
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
    console.log('⏳ 等待节点启动（10秒）...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 2. 按顺序部署合约
    console.log('\n🔧 开始按顺序部署合约...');
    
    // 2.1 首先部署MockWorldID
    console.log('\n🔷 部署MockWorldID合约...');
    await runCommand('npx', ['hardhat', 'run', 'scripts/deploy-only.js', '--network', 'localhost']);
    
    // 2.2 然后使用deploy-simple.js部署全部合约
    console.log('\n🔷 部署所有合约...');
    await runCommand('npx', ['hardhat', 'run', 'scripts/deploy-simple.js', '--network', 'localhost']);
    
    // 3. 运行简化版测试脚本
    console.log('\n🧪 运行简化版测试脚本...');
    
    // 这里添加一个小延迟，确保部署完全完成
    console.log('⏳ 等待3秒确保部署完成...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await runCommand('npx', ['hardhat', 'run', 'scripts/test-simple.js', '--network', 'localhost'], {
      ignoreError: true  // 即使测试失败，也继续运行
    });
    
    console.log('\n🎉 部署和测试完成！');
    console.log('=============================================');
    console.log('📝 部署的合约地址应该已经显示在上面的日志中');
    console.log('🏗️  Hardhat节点仍在运行: http://localhost:8545');
    console.log('=============================================');
    console.log('要停止节点，请按 Ctrl+C');
    
    // 保持脚本运行，直到用户按Ctrl+C
    process.stdin.resume();
    
  } catch (error) {
    console.error('❌ 错误:', error);
    console.log('尝试运行具体的部署脚本来排查错误:');
    console.log('1. npx hardhat run scripts/deploy-only.js --network localhost');
    console.log('2. npx hardhat run scripts/deploy-simple.js --network localhost');
    
    // 关闭所有子进程
    processes.forEach(process => {
      process.kill();
    });
    
    process.exit(1);
  }
}

main(); 