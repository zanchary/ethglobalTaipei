// 动态NFT元数据服务器
// 为动态NFT提供根据票据状态变化的元数据

const express = require('express');
const ethers = require('ethers');
const sharp = require('sharp');
const { createCanvas, loadImage } = require('canvas');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 创建Express应用
const app = express();
const port = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件目录
app.use('/static', express.static(path.join(__dirname, '../public')));

// 合约ABI
const DynamicTicketNFTABI = require('../artifacts/contracts/DynamicTicketNFT.sol/DynamicTicketNFT.json').abi;

// 创建输出目录
const outputDir = path.join(__dirname, '../generated');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const imagesDir = path.join(outputDir, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
}

// 票据状态信息
const stateInfo = {
  0: { name: "有效", color: "#4CAF50", overlay: "active.png" },
  1: { name: "已检入", color: "#2196F3", overlay: "checked_in.png" },
  2: { name: "已使用", color: "#9E9E9E", overlay: "used.png" },
  3: { name: "已过期", color: "#F44336", overlay: "expired.png" }
};

// 支持的链配置
const CHAINS = {
  1: {
    name: 'Ethereum',
    rpc: process.env.ETH_RPC_URL,
    nftAddress: process.env.ETH_DYNAMIC_NFT_ADDRESS
  },
  137: {
    name: 'Polygon',
    rpc: process.env.POLYGON_RPC_URL,
    nftAddress: process.env.POLYGON_DYNAMIC_NFT_ADDRESS
  },
  42220: {
    name: 'Celo',
    rpc: process.env.CELO_RPC_URL,
    nftAddress: process.env.CELO_DYNAMIC_NFT_ADDRESS
  }
};

// 提供者和合约实例
const providers = {};
const nftContracts = {};

// 初始化区块链连接
function initializeConnections() {
  for (const chainId in CHAINS) {
    const chain = CHAINS[chainId];
    
    // 创建提供者
    providers[chainId] = new ethers.providers.JsonRpcProvider(chain.rpc);
    
    // 创建合约实例
    if (chain.nftAddress) {
      nftContracts[chainId] = new ethers.Contract(
        chain.nftAddress,
        DynamicTicketNFTABI,
        providers[chainId]
      );
    }
  }
  
  console.log('区块链连接已初始化');
}

// 生成动态门票图像
async function generateTicketImage(tokenId, chainId, ticketInfo, state) {
  // 创建画布
  const canvas = createCanvas(1000, 600);
  const ctx = canvas.getContext('2d');
  
  try {
    // 绘制背景
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, 1000, 600);
    
    // 加载基础票面
    const assetsDir = path.join(__dirname, '../public/assets');
    const baseTicket = await loadImage(path.join(assetsDir, 'ticket_base.png'));
    ctx.drawImage(baseTicket, 0, 0, 1000, 600);
    
    // 根据状态添加覆盖图
    const overlay = await loadImage(path.join(assetsDir, 'overlays', stateInfo[state].overlay));
    ctx.drawImage(overlay, 0, 0, 1000, 600);
    
    // 添加状态水印
    ctx.globalAlpha = 0.5;
    ctx.font = '60px Arial';
    ctx.fillStyle = stateInfo[state].color;
    ctx.translate(500, 300);
    ctx.rotate(-Math.PI / 4);
    ctx.fillText(stateInfo[state].name, -100, 0);
    ctx.rotate(Math.PI / 4);
    ctx.translate(-500, -300);
    ctx.globalAlpha = 1.0;
    
    // 写入票据信息
    ctx.font = '36px Arial';
    ctx.fillStyle = "#000000";
    ctx.fillText(`票号: #${tokenId}`, 50, 100);
    ctx.fillText(`链: ${CHAINS[chainId].name}`, 50, 150);
    ctx.fillText(`活动ID: ${ticketInfo.eventId}`, 50, 200);
    ctx.fillText(`座位: ${ticketInfo.seatNumber}`, 50, 250);
    
    // 时间戳转换为日期显示
    const purchaseDate = new Date(ticketInfo.purchaseTime * 1000).toLocaleDateString('zh-CN');
    const lastUpdateDate = new Date(ticketInfo.lastUpdated * 1000).toLocaleString('zh-CN');
    
    ctx.fillText(`购买时间: ${purchaseDate}`, 50, 300);
    ctx.fillText(`最后更新: ${lastUpdateDate}`, 50, 350);
    
    // 添加链标志
    const chainLogo = await loadImage(path.join(assetsDir, 'chains', `${chainId}.png`));
    ctx.drawImage(chainLogo, 800, 50, 150, 150);
    
    // 如果有自定义属性，添加一些额外信息
    if (ticketInfo.customAttributes) {
      try {
        const attributes = JSON.parse(ticketInfo.customAttributes);
        
        let yPos = 400;
        for (const key in attributes) {
          if (typeof attributes[key] === 'string' || typeof attributes[key] === 'number') {
            ctx.font = '20px Arial';
            ctx.fillText(`${key}: ${attributes[key]}`, 50, yPos);
            yPos += 30;
          }
        }
      } catch (error) {
        // 忽略自定义属性解析错误
      }
    }
    
    // 根据状态添加额外元素
    if (state === 1) { // CHECKED_IN
      ctx.fillStyle = "#2196F3";
      ctx.font = 'bold 40px Arial';
      ctx.fillText('已检入 ✓', 700, 350);
    } else if (state === 2) { // USED
      ctx.fillStyle = "#9E9E9E";
      ctx.font = 'bold 40px Arial';
      ctx.fillText('已使用 ✓', 700, 350);
      
      // 添加盖章效果
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#FF0000";
      ctx.beginPath();
      ctx.arc(500, 300, 150, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = "#FFFFFF";
      ctx.font = 'bold 60px Arial';
      ctx.fillText('已使用', 400, 320);
      ctx.globalAlpha = 1.0;
    } else if (state === 3) { // EXPIRED
      ctx.fillStyle = "#F44336";
      ctx.font = 'bold 40px Arial';
      ctx.fillText('已过期 ✗', 700, 350);
      
      // 添加交叉线
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#F44336";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(100, 100);
      ctx.lineTo(900, 500);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(900, 100);
      ctx.lineTo(100, 500);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
    
    // 保存图像
    const buffer = canvas.toBuffer('image/png');
    const imagePath = path.join(imagesDir, `ticket_${chainId}_${tokenId}_${state}.png`);
    fs.writeFileSync(imagePath, buffer);
    
    return {
      buffer,
      path: imagePath,
      url: `/api/image/${chainId}/${tokenId}?state=${state}`
    };
  } catch (error) {
    console.error('生成票据图像时出错:', error);
    throw error;
  }
}

// API端点：获取元数据
app.get('/api/metadata/:chainId/:tokenId', async (req, res) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const tokenId = req.params.tokenId;
    const state = parseInt(req.query.state || '0');
    const timestamp = parseInt(req.query.timestamp || '0');
    
    // 验证链ID是否支持
    if (!CHAINS[chainId] || !nftContracts[chainId]) {
      return res.status(400).json({ error: `不支持的链ID: ${chainId}` });
    }
    
    console.log(`获取元数据: Chain ${chainId}, Token ${tokenId}, State ${state}`);
    
    try {
      // 从链上获取票据信息
      const contract = nftContracts[chainId];
      const ticketInfo = await contract.getTicketInfo(tokenId);
      
      // 生成图像
      const imageResult = await generateTicketImage(tokenId, chainId, ticketInfo, state);
      
      // 准备元数据
      const metadata = {
        name: `动态票据 #${tokenId} (${stateInfo[state].name})`,
        description: `这是一张动态NFT票据，状态会随着时间和活动进程而变化。当前状态: ${stateInfo[state].name}`,
        image: `${req.protocol}://${req.get('host')}${imageResult.url}`,
        external_url: `${req.protocol}://${req.get('host')}/ticket/${chainId}/${tokenId}`,
        attributes: [
          { trait_type: "状态", value: stateInfo[state].name },
          { trait_type: "链", value: CHAINS[chainId].name },
          { trait_type: "活动ID", value: ticketInfo.eventId.toString() },
          { trait_type: "座位号", value: ticketInfo.seatNumber.toString() },
          { trait_type: "购买时间", value: new Date(ticketInfo.purchaseTime * 1000).toISOString() },
          { trait_type: "最后更新", value: new Date(ticketInfo.lastUpdated * 1000).toISOString() }
        ]
      };
      
      // 添加动画URL (如果状态是已检入)
      if (state === 1) {
        metadata.animation_url = `${req.protocol}://${req.get('host')}/api/animation/${chainId}/${tokenId}`;
      }
      
      // 如果有自定义属性，添加到元数据
      if (ticketInfo.customAttributes) {
        try {
          const customAttributes = JSON.parse(ticketInfo.customAttributes);
          
          for (const key in customAttributes) {
            if (typeof customAttributes[key] === 'string' || typeof customAttributes[key] === 'number') {
              metadata.attributes.push({
                trait_type: key,
                value: customAttributes[key]
              });
            }
          }
        } catch (error) {
          console.error('解析自定义属性时出错:', error);
        }
      }
      
      res.json(metadata);
    } catch (error) {
      console.error('获取票据信息时出错:', error);
      return res.status(404).json({ error: '票据不存在或获取信息失败' });
    }
  } catch (error) {
    console.error('处理元数据请求时出错:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// API端点：获取图像
app.get('/api/image/:chainId/:tokenId', async (req, res) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const tokenId = req.params.tokenId;
    const state = parseInt(req.query.state || '0');
    
    // 验证链ID是否支持
    if (!CHAINS[chainId] || !nftContracts[chainId]) {
      return res.status(400).json({ error: `不支持的链ID: ${chainId}` });
    }
    
    // 检查图像是否已经生成
    const imagePath = path.join(imagesDir, `ticket_${chainId}_${tokenId}_${state}.png`);
    
    if (fs.existsSync(imagePath)) {
      // 如果图像已存在，直接返回
      res.setHeader('Content-Type', 'image/png');
      return res.sendFile(imagePath);
    }
    
    // 从链上获取票据信息
    const contract = nftContracts[chainId];
    const ticketInfo = await contract.getTicketInfo(tokenId);
    
    // 生成图像
    const imageResult = await generateTicketImage(tokenId, chainId, ticketInfo, state);
    
    // 返回图像
    res.setHeader('Content-Type', 'image/png');
    res.send(imageResult.buffer);
  } catch (error) {
    console.error('处理图像请求时出错:', error);
    res.status(500).send('服务器内部错误');
  }
});

// API端点：动画（仅适用于已检入状态）
app.get('/api/animation/:chainId/:tokenId', async (req, res) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const tokenId = req.params.tokenId;
    
    // 返回HTML动画
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>门票动画 - ${tokenId}</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              background-color: #000;
            }
            .container {
              position: relative;
              width: 1000px;
              height: 600px;
            }
            .ticket {
              position: absolute;
              width: 100%;
              height: 100%;
              background-image: url('/api/image/${chainId}/${tokenId}?state=1');
              background-size: cover;
              animation: pulse 3s infinite;
            }
            @keyframes pulse {
              0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7); }
              50% { transform: scale(1.03); box-shadow: 0 0 20px 10px rgba(33, 150, 243, 0.7); }
              100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.7); }
            }
            .checkin-mark {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              font-size: 80px;
              color: #2196F3;
              text-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
              opacity: 0;
              animation: markAppear 5s infinite;
            }
            @keyframes markAppear {
              0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
              20% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
              40% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
              80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
              100% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="ticket"></div>
            <div class="checkin-mark">✓ 已检入</div>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('处理动画请求时出错:', error);
    res.status(500).send('服务器内部错误');
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`动态NFT元数据服务器运行在端口 ${port}`);
  
  // 初始化区块链连接
  initializeConnections();
}); 