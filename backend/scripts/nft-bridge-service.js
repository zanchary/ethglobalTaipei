// 跨链NFT桥接服务
// 此服务监听不同链上的NFT锁定和桥接请求事件，处理跨链迁移

const ethers = require('ethers');
const axios = require('axios');
require('dotenv').config();

// 合约ABI
const NFTBridgeABI = require('../artifacts/contracts/NFTBridgeGateway.sol/NFTBridgeGateway.json').abi;
const EventTicketNFTABI = require('../../artifacts/contracts/EventTicketNFT.sol/EventTicketNFT.json').abi;
const DynamicTicketNFTABI = require('../artifacts/contracts/DynamicTicketNFT.sol/DynamicTicketNFT.json').abi;
const CrossChainTicketNFTABI = require('../artifacts/contracts/CrossChainTicketNFT.sol/CrossChainTicketNFT.json').abi;

// 支持的链配置
const CHAINS = {
  // 以太坊
  1: {
    name: 'Ethereum',
    rpc: process.env.ETH_RPC_URL,
    bridgeAddress: process.env.ETH_BRIDGE_ADDRESS,
    ticketNFTAddress: process.env.ETH_TICKET_NFT_ADDRESS,
    crossChainNFTAddress: process.env.ETH_CROSS_CHAIN_NFT_ADDRESS,
    chainId: 1
  },
  // Polygon
  137: {
    name: 'Polygon',
    rpc: process.env.POLYGON_RPC_URL,
    bridgeAddress: process.env.POLYGON_BRIDGE_ADDRESS,
    ticketNFTAddress: process.env.POLYGON_TICKET_NFT_ADDRESS, 
    crossChainNFTAddress: process.env.POLYGON_CROSS_CHAIN_NFT_ADDRESS,
    chainId: 137
  },
  // Celo
  42220: {
    name: 'Celo',
    rpc: process.env.CELO_RPC_URL,
    bridgeAddress: process.env.CELO_BRIDGE_ADDRESS,
    ticketNFTAddress: process.env.CELO_TICKET_NFT_ADDRESS,
    crossChainNFTAddress: process.env.CELO_CROSS_CHAIN_NFT_ADDRESS,
    chainId: 42220
  }
};

// 链接提供者
const providers = {};
// 验证者钱包
const validators = {};
// 桥合约实例
const bridgeContracts = {};
// NFT合约实例
const nftContracts = {};
// 跨链NFT合约实例 
const crossChainNFTContracts = {};

// 初始化连接
async function initializeConnections() {
  // 验证者私钥（应该安全保存，此处仅为示例）
  const validatorPrivateKey = process.env.VALIDATOR_PRIVATE_KEY;
  
  if (!validatorPrivateKey) {
    throw new Error('验证者私钥未设置');
  }
  
  for (const chainId in CHAINS) {
    const chain = CHAINS[chainId];
    
    console.log(`初始化连接到 ${chain.name} (${chainId})...`);
    
    // 创建提供者
    providers[chainId] = new ethers.providers.JsonRpcProvider(chain.rpc);
    
    // 创建钱包
    validators[chainId] = new ethers.Wallet(validatorPrivateKey, providers[chainId]);
    
    // 创建桥合约实例
    bridgeContracts[chainId] = new ethers.Contract(
      chain.bridgeAddress,
      NFTBridgeABI,
      validators[chainId]
    );
    
    // 创建票据NFT合约实例
    nftContracts[chainId] = new ethers.Contract(
      chain.ticketNFTAddress,
      EventTicketNFTABI, // 或DynamicTicketNFTABI，取决于部署的是哪种类型
      validators[chainId]
    );
    
    // 创建跨链NFT合约实例
    crossChainNFTContracts[chainId] = new ethers.Contract(
      chain.crossChainNFTAddress,
      CrossChainTicketNFTABI,
      validators[chainId]
    );
    
    console.log(`已连接到 ${chain.name}`);
  }
  
  console.log('所有连接已初始化');
}

// 从IPFS获取元数据
async function getMetadataFromIPFS(tokenURI) {
  try {
    // 将ipfs://转换为HTTP URL
    const url = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/');
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('获取IPFS元数据失败:', error);
    return null;
  }
}

// 获取票据信息
async function getTicketInfo(chainId, tokenId, isOriginalChain) {
  try {
    const contract = isOriginalChain ? nftContracts[chainId] : crossChainNFTContracts[chainId];
    return await contract.getTicketInfo(tokenId);
  } catch (error) {
    console.error(`获取票据信息失败 (Chain ${chainId}, Token ${tokenId}):`, error);
    return null;
  }
}

// 监听跨链请求
async function listenForBridgeRequests() {
  for (const sourceChainId in bridgeContracts) {
    const sourceContract = bridgeContracts[sourceChainId];
    const sourceChainName = CHAINS[sourceChainId].name;
    
    console.log(`监听 ${sourceChainName} 上的桥接请求...`);
    
    // 监听TokenLocked事件
    sourceContract.on('TokenLocked', async (nftContract, tokenId, owner, targetChainId, bridgeRequestId, event) => {
      console.log(`\n检测到从 ${sourceChainName} 到 Chain ${targetChainId} 的桥接请求`);
      console.log(`NFT合约: ${nftContract}, 令牌ID: ${tokenId}, 所有者: ${owner}`);
      
      try {
        // 确保目标链受支持
        if (!CHAINS[targetChainId]) {
          console.error(`不支持的目标链 ${targetChainId}`);
          return;
        }
        
        // 处理跨链请求
        await processBridgeRequest(
          parseInt(sourceChainId),
          nftContract,
          tokenId,
          owner,
          parseInt(targetChainId),
          bridgeRequestId
        );
      } catch (error) {
        console.error('处理桥接请求时出错:', error);
      }
    });
    
    // 监听TokenBridged事件 (处理回迁移）
    crossChainNFTContracts[sourceChainId].on('BridgeBackRequested', async (tokenId, originalChainId, event) => {
      console.log(`\n检测到从 ${sourceChainName} 回迁移到 Chain ${originalChainId} 的请求`);
      
      try {
        // 确保原始链受支持
        if (!CHAINS[originalChainId]) {
          console.error(`不支持的原始链 ${originalChainId}`);
          return;
        }
        
        // 获取跨链票据信息
        const ticketInfo = await crossChainNFTContracts[sourceChainId].getTicketInfo(tokenId);
        
        // 处理回迁移
        await processBridgeBack(
          parseInt(sourceChainId),
          tokenId,
          parseInt(originalChainId),
          ticketInfo
        );
      } catch (error) {
        console.error('处理回迁移请求时出错:', error);
      }
    });
  }
}

// 处理桥接请求
async function processBridgeRequest(sourceChainId, nftContract, tokenId, owner, targetChainId, bridgeRequestId) {
  console.log(`处理桥接请求: ${bridgeRequestId}`);
  
  try {
    // 1. 从源链获取NFT信息
    let isOriginalNFT = false;
    let ticketInfo;
    let originChainId = sourceChainId;
    let originContract = nftContract;
    let originTokenId = tokenId;
    
    // 检查是原始NFT还是已经桥接过的NFT
    const isBridged = await bridgeContracts[sourceChainId].isBridgedNFT(nftContract, tokenId);
    
    if (isBridged) {
      // 如果是已桥接的NFT，获取原始链信息
      const bridgeInfo = await bridgeContracts[sourceChainId].getBridgedNFTInfo(nftContract, tokenId);
      originChainId = parseInt(bridgeInfo.originChainId);
      originContract = bridgeInfo.originNftContract;
      originTokenId = parseInt(bridgeInfo.originTokenId);
      ticketInfo = await crossChainNFTContracts[sourceChainId].getTicketInfo(tokenId);
    } else {
      isOriginalNFT = true;
      ticketInfo = await nftContracts[sourceChainId].getTicketInfo(tokenId);
    }
    
    // 2. 获取NFT元数据
    let tokenURI;
    if (isOriginalNFT) {
      tokenURI = await nftContracts[sourceChainId].tokenURI(tokenId);
    } else {
      tokenURI = await crossChainNFTContracts[sourceChainId].tokenURI(tokenId);
    }
    
    const metadata = await getMetadataFromIPFS(tokenURI);
    
    // 3. 创建签名
    const message = ethers.utils.solidityKeccak256(
      ['bytes32', 'uint256', 'address', 'uint256', 'address', 'address', 'uint256'],
      [
        bridgeRequestId,
        originChainId,
        originContract,
        originTokenId,
        owner,
        CHAINS[targetChainId].crossChainNFTAddress,
        targetChainId
      ]
    );
    
    // 签名消息
    const signature = await validators[targetChainId].signMessage(
      ethers.utils.arrayify(message)
    );
    
    // 4. 在目标链上完成桥接
    const tx = await bridgeContracts[targetChainId].completeBridge(
      originChainId,
      originContract,
      originTokenId,
      owner,
      tokenURI,
      CHAINS[targetChainId].crossChainNFTAddress,
      bridgeRequestId,
      signature
    );
    
    console.log(`目标链交易哈希: ${tx.hash}`);
    const receipt = await tx.wait();
    
    // 5. 从交易收据中提取localTokenId
    const bridgedEvent = receipt.events.find(e => e.event === 'TokenBridged');
    const localTokenId = bridgedEvent.args.localTokenId;
    
    // 6. 在跨链NFT合约中铸造票据
    const crossChainNFT = crossChainNFTContracts[targetChainId];
    
    // 准备自定义属性
    const customAttributes = JSON.stringify({
      originChain: CHAINS[originChainId].name,
      bridgeTimestamp: Math.floor(Date.now() / 1000),
      originalMetadata: metadata
    });
    
    // 铸造跨链票据
    const mintTx = await crossChainNFT.mintCrossChainTicket(
      owner,
      originChainId,
      originContract,
      originTokenId,
      ticketInfo.eventId,
      ticketInfo.seatNumber || 0,
      ticketInfo.originalPurchaser || owner,
      customAttributes,
      tokenURI
    );
    
    console.log(`目标链铸造交易哈希: ${mintTx.hash}`);
    await mintTx.wait();
    
    console.log(`成功将NFT从 ${CHAINS[sourceChainId].name} 桥接到 ${CHAINS[targetChainId].name}`);
  } catch (error) {
    console.error('桥接过程中出错:', error);
  }
}

// 处理回迁移
async function processBridgeBack(sourceChainId, tokenId, targetChainId, ticketInfo) {
  console.log(`处理从 ${CHAINS[sourceChainId].name} 到 ${CHAINS[targetChainId].name} 的回迁移`);
  
  try {
    // 1. 获取桥接信息
    const originChainId = parseInt(ticketInfo.originChainId);
    const originContract = ticketInfo.originContract;
    const originTokenId = parseInt(ticketInfo.originTokenId);
    const owner = await crossChainNFTContracts[sourceChainId].ownerOf(tokenId);
    
    // 2. 创建桥接请求ID
    const bridgeRequestId = ethers.utils.solidityKeccak256(
      ['uint256', 'address', 'uint256', 'address', 'uint256', 'uint256'],
      [sourceChainId, crossChainNFTContracts[sourceChainId].address, tokenId, owner, targetChainId, Date.now()]
    );
    
    // 3. 创建签名
    const message = ethers.utils.solidityKeccak256(
      ['bytes32', 'address', 'uint256', 'address', 'uint256', 'uint256'],
      [
        bridgeRequestId,
        originContract,
        originTokenId,
        owner,
        sourceChainId,
        targetChainId
      ]
    );
    
    // 签名消息
    const signature = await validators[targetChainId].signMessage(
      ethers.utils.arrayify(message)
    );
    
    // 4. 解锁目标链上的原始NFT
    const tx = await bridgeContracts[targetChainId].unlockToken(
      originContract,
      originTokenId,
      owner,
      sourceChainId,
      bridgeRequestId,
      signature
    );
    
    console.log(`目标链解锁交易哈希: ${tx.hash}`);
    await tx.wait();
    
    console.log(`成功将NFT从 ${CHAINS[sourceChainId].name} 回迁移到 ${CHAINS[targetChainId].name}`);
  } catch (error) {
    console.error('回迁移过程中出错:', error);
  }
}

// 启动服务
async function startBridgeService() {
  try {
    console.log('启动NFT跨链桥服务...');
    
    // 初始化连接
    await initializeConnections();
    
    // 监听桥接请求
    await listenForBridgeRequests();
    
    console.log('NFT跨链桥服务已启动并监听事件');
  } catch (error) {
    console.error('启动服务时出错:', error);
  }
}

// 运行服务
startBridgeService().catch(console.error); 