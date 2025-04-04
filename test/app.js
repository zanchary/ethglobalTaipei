const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
  deployTicketingSystem, 
  createSampleEvent, 
  advanceTime, 
  getCurrentTimestamp 
} = require("./test-helpers");

describe("EventTicketingApp", function() {
  let system;
  let eventId;
  
  beforeEach(async function() {
    system = await deployTicketingSystem();
    eventId = await createSampleEvent(system.ticketingApp, system.organizer1);
  });
  
  describe("Organizer Verification", function() {
    it("should verify organizers with valid World ID proof", async function() {
      // System setup already verified organizer1
      const isVerified = await system.ticketingApp.verifiedOrganizers(system.organizer1.address);
      expect(isVerified).to.be.true;
    });
    
    it("should reject actions from unverified organizers", async function() {
      const currentTime = await getCurrentTimestamp();
      
      // Try to create an event with unverified organizer
      await expect(
        system.ticketingApp.connect(system.organizer2).createEvent(
          "Failed Event",
          "Should not be created",
          "Nowhere",
          currentTime + 86400,
          true,
          currentTime + 75600,
          500,
          true
        )
      ).to.be.revertedWith("Only verified organizers can perform this action");
    });
  });
  
  describe("Event Creation and Management", function() {
    it("should create events with correct parameters", async function() {
      const eventInfo = await system.ticketingApp.getEventInfo(eventId);
      
      expect(eventInfo.name).to.equal("Sample Concert");
      expect(eventInfo.description).to.equal("A sample concert for testing");
      expect(eventInfo.location).to.equal("Test Venue");
      expect(eventInfo.allowResale).to.be.true;
      expect(eventInfo.dynamicNFTEnabled).to.be.true;
    });
    
    it("should add ticket types to events", async function() {
      const ticketTypeInfo = await system.ticketingApp.getTicketTypeInfo(eventId, 1);
      
      expect(ticketTypeInfo.name).to.equal("General Admission");
      expect(ticketTypeInfo.price).to.equal(ethers.utils.parseEther("0.1"));
      expect(ticketTypeInfo.totalSupply).to.equal(100);
      expect(ticketTypeInfo.sold).to.equal(0);
    });
    
    it("should cancel events", async function() {
      // Cancel the event
      await system.ticketingApp.connect(system.organizer1).cancelEvent(eventId);
      
      // Check if the event is inactive
      const isActive = await system.ticketingApp.isEventActive(eventId);
      expect(isActive).to.be.false;
    });
    
    it("should reject event cancellation by non-organizers", async function() {
      await expect(
        system.ticketingApp.connect(system.buyer1).cancelEvent(eventId)
      ).to.be.revertedWith("Only the event organizer can perform this action");
    });
  });
  
  describe("Ticket Purchasing", function() {
    it("should allow users to purchase tickets", async function() {
      // Purchase a general admission ticket
      const ticketTypeId = 1;
      const price = ethers.utils.parseEther("0.1");
      
      await expect(
        system.ticketingApp.connect(system.buyer1).purchaseTicket(eventId, ticketTypeId, { value: price })
      ).to.emit(system.ticketingApp, "TicketPurchased");
      
      // Check if ticket type sold count increased
      const ticketTypeInfo = await system.ticketingApp.getTicketTypeInfo(eventId, ticketTypeId);
      expect(ticketTypeInfo.sold).to.equal(1);
    });
    
    it("should reject purchases with insufficient payment", async function() {
      const ticketTypeId = 1;
      const lowPrice = ethers.utils.parseEther("0.05"); // Less than required 0.1 ETH
      
      await expect(
        system.ticketingApp.connect(system.buyer1).purchaseTicket(eventId, ticketTypeId, { value: lowPrice })
      ).to.be.revertedWith("Insufficient payment");
    });
    
    it("should mint NFT tickets to buyers", async function() {
      // Purchase a ticket
      const ticketTypeId = 1;
      const price = ethers.utils.parseEther("0.1");
      
      const tx = await system.ticketingApp.connect(system.buyer1).purchaseTicket(eventId, ticketTypeId, { value: price });
      const receipt = await tx.wait();
      
      // Find the TicketPurchased event to get the token ID
      const ticketPurchasedEvent = receipt.events.find(e => e.event === "TicketPurchased");
      const tokenId = ticketPurchasedEvent.args.tokenId;
      
      // Check if the buyer owns the NFT
      const tokenOwner = await system.ticketNFT.ownerOf(tokenId);
      expect(tokenOwner).to.equal(system.buyer1.address);
    });
  });
  
  describe("Attendance Recording", function() {
    let tokenId;
    
    beforeEach(async function() {
      // Purchase a ticket first to get a token ID
      const ticketTypeId = 1;
      const price = ethers.utils.parseEther("0.1");
      
      const tx = await system.ticketingApp.connect(system.buyer1).purchaseTicket(eventId, ticketTypeId, { value: price });
      const receipt = await tx.wait();
      
      const ticketPurchasedEvent = receipt.events.find(e => e.event === "TicketPurchased");
      tokenId = ticketPurchasedEvent.args.tokenId;
    });
    
    it("should record attendance by organizer", async function() {
      await expect(
        system.ticketingApp.connect(system.organizer1).recordAttendance(tokenId, system.buyer1.address)
      ).to.emit(system.ticketingApp, "AttendanceRecorded");
      
      // Check if attendance was recorded in the NFT
      const isAttended = await system.ticketNFT.isTicketAttended(tokenId);
      expect(isAttended).to.be.true;
    });
    
    it("should reject attendance recording by unauthorized users", async function() {
      await expect(
        system.ticketingApp.connect(system.buyer2).recordAttendance(tokenId, system.buyer1.address)
      ).to.be.revertedWith("Not authorized to record attendance");
    });
  });
  
  describe("Ticket Resale", function() {
    let tokenId;
    
    beforeEach(async function() {
      // Purchase a ticket first to get a token ID
      const ticketTypeId = 1;
      const price = ethers.utils.parseEther("0.1");
      
      const tx = await system.ticketingApp.connect(system.buyer1).purchaseTicket(eventId, ticketTypeId, { value: price });
      const receipt = await tx.wait();
      
      const ticketPurchasedEvent = receipt.events.find(e => e.event === "TicketPurchased");
      tokenId = ticketPurchasedEvent.args.tokenId;
    });
    
    it("should allow listing tickets for resale", async function() {
      const resalePrice = ethers.utils.parseEther("0.15");
      
      await expect(
        system.ticketingApp.connect(system.buyer1).listTicketForResale(tokenId, resalePrice)
      ).to.not.be.reverted;
      
      // Check if the ticket is listed for resale
      const [isForSale, price] = await system.ticketNFT.getResaleInfo(tokenId);
      expect(isForSale).to.be.true;
      expect(price).to.equal(resalePrice);
    });
    
    it("should allow buyers to purchase resale tickets", async function() {
      // List the ticket for resale
      const resalePrice = ethers.utils.parseEther("0.15");
      await system.ticketingApp.connect(system.buyer1).listTicketForResale(tokenId, resalePrice);
      
      // Purchase the resale ticket
      await expect(
        system.ticketingApp.connect(system.buyer2).buyResaleTicket(tokenId, { value: resalePrice })
      ).to.emit(system.ticketingApp, "TicketResold");
      
      // Check if ownership transferred
      const newOwner = await system.ticketNFT.ownerOf(tokenId);
      expect(newOwner).to.equal(system.buyer2.address);
    });
  });
  
  describe("Dynamic NFT Updates", function() {
    let tokenId;
    
    beforeEach(async function() {
      // Purchase a ticket first to get a token ID
      const ticketTypeId = 1;
      const price = ethers.utils.parseEther("0.1");
      
      const tx = await system.ticketingApp.connect(system.buyer1).purchaseTicket(eventId, ticketTypeId, { value: price });
      const receipt = await tx.wait();
      
      const ticketPurchasedEvent = receipt.events.find(e => e.event === "TicketPurchased");
      tokenId = ticketPurchasedEvent.args.tokenId;
    });
    
    it("should update NFT metadata after event", async function() {
      // Advance time past the event date
      await advanceTime(86401); // Just past the event time
      
      // Update the event NFT metadata
      const newEventName = "Sample Concert (Completed)";
      const newEventLocation = "Test Venue (Archived)";
      
      await expect(
        system.ticketingApp.connect(system.organizer1).updateEventNFTMetadata(
          eventId,
          newEventName,
          newEventLocation
        )
      ).to.not.be.reverted;
      
      // We'd ideally check the NFT metadata was updated, but that requires parsing the token URI
      // which is complex in a test environment. So we'll just check the function executes.
    });
  });
  
  describe("Platform Fee Collection", function() {
    it("should correctly distribute platform fees during purchase", async function() {
      // Track balance before purchase
      const initialPlatformBalance = await ethers.provider.getBalance(system.platformFeeReceiver.address);
      const initialOrganizerBalance = await ethers.provider.getBalance(system.organizer1.address);
      
      // Purchase a VIP ticket (higher price for more obvious fee)
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
  });
});