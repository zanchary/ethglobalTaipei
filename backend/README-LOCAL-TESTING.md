# 本地测试指南

本文档介绍如何在本地环境中部署和测试ETHGlobalTaipei项目，包括跨链NFT门票系统和动态NFT门票组件。

## 先决条件

- Node.js (v14+)
- npm 或 yarn
- 安装了MetaMask等钱包扩展的浏览器

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

## 使用一键启动脚本（推荐）

我们提供了一个一键启动脚本，可以自动完成所有设置步骤，包括启动本地节点、部署合约、启动服务器以及运行测试脚本：

```bash
node start-local-testing.js
```

该脚本会自动：
1. 启动本地Hardhat节点
2. 部署所有合约
3. 启动元数据服务器和跨链桥监听服务
4. 运行测试脚本

完成后，所有服务将继续运行，直到您按下Ctrl+C停止。

## 手动设置（步骤详解）

如果您想手动执行各个步骤，请按以下指南操作：

### 启动本地节点

在单独的终端窗口中启动本地Hardhat节点：
```bash
npx hardhat node
```

### 部署合约

我们提供了一个综合部署脚本，可以部署所有需要的合约到本地网络：

```bash
npx hardhat run scripts/deploy-local-test.js --network localhost
```

这个脚本会部署以下合约：
- EventTicketing: 活动票务管理合约
- EventTicketNFT: 常规NFT门票合约
- CrossChainBridge: 跨链支付桥
- SourceChainPayment: 源链支付处理
- NFTBridgeGateway: NFT跨链网关
- DynamicTicketNFT: 动态NFT门票
- CrossChainTicketNFT: 跨链NFT门票

部署完成后，脚本会输出一个完整的`.env`文件内容，包含所有合约地址。请将该内容复制到项目根目录的`.env`文件中。

### 运行测试

使用以下命令运行综合测试脚本：

```bash
npx hardhat run scripts/test-local-deployment.js --network localhost
```

这个测试脚本会执行以下操作：
1. 创建活动
2. 购买普通门票
3. 铸造动态NFT门票
4. 更改动态NFT门票状态（检入）
5. 测试跨链支付
6. 测试NFT跨链转移

所有这些操作都使用本地网络上的测试账户完成，不需要真实的加密货币。

### 启动元数据服务器（可选）

如果需要测试动态NFT的元数据功能，可以启动元数据服务器：

```bash
node scripts/dynamic-nft-metadata-server.js
```

服务器默认在http://localhost:3000运行，提供动态NFT的元数据和图像。

### 启动跨链桥监听服务（可选）

要测试完整的跨链功能，可以启动跨链桥监听服务：

```bash
node scripts/nft-bridge-service.js
```

该服务会监听链上事件并处理跨链NFT转移请求。

## 合约组件说明

### 核心票务系统
- **EventTicketing**: 管理活动创建、门票销售和活动管理的主合约
- **EventTicketNFT**: 基本的NFT门票合约，每张票是一个NFT

### 跨链支付系统
- **CrossChainBridge**: 处理不同链之间的支付确认
- **SourceChainPayment**: 在源链上处理支付并发送到目标链

### 动态NFT和跨链NFT
- **DynamicTicketNFT**: 门票状态可变的动态NFT，会根据门票状态改变外观
- **NFTBridgeGateway**: 允许NFT在不同链之间迁移的网关
- **CrossChainTicketNFT**: 在目标链上代表原始链门票的NFT

## 测试账户

Hardhat本地节点默认提供10个测试账户，每个账户有10000个测试ETH。部署脚本使用前4个账户：
- 账户0：部署者/平台管理员
- 账户1：活动组织者
- 账户2：参与者1
- 账户3：参与者2

## 高级测试

### 模拟不同链

本地测试环境在单个Hardhat节点上模拟不同的链。在实际情况下，这些合约应该部署在各自的链上。

### 自定义活动和门票

您可以修改`test-local-deployment.js`脚本来创建自定义活动和门票，例如更改活动参数、门票价格或自定义属性。

### 前端测试

如果要测试前端与合约的交互，请确保前端的`.env`文件包含正确的合约地址（从部署脚本输出获取）。

## 故障排除

### 交易失败
- 检查您有足够的测试ETH
- 确保正在使用正确的账户（部署者、组织者或参与者）
- 查看错误消息以获取具体信息

### 合约部署失败
- 确保Hardhat节点正在运行
- 检查您使用的是localhost网络

### 一键脚本中断
- 如果一键脚本中断，请确保终止所有可能仍在运行的进程
- 检查端口8545和3000是否被其他应用程序占用

## 安全提示

- 本地测试使用的账户和私钥仅用于开发，不应用于生产环境
- 测试`.env`文件中的私钥不应上传到公共仓库
- 生产部署需要安全审计和更严格的权限控制 