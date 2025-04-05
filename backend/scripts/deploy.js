// deploy.js
const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy a mock WorldID for testing purposes
  const MockWorldID = await ethers.getContractFactory("MockWorldID");
  const mockWorldID = await MockWorldID.deploy();
  await mockWorldID.deployed();
  console.log("MockWorldID deployed to:", mockWorldID.address);

  // Deploy WorldIDOrganizerVerifier
  const groupId = 1; // For testing purposes
  const actionId = 1; // For testing purposes
  const WorldIDOrganizerVerifier = await ethers.getContractFactory("WorldIDOrganizerVerifier");
  const worldIDVerifier = await WorldIDOrganizerVerifier.deploy(
    mockWorldID.address,
    groupId,
    actionId
  );
  await worldIDVerifier.deployed();
  console.log("WorldIDOrganizerVerifier deployed to:", worldIDVerifier.address);

  // Deploy EventTicket
  const EventTicket = await ethers.getContractFactory("EventTicket");
  const eventTicket = await EventTicket.deploy();
  await eventTicket.deployed();
  console.log("EventTicket deployed to:", eventTicket.address);

  // Deploy LoyaltyRewards
  const LoyaltyRewards = await ethers.getContractFactory("LoyaltyRewards");
  const loyaltyRewards = await LoyaltyRewards.deploy();
  await loyaltyRewards.deployed();
  console.log("LoyaltyRewards deployed to:", loyaltyRewards.address);

  // Link LoyaltyRewards to EventTicket
  await loyaltyRewards.setEventTicketContract(eventTicket.address);
  console.log("LoyaltyRewards linked to EventTicket");

  // Deploy TicketResaleMarketplace
  const TicketResaleMarketplace = await ethers.getContractFactory("TicketResaleMarketplace");
  const resaleMarketplace = await TicketResaleMarketplace.deploy(eventTicket.address);
  await resaleMarketplace.deployed();
  console.log("TicketResaleMarketplace deployed to:", resaleMarketplace.address);

  // For testing purposes, verify an organizer
  const testOrganizerAddress = deployer.address;
  await worldIDVerifier.manualVerify(testOrganizerAddress);
  await eventTicket.verifyOrganizer(testOrganizerAddress);
  console.log("Test organizer verified:", testOrganizerAddress);

  // Create test reward tiers
  await loyaltyRewards.createRewardTier("Bronze", 5, "https://example.com/rewards/bronze/");
  await loyaltyRewards.createRewardTier("Silver", 10, "https://example.com/rewards/silver/");
  await loyaltyRewards.createRewardTier("Gold", 20, "https://example.com/rewards/gold/");
  console.log("Test reward tiers created");

  // Create a test event
  const now = Math.floor(Date.now() / 1000);
  const oneDay = 86400;
  const oneHour = 3600;
  
  const eventName = "Test Concert";
  const eventDescription = "A test concert event for local development";
  const startTime = now + oneDay; // 1 day from now
  const endTime = startTime + 3 * oneHour; // 3 hours duration
  const price = ethers.utils.parseEther("0.01"); // 0.01 ETH
  const maxTickets = 100;
  const allowTransfers = true;
  const transferDeadline = startTime - oneHour; // 1 hour before start
  const baseUri = "https://example.com/events/test/";
  
  await eventTicket.createEvent(
    eventName,
    eventDescription,
    startTime,
    endTime,
    price,
    maxTickets,
    allowTransfers,
    transferDeadline,
    baseUri
  );
  console.log("Test event created");

  console.log("Deployment completed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });