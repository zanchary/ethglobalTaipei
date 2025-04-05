require("@nomicfoundation/hardhat-toolbox");

const { vars } = require("hardhat/config");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "paris",
      optimizer: {
        enabled: true,
        runs: 1 // 最低的runs值，优化合约大小
      }
    }
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    worldchain: {
      url: process.env.WORLDCHAIN_RPC_URL || "https://worldchain-mainnet.g.alchemy.com/public",
      accounts: process.env.WORLD_CHAIN_PRIVATE_KEY ? [process.env.WORLD_CHAIN_PRIVATE_KEY] : [],
      chainId: 480, // This should be the correct chain ID for World Chain
      gasPrice: 350000000, // 0.35 gwei，降低gas价格
      gas: 15000000,     // 极大提高gas限制
      timeout: 600000, // 增加超时时间到10分钟
      blockGasLimit: 30000000,
      allowUnlimitedContractSize: true,
      throwOnTransactionFailures: true,
      throwOnCallFailures: true
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337, // 修改为Hardhat默认节点的链ID
    },
    alfajores: {
      url: process.env.CELO_RPC_URL || "https://alfajores-forno.celo-testnet.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 44787,
      gasPrice: 1000000000, // 1 gwei
      timeout: 60000 // 60 seconds
    }
  },
  /*
  etherscan: {
    apiKey: "P26Q43SPZTU4HKNN6REEQZG1RJ9MFSYGEH", // Obtain from Worldscan
  },
  */
  etherscan: {
    apiKey: {
      worldchain: "CC2ATB8DY5WIU8IDE926QWM112DS9DMEZA",
      alfajores: "CC2ATB8DY5WIU8IDE926QWM112DS9DMEZA",
    },
    customChains: [
      {
        network: "worldchain",
        chainId: 480,
        urls: {
          apiURL: "https://api.worldscan.org/api", // Check if this is the correct explorer API
          browserURL: "https://worldscan.org/", // Block explorer for World Chain
        },
      },
      {
        network: "alfajores",
        chainId: 44787,
        urls: {
          apiURL: "https://api-alfajores.celoscan.io/api",
          browserURL: "https://alfajores.celoscan.io"
        }
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 300000 // 增加测试超时时间到5分钟
  }
};