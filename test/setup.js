const { expect } = require("chai");
const { ethers } = require("hardhat");

// Helper function to advance the blockchain time
async function advanceTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine");
}

// Helper function to get the current timestamp
async function getCurrentTimestamp() {
  const blockNum = await ethers.provider.getBlockNumber();
  const block = await ethers.provider.getBlock(blockNum);
  return block.timestamp;
}

// Setup function to deploy all contracts and set them up
async function deployTicketingSystem() {
  // Get signers
  const [owner, platformFeeReceiver, organizer1, organizer2, buyer1, buyer2, buyer3] = await ethers.getSigners();
  
  // Deploy World ID Verifier
  const WorldIDVerifier = await ethers.getContractFactory("WorldIDVerifier");
  const worldIDVerifier = await WorldIDVerifier.deploy();
  await worldIDVerifier.deployed();
  
  // Deploy Ticketing App
  const EventTicketingApp = await ethers.getContractFactory("EventTicketingApp");
  const ticketingApp = await EventTicketingApp.deploy(worldIDVerifier.address, platformFeeReceiver.address);
  await ticketingApp.deployed();
  
  // Deploy NFT contract
  const EventTicketNFT = await ethers.getContractFactory("EventTicketNFT");
  const ticketNFT = await EventTicketNFT.deploy("Event Ticket NFT", "TICKET");
  await ticketNFT.deployed();
  
  // Deploy Payment Processor
  const EventTicketPayment = await ethers.getContractFactory("EventTicketPayment");
  const paymentProcessor = await EventTicketPayment.deploy();
  await paymentProcessor.deployed();
  
  // Deploy Cross-Chain Bridge
  const CrossChainPaymentBridge = await ethers.getContractFactory("CrossChainPaymentBridge");
  const crossChainBridge = await CrossChainPaymentBridge.deploy();
  await crossChainBridge.deployed();
  
  // Set up contract connections
  await ticketNFT.setTicketingApp(ticketingApp.address);
  await paymentProcessor.setTicketingApp(ticketingApp.address);
  await ticketingApp.setContracts(ticketNFT.address, paymentProcessor.address);
  await crossChainBridge.setTicketingApp(ticketingApp.address);
  await crossChainBridge.setPaymentProcessor(paymentProcessor.address);
  
  // Mock World ID verification for organizers
  // For this test we'll simulate successful verification by directly marking them as verified
  // Add a root to WorldIDVerifier
  const groupId = 1;
  const root = ethers.utils.hexZeroPad("0x123", 32);
  await worldIDVerifier.addRoot(root, groupId);
  
  // Sample zero-knowledge proof parameters (mocked)
  const nullifierHash = ethers.utils.hexZeroPad("0x456", 32);
  const proof = Array(8).fill(ethers.utils.hexZeroPad("0x789", 32));
  
  // Verify organizers directly to simplify testing
  const orgSignalHash = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["address"], [organizer1.address]));
  await worldIDVerifier.connect(owner).consumeNullifierHash(nullifierHash);
  await ticketingApp.connect(organizer1).verifyOrganizer(root, nullifierHash, proof);
  
  // Return all deployed contracts and signers
  return {
    worldIDVerifier,
    ticketingApp,
    ticketNFT,
    paymentProcessor,
    crossChainBridge,
    owner,
    platformFeeReceiver,
    organizer1,
    organizer2,
    buyer1,
    buyer2,
    buyer3
  };
}

// Create a sample event with tickets
async function createSampleEvent(ticketingApp, organizer) {
  const currentTime = await getCurrentTimestamp();
  
  // Event details
  const eventName = "Sample Concert";
  const description = "A sample concert for testing";
  const location = "Test Venue";
  const eventDate = currentTime + 86400; // 1 day in the future
  const allowResale = true;
  const resaleDeadline = currentTime + 75600; // 21 hours in the future
  const resaleFeePercent = 500; // 5%
  const dynamicNFTEnabled = true;
  
  // Create event
  const tx = await ticketingApp.connect(organizer).createEvent(
    eventName,
    description,
    location,
    eventDate,
    allowResale,
    resaleDeadline,
    resaleFeePercent,
    dynamicNFTEnabled
  );
  
  const receipt = await tx.wait();
  // Find the EventCreated event to get the event ID
  const eventCreatedEvent = receipt.events.find(e => e.event === "EventCreated");
  const eventId = eventCreatedEvent.args.eventId;
  
  // Add ticket types
  await ticketingApp.connect(organizer).addTicketType(
    eventId,
    "General Admission",
    ethers.utils.parseEther("0.1"),
    100
  );
  
  await ticketingApp.connect(organizer).addTicketType(
    eventId,
    "VIP",
    ethers.utils.parseEther("0.3"),
    20
  );
  
  return eventId;
}

module.exports = {
  advanceTime,
  getCurrentTimestamp,
  deployTicketingSystem,
  createSampleEvent
};