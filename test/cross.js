const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
  deployTicketingSystem, 
  createSampleEvent, 
  advanceTime, 
  getCurrentTimestamp 
} = require("./test-helpers");

describe("Payment Processing", function() {
  let system;
  let eventId;
  
  beforeEach(async function() {
    // Deploy the system
    system = await deployTicketingSystem();
    
    // Create a sample event
    eventId = await createSampleEvent(system.ticketingApp, system.organizer1);
  });
  
  describe("EventTicketPayment", function() {
    it("should process ticket purchases with correct fee distribution", async function() {
      // Track balances before purchase
      const initialPlatformBalance = await ethers.provider.getBalance(system.platformFeeReceiver.address);
      const initialOrganizerBalance = await ethers.provider.getBalance(system.organizer1.address);
      
      // Purchase a VIP ticket
      const ticketTypeId = 2; // VIP ticket
      const price = ethers.utils.parseEther("0.3");
      
      await system.ticketingApp.connect(system.buyer1).purchaseTicket(eventId, ticketTypeId, { value: price });
      
      // Check new balances
      const newPlatformBalance = await ethers.provider.getBalance(system.platformFeeReceiver.address);
      const newOrganizerBalance = await ethers.provider.getBalance(system.organizer1.address);
      
      // Platform fee should be 1% of 0.3 ETH = 0.003 ETH
      const expectedPlatformFee = price.mul(100).div(10000); // 1% as basis points
      expect(newPlatformBalance.sub(initialPlatformBalance)).to.equal(expectedPlatformFee);
      
      // Organizer should get the rest: 0.3 - 0.003 = 0.297 ETH
      const expectedOrganizerAmount = price.sub(expectedPlatformFee);
      expect(newOrganizerBalance.sub(initialOrganizerBalance)).to.equal(expectedOrganizerAmount);
    });
    
    it("should track payment history", async function() {
      // Make a purchase
      const ticketTypeId = 1;
      const price = ethers.utils.parseEther("0.1");
      
      await system.ticketingApp.connect(system.buyer1).purchaseTicket(eventId, ticketTypeId, { value: price });
      
      // Get the buyer's payments
      const userPayments = await system.paymentProcessor.getUserPayments(system.buyer1.address);
      expect(userPayments.length).to.equal(1);
      
      // Get the payment details
      const paymentId = userPayments[0];
      const [paymentEventId, buyer, amount, completed, timestamp, paymentType] = 
        await system.paymentProcessor.getPaymentInfo(paymentId);
      
      expect(paymentEventId).to.equal(eventId);
      expect(buyer).to.equal(system.buyer1.address);
      expect(amount).to.equal(price);
      expect(completed).to.be.true;
      expect(paymentType).to.equal(0); // PaymentType.TicketPurchase
    });
    
    it("should correctly process resale payments", async function() {
      // First purchase a ticket
      const ticketTypeId = 1;
      const price = ethers.utils.parseEther("0.1");
      
      const tx = await system.ticketingApp.connect(system.buyer1).purchaseTicket(eventId, ticketTypeId, { value: price });
      const receipt = await tx.wait();
      
      const ticketPurchasedEvent = receipt.events.find(e => e.event === "TicketPurchased");
      const tokenId = ticketPurchasedEvent.args.tokenId;
      
      // List the ticket for resale
      const resalePrice = ethers.utils.parseEther("0.15");
      await system.ticketingApp.connect(system.buyer1).listTicketForResale(tokenId, resalePrice);
      
      // Track balances before resale
      const initialPlatformBalance = await ethers.provider.getBalance(system.platformFeeReceiver.address);
      const initialOrganizerBalance = await ethers.provider.getBalance(system.organizer1.address);
      const initialSellerBalance = await ethers.provider.getBalance(system.buyer1.address);
      
      // Buy the resale ticket
      await system.ticketingApp.connect(system.buyer2).buyResaleTicket(tokenId, { value: resalePrice });
      
      // Check new balances
      const newPlatformBalance = await ethers.provider.getBalance(system.platformFeeReceiver.address);
      const newOrganizerBalance = await ethers.provider.getBalance(system.organizer1.address);
      
      // Platform fee should be 1% of 0.15 ETH = 0.0015 ETH
      const expectedPlatformFee = resalePrice.mul(100).div(10000); // 1% as basis points
      
      // Resale fee should be 5% of 0.15 ETH = 0.0075 ETH (from the event configuration)
      const expectedResaleFee = resalePrice.mul(500).div(10000); // 5% as basis points
      
      // Seller should get the rest: 0.15 - 0.0015 - 0.0075 = 0.141 ETH
      const expectedSellerAmount = resalePrice.sub(expectedPlatformFee).sub(expectedResaleFee);
      
      // Check platform fee
      expect(newPlatformBalance.sub(initialPlatformBalance)).to.equal(expectedPlatformFee);
      
      // Check organizer fee (resale fee)
      expect(newOrganizerBalance.sub(initialOrganizerBalance)).to.equal(expectedResaleFee);
      
      // We can't easily check the seller's balance due to gas costs, but we can verify
      // ownership of the NFT transferred correctly
      const newOwner = await system.ticketNFT.ownerOf(tokenId);
      expect(newOwner).to.equal(system.buyer2.address);
    });
    
    it("should reject direct payment calls from unauthorized accounts", async function() {
      await expect(
        system.paymentProcessor.connect(system.buyer1).processTicketPurchase(
          eventId,
          1,
          system.buyer1.address,
          ethers.utils.parseEther("0.1"),
          { value: ethers.utils.parseEther("0.1") }
        )
      ).to.be.revertedWith("Only ticketing app can call this function");
    });
  });
  
  describe("CrossChainPaymentBridge", function() {
    it("should allow adding supported tokens", async function() {
      // Create a mock token and price feed
      const mockToken = "0x1234567890123456789012345678901234567890";
      const mockPriceFeed = "0x0987654321098765432109876543210987654321";
      
      await system.crossChainBridge.connect(system.owner).addSupportedToken(
        "MOCK",
        mockToken,
        mockPriceFeed
      );
      
      // Check if the token was added
      const tokenAddress = await system.crossChainBridge.supportedTokens("MOCK");
      expect(tokenAddress).to.equal(mockToken);
      
      const priceFeedAddress = await system.crossChainBridge.tokenPriceFeeds(mockToken);
      expect(priceFeedAddress).to.equal(mockPriceFeed);
    });
    
    it("should allow setting chain receivers", async function() {
      const chainId = 1; // Ethereum mainnet
      const receiverAddress = "0x1234567890123456789012345678901234567890";
      
      await system.crossChainBridge.connect(system.owner).setChainReceiver(
        chainId,
        receiverAddress
      );
      
      const savedReceiver = await system.crossChainBridge.chainReceivers(chainId);
      expect(savedReceiver).to.equal(receiverAddress);
    });
    
    // Note: Full testing of cross-chain payments requires more complex setup
    // involving mock tokens, chainlink oracles, etc.
    // The following tests the administrative functions only
    
    it("should reject unauthorized config changes", async function() {
      const mockToken = "0x1234567890123456789012345678901234567890";
      const mockPriceFeed = "0x0987654321098765432109876543210987654321";
      
      await expect(
        system.crossChainBridge.connect(system.buyer1).addSupportedToken(
          "MOCK",
          mockToken,
          mockPriceFeed
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});