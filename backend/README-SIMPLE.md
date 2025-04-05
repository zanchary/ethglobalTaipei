# 简化版票务系统测试指南

这是一个简化版的票务系统测试指南，用于测试`EventTicketing`和`EventTicketNFT`合约，不包括跨链NFT桥接功能。

## 准备工作

1. 安装依赖
```bash
cd backend
npm install
```

## 运行步骤

### 方法1：使用一键启动脚本（推荐）

```bash
node start-simple.js
```

该脚本会自动：
1. 启动本地Hardhat节点
2. 部署基本票务合约
3. 执行基本票务测试

### 方法2：手动步骤

1. 启动本地Hardhat节点
```bash
npx hardhat node
```

2. 部署最简单的NFT合约（测试部署功能）
```bash
npx hardhat run scripts/deploy-only.js --network localhost
```

3. 部署完整的票务系统并测试
```bash
npx hardhat run scripts/test-simple.js --network localhost
```

## 功能说明

简化版系统测试以下功能：
1. 部署`EventTicketNFT`和`EventTicketing`合约
2. 验证活动组织者
3. 创建活动
4. 购买门票
5. 检票与验证

## 故障排除

如果遇到问题，可以尝试以下方法：

### 常见错误

1. **合约地址为undefined**：确保等待部署交易完成后再访问合约地址
   
2. **事件处理错误**：在ethers.js v6中，事件处理方式有所不同，使用`logs.find(log => log.fragment && log.fragment.name === 'EventName')`来查找事件

3. **部署失败**：
   - 确保Hardhat节点正在运行
   - 检查合约编译是否成功
   - 检查合约参数是否正确

### 重置环境

如果需要重置测试环境，关闭所有终端窗口，重新开始测试过程。 