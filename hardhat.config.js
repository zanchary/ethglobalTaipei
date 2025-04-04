require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ethers");

const { vars } = require("hardhat/config");

module.exports = {
  solidity: "0.8.28",
  networks: {
    hardhat: {},
    worldchain: {
      url: "https://worldchain-mainnet.g.alchemy.com/public",
      accounts: process.env.WORLD_CHAIN_PRIVATE_KEY,
      chainId: 480, // This should be the correct chain ID for World Chain
    },
  },
  /*
  etherscan: {
    apiKey: "P26Q43SPZTU4HKNN6REEQZG1RJ9MFSYGEH", // Obtain from Worldscan
  },
  */
  etherscan: {
    apiKey: "CC2ATB8DY5WIU8IDE926QWM112DS9DMEZA",
    customChains: [
      {
        network: "worldchain",
        chainId: 480,
        urls: {
          apiURL: "https://api.worldscan.org/api", // Check if this is the correct explorer API
          browserURL: "https://worldscan.org/", // Block explorer for World Chain
        },
      },
    ],
  },
};