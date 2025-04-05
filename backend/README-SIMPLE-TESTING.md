# 简化版票务系统测试指南

本文档介绍如何在本地环境中测试基本票务系统（EventTicketing和EventTicketNFT）的功能，不包括NFT跨链桥接相关功能。

## 先决条件

- Node.js (v14+)
- npm 或 yarn

## 环境设置

1. 克隆仓库并进入backend目录
```bash
git clone <repository-url>
cd ethglobalTaipei/backend
```

2. 安装依赖
```bash
npm install
```

## 使用一键启动脚本

我们提供了一个简化版的一键启动脚本，只测试基本票务功能：

```bash
node start-simple.js
```

该脚本会自动：
1. 启动本地Hardhat节点
2. 部署EventTicketing和EventTicketNFT合约
3. 运行基本票务功能测试

完成后，Hardhat节点将继续运行，直到您按下Ctrl+C停止。

## 手动步骤

如果您想手动执行各个步骤，可以按以下指南操作：

### 启动本地节点

在单独的终端窗口中启动本地Hardhat节点：
```bash
npx hardhat node
```

### 部署并测试合约

我们提供了一个简化版的测试脚本，它会先部署必要的合约，然后执行基本票务功能测试：

```bash
npx hardhat run scripts/test-simple.js --network localhost
```

### 只部署合约（可选）

如果您只想部署合约而不运行测试：

```bash
npx hardhat run scripts/deploy-simple.js --network localhost
```

## 测试功能说明

简化版测试脚本会测试以下功能：

1. **创建活动**：由组织者创建一个测试活动
2. **购买门票**：两个参与者各购买一张门票
3. **检查NFT门票**：验证NFT门票已成功铸造和分发
4. **检查活动状态**：确认门票销售后活动状态的更新
5. **检票验证**：组织者对参与者的门票进行验证

## 测试账户

Hardhat本地节点默认提供10个测试账户，每个账户有10000个测试ETH。测试脚本使用前4个账户：
- 账户0：部署者/平台管理员
- 账户1：活动组织者
- 账户2：参与者1
- 账户3：参与者2

## 合约说明

### EventTicketing
主要的票务管理合约，负责：
- 活动的创建和管理
- 门票销售和退款处理
- 检票和验证

### EventTicketNFT
NFT门票合约，每张票是一个NFT，具有：
- 所有权追踪
- 元数据URI存储
- 转移限制（可选）

## 与前端集成

如果您想将前端与部署的合约集成，请确保：

1. 从部署输出中获取合约地址
2. 更新您的前端以使用这些地址
3. 本地前端连接到localhost:8545上的Hardhat节点

## 故障排除

### 交易失败
- 检查您有足够的测试ETH
- 确保正在使用正确的账户（部署者、组织者或参与者）
- 查看错误消息以获取具体信息

### 合约部署失败
- 确保Hardhat节点正在运行
- 检查您使用的是localhost网络

### 一键脚本中断
- 如果脚本中断，请确保终止所有可能仍在运行的进程
- 检查端口8545是否被其他应用程序占用 