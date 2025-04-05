# Mini Apps Web 3 Template

The intention for this project is to enable Mini App Builders to easily create new Next.js mini apps.

The example implemented here is a simple mini app that makes you connect and claim a simple ERC20 token every 5 minutes.

## Basic Commands used

1. Connect Wallet or Wallet Auth using Next Auth for Sessions
2. Verify With World ID Command requesting Orb verification level to proceed.
3. Send Transaction for minting and send the user a $TUTE ERC 20 token just for being verified. This refreshes every 5 minutes.

---

## Dependencies

- **[pnpm](https://pnpm.io/)**: Fast and efficient package manager.
- **[ngrok](https://ngrok.com/)**: Expose your local server publicly for easy testing.
- **[mini-kit-js](https://www.npmjs.com/package/@worldcoin/mini-kit-js)**: JavaScript SDK for World's Mini Apps.
- **[minikit-react](https://www.npmjs.com/package/@worldcoin/minikit-react)**: React bindings for MiniKit SDK.
- **[mini-apps-ui-kit-react](https://www.npmjs.com/package/@worldcoin/mini-apps-ui-kit-react)**: Pre-built UI components for Mini Apps.

---

## 🛠️ Setup

### 1. Clone the repository

```bash
git clone https://github.com/mateosauton/MiniAppWeb3template.git
cd MiniAppWeb3template
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure your environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Then fill in the required variables:

#### 🔑 APP_ID

Find your **App ID** in the [Developer Portal](https://developer.worldcoin.org/) (`Configuration > Basic`).

#### Incognito Action

Define an _action_ in the developer portal under the Incognito Actions tab, copy it, and include it in the .env file

---

## ▶️ Running the Project

Run your Mini App locally:

```bash
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📱 Testing on Mobile

To test your Mini App directly on your phone, expose your app publicly using NGROK.

### 🚀 Using NGROK

Install [NGROK](https://ngrok.com/) and run:

```bash
ngrok http http://localhost:3000
```

NGROK provides a publicly accessible URL.

### 🌎 Configuring Your App (Developer Portal)

Go to the [Developer Portal](https://developer.worldcoin.org/) and configure:

- **App URL:** Set it to your NGROK-generated URL.

<img width="400" alt="image" src="https://github.com/user-attachments/assets/4d2c2c1b-cab4-40a7-ad6d-f91d1a77ecc5" />

---

### 📱 Opening your Mini App in World App

From the [Developer Portal](https://developer.worldcoin.org/), navigate to `Configuration > Basic` and scan the generated QR code.

---

## 📞 Contact

Questions or feedback? Feel free to reach out!

- **Telegram:** [@mateosauton](https://t.me/mateosauton)

---

## 🔗 Useful Links

- [World Documentation](https://docs.world.org/)
- [Developer Portal](https://developer.worldcoin.org/)

---

# 在WorldChain上验证智能合约

本文档提供了在WorldChain区块链上验证智能合约的详细步骤。

## 先决条件

1. 已部署的合约地址
2. 正确配置的.env文件，包含以下变量：
   - WORLD_CHAIN_EVENT_TICKETING_ADDRESS
   - WORLD_CHAIN_EVENT_TICKET_NFT_ADDRESS
   - WORLD_CHAIN_WORLD_ID_VERIFIER_ADDRESS (可选，取决于您的部署)
   - WORLD_CHAIN_CROSS_CHAIN_BRIDGE_ADDRESS (可选，取决于您的部署)
   - WORLD_CHAIN_PRIVATE_KEY
   - WORLDCHAIN_RPC_URL

## 步骤

### 1. 确保您的hardhat.config.js正确配置

您的`hardhat.config.js`文件应该包含WorldChain网络配置和Etherscan(WorldScan)配置：

```javascript
etherscan: {
  apiKey: {
    worldchain: "CC2ATB8DY5WIU8IDE926QWM112DS9DMEZA",
  },
  customChains: [
    {
      network: "worldchain",
      chainId: 480,
      urls: {
        apiURL: "https://api.worldscan.org/api", 
        browserURL: "https://worldscan.org/",
      },
    },
  ],
},
```

### 2. 运行验证脚本

使用以下命令运行验证脚本：

```bash
npx hardhat run scripts/verify-contract.js --network worldchain
```

脚本将按顺序验证以下合约：
1. EventTicketNFT
2. EventTicketing (需要提供正确的构造函数参数)

### 3. 手动验证（如果脚本失败）

如果脚本验证失败，您可以使用以下命令手动验证合约：

对于没有构造函数参数的合约：
```bash
npx hardhat verify --network worldchain <合约地址>
```

对于有构造函数参数的合约：
```bash
npx hardhat verify --network worldchain <合约地址> <参数1> <参数2> <参数3>
```

例如，对于EventTicketing合约：
```bash
npx hardhat verify --network worldchain 0x123... 0x456... 0x789... 0xabc...
```

### 4. 使用区块浏览器验证

如果上述方法都失败，您可以通过WorldChain的区块浏览器手动验证：

1. 访问 [WorldScan](https://worldscan.org/)
2. 搜索您的合约地址
3. 点击"合约"标签
4. 点击"验证并发布"按钮
5. 填写必要信息：
   - 合约名称
   - 编译器版本
   - 许可证类型
   - 优化设置
   - 构造函数参数（如有）
   - 上传完整的合约代码

## 常见问题解决

1. **构造函数参数错误**：确保您提供的构造函数参数与部署时使用的完全一致。

2. **API密钥问题**：检查您的WorldScan API密钥是否正确。

3. **合约代码不匹配**：确保您尝试验证的合约代码与部署的完全相同，包括任何导入的库。

4. **已经验证过**：如果合约已经验证过，您会看到"Already Verified"的消息。

## 验证后的好处

成功验证后，您将能够：
- 在区块浏览器上查看合约源代码
- 读取合约函数和事件
- 通过区块浏览器界面与合约交互
- 增加项目的透明度和可信度
