const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EventTicketing System", function () {
  // Contract instances
  let EventTicketNFT;
  let WorldIDVerifier;
  let EventTicketing;
  let ticketNFT;
  let worldIDVerifier;
  let eventTicketing;
  
  // Users
  let owner;
  let organizer;
  let buyer1;
  let buyer2;
  let addr;
  
  // Constants for testing
  const eventName = "Test Concert";
  const eventDescription = "A test concert for testing purposes";
  const ticketPrice = ethers.parseEther("0.1"); // 0.1 ETH
  const totalTickets = 100;
  
  // Mock World ID
  let mockWorldID;
  
  // Timestamp constants
  let currentTimestamp;
  let eventDate;
  let resaleDeadline;
  
  // World ID constants
  const appId = "app_staging_0123456789";
  const actionId = "purchase-ticket";
  
  beforeEach(async function () {
    // Get current block timestamp
    currentTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
    eventDate = currentTimestamp + 86400 * 30; // 30 days in the future
    resaleDeadline = currentTimestamp + 86400 * 29; // 29 days in the future (1 day before event)
    
    // Get signers
    [owner, organizer, buyer1, buyer2, ...addr] = await ethers.getSigners();
    
    // Deploy mock World ID contract
    const MockWorldID = await ethers.getContractFactory("MockWorldID");
    mockWorldID = await MockWorldID.deploy();
    await mockWorldID.waitForDeployment();
    
    // Deploy NFT contract
    EventTicketNFT = await ethers.getContractFactory("EventTicketNFT");
    ticketNFT = await EventTicketNFT.deploy();
    await ticketNFT.waitForDeployment();
    
    // Deploy World ID verifier
    WorldIDVerifier = await ethers.getContractFactory("WorldIDVerifier");
    worldIDVerifier = await WorldIDVerifier.deploy(mockWorldID.getAddress(), appId);
    await worldIDVerifier.waitForDeployment();
    
    // Register the action ID
    await worldIDVerifier.registerAction(actionId);
    
    // Deploy main contract
    EventTicketing = await ethers.getContractFactory("EventTicketing");
    eventTicketing = await EventTicketing.deploy(
      await ticketNFT.getAddress(),
      await worldIDVerifier.getAddress()
    );
    await eventTicketing.waitForDeployment();
    
    // Grant MINTER_ROLE and URI_SETTER_ROLE to the main contract
    const MINTER_ROLE = await ticketNFT.MINTER_ROLE();
    const URI_SETTER_ROLE = await ticketNFT.URI_SETTER_ROLE();
    await ticketNFT.grantRole(MINTER_ROLE, await eventTicketing.getAddress());
    await ticketNFT.grantRole(URI_SETTER_ROLE, await eventTicketing.getAddress());
  });

  // Helper function to simulate World ID verification
  async function verifyWithWorldID(user) {
    // Generate mock verification parameters
    const signal = user.address;
    const root = ethers.toBigInt("0x1234567890123456789012345678901234567890123456789012345678901234");
    const nullifierHash = ethers.toBigInt("0x2345678901234567890123456789012345678901234567890123456789012345");
    const proof = Array(8).fill(ethers.toBigInt("0x1111111111111111111111111111111111111111111111111111111111111111"));
    
    // Verify the user with World ID
    await worldIDVerifier.connect(user).verifyAndRegister(
      signal,
      root,
      nullifierHash,
      actionId,
      proof
    );
  }
  
  describe("Contract Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await eventTicketing.owner()).to.equal(owner.address);
    });
    
    it("Should connect to the correct NFT contract", async function () {
      expect(await eventTicketing.ticketNFT()).to.equal(await ticketNFT.getAddress());
    });
    
    it("Should connect to the correct World ID verifier", async function () {
      expect(await eventTicketing.worldIDVerifier()).to.equal(await worldIDVerifier.getAddress());
    });
    
    it("Should initialize with correct token name and symbol in NFT contract", async function () {
      expect(await ticketNFT.name()).to.equal("WorldTickets");
      expect(await ticketNFT.symbol()).to.equal("WTKT");
    });
    
    it("Should set owner as platform admin", async function () {
      expect(await eventTicketing.platformAdmin()).to.equal(owner.address);
    });
  });
  
  describe("Organizer Management", function () {
    it("Should allow owner to verify organizers", async function () {
      // Verify organizer
      await expect(eventTicketing.verifyOrganizer(organizer.address))
        .to.emit(eventTicketing, "OrganizerVerified")
        .withArgs(organizer.address);
        
      expect(await eventTicketing.verifiedOrganizers(organizer.address)).to.be.true;
    });
    
    it("Should prevent non-owners from verifying organizers", async function () {
        await expect(eventTicketing.connect(buyer1).verifyOrganizer(addr[0].address))
          .to.be.revertedWithCustomError(eventTicketing, "OwnableUnauthorizedAccount");
    });
  });
  
  describe("Platform Settings", function () {
    it("Should allow owner to set platform fee percentage", async function () {
      const newFee = 300; // 3%
      await eventTicketing.setPlatformFeePercentage(newFee);
      expect(await eventTicketing.platformFeePercentage()).to.equal(newFee);
    });
    
    it("Should prevent setting platform fee too high", async function () {
      await expect(
        eventTicketing.setPlatformFeePercentage(1100) // 11%
      ).to.be.revertedWith("Fee too high");
    });
    
    it("Should allow owner to set max resale price increase", async function () {
      const newMaxIncrease = 3000; // 30%
      await eventTicketing.setMaxResalePriceIncrease(newMaxIncrease);
      expect(await eventTicketing.maxResalePriceIncrease()).to.equal(newMaxIncrease);
    });
    
    it("Should prevent setting max resale increase too high", async function () {
      await expect(
        eventTicketing.setMaxResalePriceIncrease(11000) // 110%
      ).to.be.revertedWith("Increase too high");
    });
    
    it("Should allow owner to update platform admin", async function () {
      await eventTicketing.updatePlatformAdmin(addr[0].address);
      expect(await eventTicketing.platformAdmin()).to.equal(addr[0].address);
    });
    
    it("Should prevent updating platform admin to zero address", async function () {
      // In ethers v6, the zero address is accessed as follows:
      const zeroAddress = ethers.ZeroAddress;
      await expect(
        eventTicketing.updatePlatformAdmin(zeroAddress)
      ).to.be.revertedWith("Invalid address");
    });
  });
  
  describe("Event Creation", function () {
    beforeEach(async function () {
      // Verify organizer
      await eventTicketing.verifyOrganizer(organizer.address);
    });
    
    it("Should allow verified organizers to create events", async function () {
      await expect(
        eventTicketing.connect(organizer).createEvent(
          eventName,
          eventDescription,
          eventDate,
          totalTickets,
          ticketPrice,
          true, // Allow resale
          resaleDeadline,
          "ipfs://eventURI",
          false // World ID not required
        )
      ).to.emit(eventTicketing, "EventCreated")
       .withArgs(0, eventName, totalTickets, ticketPrice, organizer.address, eventDate, false);
      
      // Check event details
      const eventDetails = await eventTicketing.getEventDetails(0);
      expect(eventDetails.name).to.equal(eventName);
      expect(eventDetails.totalTickets).to.equal(totalTickets);
      expect(eventDetails.worldIdRequired).to.be.false;
    });
    
    it("Should allow creating events that require World ID verification", async function () {
      await expect(
        eventTicketing.connect(organizer).createEvent(
          "World ID Required Event",
          "Verification required",
          eventDate,
          totalTickets,
          ticketPrice,
          true,
          resaleDeadline,
          "ipfs://eventURI",
          true // World ID required
        )
      ).to.emit(eventTicketing, "EventCreated")
       .withArgs(0, "World ID Required Event", totalTickets, ticketPrice, organizer.address, eventDate, true);
      
      // Check event details
      const eventDetails = await eventTicketing.getEventDetails(0);
      expect(eventDetails.worldIdRequired).to.be.true;
    });
    
    it("Should prevent unverified organizers from creating events", async function () {
      await expect(
        eventTicketing.connect(buyer1).createEvent(
          eventName,
          eventDescription,
          eventDate,
          totalTickets,
          ticketPrice,
          true,
          resaleDeadline,
          "ipfs://eventURI",
          false
        )
      ).to.be.revertedWith("Not a verified organizer");
    });
    
    it("Should validate event creation parameters", async function () {
      // Test with event date in the past
      await expect(
        eventTicketing.connect(organizer).createEvent(
          eventName,
          eventDescription,
          currentTimestamp - 1000, // Past date
          totalTickets,
          ticketPrice,
          true,
          resaleDeadline,
          "ipfs://eventURI",
          false
        )
      ).to.be.revertedWith("Event date must be in the future");
      
      // Test with zero tickets
      await expect(
        eventTicketing.connect(organizer).createEvent(
          eventName,
          eventDescription,
          eventDate,
          0, // Zero tickets
          ticketPrice,
          true,
          resaleDeadline,
          "ipfs://eventURI",
          false
        )
      ).to.be.revertedWith("Total tickets must be greater than zero");
      
      // Test with zero price
      await expect(
        eventTicketing.connect(organizer).createEvent(
          eventName,
          eventDescription,
          eventDate,
          totalTickets,
          0, // Zero price
          true,
          resaleDeadline,
          "ipfs://eventURI",
          false
        )
      ).to.be.revertedWith("Ticket price must be greater than zero");
    });
  });
  
  describe("World ID Verification", function () {
    beforeEach(async function () {
      // Verify organizer
      await eventTicketing.verifyOrganizer(organizer.address);
    });
    
    it("Should verify a user with World ID", async function () {
      await verifyWithWorldID(buyer1);
      expect(await worldIDVerifier.isVerified(buyer1.address)).to.be.true;
    });
    
    it("Should allow verified users to buy tickets for events requiring verification", async function () {
      // Create an event requiring World ID verification
      await eventTicketing.connect(organizer).createEvent(
        "Verified Event",
        "Verification required",
        eventDate,
        totalTickets,
        ticketPrice,
        true,
        resaleDeadline,
        "ipfs://eventURI",
        true // Require World ID
      );
      
      // Verify the user
      await verifyWithWorldID(buyer1);
      
      // Buy ticket
      await eventTicketing.connect(buyer1).buyTicket(0, { value: ticketPrice });
      
      // Check ticket was minted
      expect(await ticketNFT.ownerOf(0)).to.equal(buyer1.address);
    });
    
    it("Should prevent unverified users from buying tickets for events requiring verification", async function () {
      // Create an event requiring World ID verification
      await eventTicketing.connect(organizer).createEvent(
        "Verified Event",
        "Verification required",
        eventDate,
        totalTickets,
        ticketPrice,
        true,
        resaleDeadline,
        "ipfs://eventURI",
        true // Require World ID
      );
      
      // Try to buy ticket without verification
      await expect(
        eventTicketing.connect(buyer1).buyTicket(0, { value: ticketPrice })
      ).to.be.revertedWith("World ID verification required");
    });
  });
  
  describe("Ticket Purchase", function () {
    let eventId;
    
    beforeEach(async function () {
      // Verify organizer and create event
      await eventTicketing.verifyOrganizer(organizer.address);
      await eventTicketing.connect(organizer).createEvent(
        eventName,
        eventDescription,
        eventDate,
        totalTickets,
        ticketPrice,
        true,
        resaleDeadline,
        "ipfs://eventURI",
        false // No World ID required
      );
      eventId = 0;
    });
    
    it("Should allow users to buy tickets", async function () {
      // Initial platform balance
      const initialPlatformBalance = await ethers.provider.getBalance(owner.address);
      const initialOrganizerBalance = await ethers.provider.getBalance(organizer.address);
      
      // Buy ticket
      await expect(
        eventTicketing.connect(buyer1).buyTicket(eventId, { value: ticketPrice })
      ).to.emit(eventTicketing, "TicketMinted")
       .withArgs(0, eventId, buyer1.address, ticketPrice);
       
      // Check ticket ownership
      expect(await ticketNFT.ownerOf(0)).to.equal(buyer1.address);
      
      // Check ticket details
      const ticketInfo = await ticketNFT.getTicketInfo(0);
      expect(ticketInfo.eventId).to.equal(eventId);
      expect(ticketInfo.purchasePrice).to.equal(ticketPrice);
      expect(ticketInfo.isUsed).to.be.false;
      
      // Check loyalty points
      expect(await eventTicketing.getUserLoyaltyPoints(buyer1.address)).to.equal(1);
      
      // Check fee distribution - updated for ethers v6
      const platformFee = (ticketPrice * 200n) / 10000n; // 2% fee
      const organizerAmount = ticketPrice - platformFee;
      
      // Platform admin should receive fee (allowing for gas costs)
      const finalPlatformBalance = await ethers.provider.getBalance(owner.address);
      const balanceDiff = finalPlatformBalance - initialPlatformBalance;
      // Use a less precise comparison due to gas costs
      expect(balanceDiff).to.be.closeTo(
        platformFee, ethers.parseEther("0.01")
      );
      
      // Organizer should receive rest
      const finalOrganizerBalance = await ethers.provider.getBalance(organizer.address);
      const organizerBalanceDiff = finalOrganizerBalance - initialOrganizerBalance;
      expect(organizerBalanceDiff).to.be.closeTo(
        organizerAmount, ethers.parseEther("0.01")
      );
    });
    
    it("Should prevent buying tickets with incorrect payment", async function () {
      await expect(
        eventTicketing.connect(buyer1).buyTicket(eventId, { value: ethers.parseEther("0.05") })
      ).to.be.revertedWith("Incorrect payment");
    });
    
    it("Should prevent buying more tickets than available", async function () {
      // Create an event with just 1 ticket
      await eventTicketing.connect(organizer).createEvent(
        "Limited Event",
        "Limited tickets",
        eventDate,
        1, // Only 1 ticket
        ticketPrice,
        true,
        resaleDeadline,
        "ipfs://limitedEventURI",
        false
      );
      const limitedEventId = 1;
      
      // Buy the only ticket
      await eventTicketing.connect(buyer1).buyTicket(limitedEventId, { value: ticketPrice });
      
      // Try to buy another ticket
      await expect(
        eventTicketing.connect(buyer2).buyTicket(limitedEventId, { value: ticketPrice })
      ).to.be.revertedWith("No more tickets available");
    });
  });
  
  describe("Ticket Resale", function () {
    let eventId;
    let tokenId;
    const resalePrice = ethers.parseEther("0.15"); // 0.15 ETH
    
    beforeEach(async function () {
      // Setup: verify organizer, create event, buy ticket
      await eventTicketing.verifyOrganizer(organizer.address);
      await eventTicketing.connect(organizer).createEvent(
        eventName,
        eventDescription,
        eventDate,
        totalTickets,
        ticketPrice,
        true, // Allow resale
        resaleDeadline,
        "ipfs://eventURI",
        false
      );
      eventId = 0;
      
      // Buy ticket
      await eventTicketing.connect(buyer1).buyTicket(eventId, { value: ticketPrice });
      tokenId = 0;
    });
    
    it("Should allow ticket owners to list tickets for resale", async function () {
      // Approve the event ticketing contract to transfer the NFT
      await ticketNFT.connect(buyer1).approve(await eventTicketing.getAddress(), tokenId);
      
      await expect(
        eventTicketing.connect(buyer1).listTicketForResale(tokenId, resalePrice)
      ).to.emit(eventTicketing, "TicketListedForResale")
       .withArgs(tokenId, resalePrice);
       
      // Check ticket is listed
      const resaleInfo = await eventTicketing.resaleTickets(tokenId);
      expect(resaleInfo.isListed).to.be.true;
      expect(resaleInfo.price).to.equal(resalePrice);
    });
    
    it("Should prevent listing tickets for resale at too high a price", async function () {
      // Approve the event ticketing contract to transfer the NFT
      await ticketNFT.connect(buyer1).approve(await eventTicketing.getAddress(), tokenId);
      
      // Try to list at a very high markup
      const tooHighPrice = ethers.parseEther("1.0");
      
      await expect(
        eventTicketing.connect(buyer1).listTicketForResale(tokenId, tooHighPrice)
      ).to.be.revertedWith("Resale price too high");
    });
    
    it("Should allow users to buy resale tickets", async function () {
      // List ticket for resale
      await ticketNFT.connect(buyer1).approve(await eventTicketing.getAddress(), tokenId);
      await eventTicketing.connect(buyer1).listTicketForResale(tokenId, resalePrice);
      
      // Track balances before purchase
      const initialPlatformBalance = await ethers.provider.getBalance(owner.address);
      const initialSellerBalance = await ethers.provider.getBalance(buyer1.address);
      
      // Buy resale ticket
      await expect(
        eventTicketing.connect(buyer2).buyResaleTicket(tokenId, { value: resalePrice })
      ).to.emit(eventTicketing, "TicketResold")
       .withArgs(tokenId, buyer1.address, buyer2.address, resalePrice);
       
      // Check new owner
      expect(await ticketNFT.ownerOf(tokenId)).to.equal(buyer2.address);
      
      // Check ticket is no longer for sale
      const resaleInfo = await eventTicketing.resaleTickets(tokenId);
      expect(resaleInfo.isListed).to.be.false;
      
      // Check fee distribution - updated for ethers v6
      const platformFee = (resalePrice * 200n) / 10000n; // 2% fee
      const sellerAmount = resalePrice - platformFee;
      
      // Platform admin should receive fee
      const finalPlatformBalance = await ethers.provider.getBalance(owner.address);
      expect(finalPlatformBalance - initialPlatformBalance).to.be.closeTo(
        platformFee, ethers.parseEther("0.01")
      );
      
      // Seller should receive the rest
      const finalSellerBalance = await ethers.provider.getBalance(buyer1.address);
      expect(finalSellerBalance - initialSellerBalance).to.be.closeTo(
        sellerAmount, ethers.parseEther("0.01")
      );
    });
    
    it("Should allow owners to cancel resale listings", async function () {
      // List ticket for resale
      await ticketNFT.connect(buyer1).approve(await eventTicketing.getAddress(), tokenId);
      await eventTicketing.connect(buyer1).listTicketForResale(tokenId, resalePrice);
      
      // Cancel listing
      await eventTicketing.connect(buyer1).cancelResaleListing(tokenId);
      
      // Check ticket is no longer for sale
      const resaleInfo = await eventTicketing.resaleTickets(tokenId);
      expect(resaleInfo.isListed).to.be.false;
    });
    
    it("Should prevent buying your own resale ticket", async function () {
      // List ticket for resale
      await ticketNFT.connect(buyer1).approve(await eventTicketing.getAddress(), tokenId);
      await eventTicketing.connect(buyer1).listTicketForResale(tokenId, resalePrice);
      
      // Try to buy own ticket
      await expect(
        eventTicketing.connect(buyer1).buyResaleTicket(tokenId, { value: resalePrice })
      ).to.be.revertedWith("Cannot buy your own ticket");
    });
  });
  
  describe("Event and Ticket Management", function () {
    let eventId;
    let tokenId;
    
    beforeEach(async function () {
      // Setup: verify organizer, create event, buy ticket
      await eventTicketing.verifyOrganizer(organizer.address);
      await eventTicketing.connect(organizer).createEvent(
        eventName,
        eventDescription,
        eventDate,
        totalTickets,
        ticketPrice,
        true,
        resaleDeadline,
        "ipfs://eventURI",
        false
      );
      eventId = 0;
      
      // Buy ticket
      await eventTicketing.connect(buyer1).buyTicket(eventId, { value: ticketPrice });
      tokenId = 0;
    });
    
    it("Should allow organizers to mark tickets as used", async function () {
      // Mark ticket as used
      await expect(
        eventTicketing.connect(organizer).useTicket(tokenId)
      ).to.emit(ticketNFT, "TicketUsed")
       .withArgs(tokenId, eventId);
       
      // Check ticket is marked as used
      expect(await ticketNFT.isTicketUsed(tokenId)).to.be.true;
      
      // Check attendance record
      expect(await eventTicketing.hasAttended(eventId, buyer1.address)).to.be.true;
      
      // Check loyalty points (1 for purchase + 2 for attendance)
      expect(await eventTicketing.getUserLoyaltyPoints(buyer1.address)).to.equal(3);
    });
    
    it("Should prevent non-organizers from marking tickets as used", async function () {
      await expect(
        eventTicketing.connect(buyer2).useTicket(tokenId)
      ).to.be.revertedWith("Not the event organizer");
    });
    
    it("Should prevent using a ticket twice", async function () {
      // Use ticket first time
      await eventTicketing.connect(organizer).useTicket(tokenId);
      
      // Try to use it again
      await expect(
        eventTicketing.connect(organizer).useTicket(tokenId)
      ).to.be.revertedWith("Ticket already used");
    });
  });
  
  describe("Event Cancellation and Refunds", function () {
    let eventId;
    let tokenId;
  
    beforeEach(async function () {
      // Setup: verify organizer, create event, buy ticket
      await eventTicketing.verifyOrganizer(organizer.address);
      await eventTicketing.connect(organizer).createEvent(
        eventName,
        eventDescription,
        eventDate,
        totalTickets,
        ticketPrice,
        true,
        resaleDeadline,
        "ipfs://eventURI",
        false
      );
      eventId = 0;
      
      // Buy ticket
      await eventTicketing.connect(buyer1).buyTicket(eventId, { value: ticketPrice });
      tokenId = 0;
      
      // Fund contract for refunds
      // Make sure contract address is correct - using getAddress() for ethers v6
      const contractAddress = await eventTicketing.getAddress();
      await owner.sendTransaction({
        to: contractAddress,
        value: ethers.parseEther("1.0")
      });
    });
    
    it("Should allow organizers to cancel events", async function () {
      await expect(
        eventTicketing.connect(organizer).cancelEvent(eventId)
      ).to.emit(eventTicketing, "EventCancelled")
       .withArgs(eventId);
       
      // Check event is cancelled
      const eventDetails = await eventTicketing.getEventDetails(eventId);
      expect(eventDetails.isActive).to.be.false;
    });
    
    it("Should prevent non-organizers from cancelling events", async function () {
      await expect(
        eventTicketing.connect(buyer1).cancelEvent(eventId)
      ).to.be.revertedWith("Not the event organizer");
    });
    
    it("Should allow ticket holders to claim refunds for cancelled events", async function () {
      // Cancel the event
      await eventTicketing.connect(organizer).cancelEvent(eventId);
      
      // Track balance before refund
      const initialBalance = await ethers.provider.getBalance(buyer1.address);
      
      // Claim refund
      await expect(
        eventTicketing.connect(buyer1).claimRefund(tokenId)
      ).to.emit(eventTicketing, "RefundIssued")
       .withArgs(tokenId, buyer1.address, ticketPrice);
       
      // Check balance after refund
      const finalBalance = await ethers.provider.getBalance(buyer1.address);
      expect(finalBalance - initialBalance).to.be.closeTo(
        ticketPrice, ethers.parseEther("0.01") // Allowing for gas costs
      );
      
      // Check ticket is marked as used (to prevent double refunds)
      expect(await ticketNFT.isTicketUsed(tokenId)).to.be.true;
    });
    
    it("Should prevent claiming refunds for active events", async function () {
      await expect(
        eventTicketing.connect(buyer1).claimRefund(tokenId)
      ).to.be.revertedWith("Event not cancelled");
    });
    
    it("Should prevent claiming refunds twice", async function () {
      // Cancel the event
      await eventTicketing.connect(organizer).cancelEvent(eventId);
      
      // Claim refund first time
      await eventTicketing.connect(buyer1).claimRefund(tokenId);
      
      // Try to claim again
      await expect(
        eventTicketing.connect(buyer1).claimRefund(tokenId)
      ).to.be.revertedWith("Ticket already used");
    });
  });
  
  describe("Utility Functions", function () {
    let eventId;
    let tokenId;
    
    beforeEach(async function () {
      // Setup: verify organizer, create event, buy ticket
      await eventTicketing.verifyOrganizer(organizer.address);
      await eventTicketing.connect(organizer).createEvent(
        eventName,
        eventDescription,
        eventDate,
        totalTickets,
        ticketPrice,
        true,
        resaleDeadline,
        "ipfs://eventURI",
        false
      );
      eventId = 0;
      
      // Buy ticket
      await eventTicketing.connect(buyer1).buyTicket(eventId, { value: ticketPrice });
      tokenId = 0;
    });
    
    it("Should generate valid ticket checksum", async function () {
      const timestamp = Math.floor(Date.now() / 1000);
      const checksum = await eventTicketing.generateTicketChecksum(tokenId, timestamp);
      
      // The checksum should be a valid bytes32 value
      expect(checksum).to.not.be.null;
      expect(checksum.length).to.equal(66); // "0x" + 64 hex chars
    });
    
    it("Should return correct event details", async function () {
      const eventDetails = await eventTicketing.getEventDetails(eventId);
      
      expect(eventDetails.name).to.equal(eventName);
      expect(eventDetails.description).to.equal(eventDescription);
      expect(eventDetails.eventDate).to.equal(eventDate);
      expect(eventDetails.totalTickets).to.equal(totalTickets);
      expect(eventDetails.ticketsSold).to.equal(1);
      expect(eventDetails.ticketPrice).to.equal(ticketPrice);
      expect(eventDetails.organizer).to.equal(organizer.address);
      expect(eventDetails.isResellAllowed).to.be.true;
      expect(eventDetails.resaleDeadline).to.equal(resaleDeadline);
      expect(eventDetails.eventURI).to.equal("ipfs://eventURI");
      expect(eventDetails.isActive).to.be.true;
      expect(eventDetails.worldIdRequired).to.be.false;
    });
  });
  
  describe("Time-based Restrictions", function () {
    let eventId;
    let tokenId;
    const resalePrice = ethers.parseEther("0.15"); // Define resale price here
    
    beforeEach(async function () {
      // Setup: verify organizer, create event, buy ticket
      await eventTicketing.verifyOrganizer(organizer.address);
      await eventTicketing.connect(organizer).createEvent(
        eventName,
        eventDescription,
        eventDate,
        totalTickets,
        ticketPrice,
        true,
        resaleDeadline,
        "ipfs://eventURI",
        false
      );
      eventId = 0;
      
      // Buy ticket
      await eventTicketing.connect(buyer1).buyTicket(eventId, { value: ticketPrice });
      tokenId = 0;
    });
    
    it("Should prevent buying tickets after event date", async function () {
      // Fast forward time to after the event
      await time.increaseTo(eventDate + 1);
      
      await expect(
        eventTicketing.connect(buyer2).buyTicket(eventId, { value: ticketPrice })
      ).to.be.revertedWith("Event has already occurred");
    });
    
    it("Should prevent listing tickets for resale after deadline", async function () {
      // Approve the event ticketing contract to transfer the NFT
      await ticketNFT.connect(buyer1).approve(await eventTicketing.getAddress(), tokenId);
      
      // Fast forward time to after resale deadline
      await time.increaseTo(resaleDeadline + 1);
      
      await expect(
        eventTicketing.connect(buyer1).listTicketForResale(tokenId, resalePrice)
      ).to.be.revertedWith("Resale deadline passed");
    });
    
    it("Should prevent buying resale tickets after deadline", async function () {
      // Approve the event ticketing contract to transfer the NFT
      await ticketNFT.connect(buyer1).approve(await eventTicketing.getAddress(), tokenId);
      
      // List ticket for resale
      await eventTicketing.connect(buyer1).listTicketForResale(tokenId, resalePrice);
      
      // Fast forward time to after resale deadline
      await time.increaseTo(resaleDeadline + 1);
      
      await expect(
        eventTicketing.connect(buyer2).buyResaleTicket(tokenId, { value: resalePrice })
      ).to.be.revertedWith("Resale deadline passed");
    });
    
    it("Should prevent cancelling events after they've occurred", async function () {
      // Fast forward time to after the event
      await time.increaseTo(eventDate + 1);
      
      await expect(
        eventTicketing.connect(organizer).cancelEvent(eventId)
      ).to.be.revertedWith("Event has already occurred");
    });
  });
  
  describe("NFT Token Transfers", function () {
    let eventId;
    let tokenId;
    
    beforeEach(async function () {
      // Setup: verify organizer, create event, buy ticket
      await eventTicketing.verifyOrganizer(organizer.address);
      await eventTicketing.connect(organizer).createEvent(
        eventName,
        eventDescription,
        eventDate,
        totalTickets,
        ticketPrice,
        true,
        resaleDeadline,
        "ipfs://eventURI",
        false
      );
      eventId = 0;
      
      // Buy ticket
      await eventTicketing.connect(buyer1).buyTicket(eventId, { value: ticketPrice });
      tokenId = 0;
    });
    
    it("Should transfer ownership when using transferFrom", async function () {
      await ticketNFT.connect(buyer1).transferFrom(buyer1.address, buyer2.address, tokenId);
      expect(await ticketNFT.ownerOf(tokenId)).to.equal(buyer2.address);
    });
    
    it("Should transfer ownership when using safeTransferFrom", async function () {
      await ticketNFT.connect(buyer1)["safeTransferFrom(address,address,uint256)"](
        buyer1.address, buyer2.address, tokenId
      );
      expect(await ticketNFT.ownerOf(tokenId)).to.equal(buyer2.address);
    });
    
    it("Should transfer ownership when using safeTransferFrom with data", async function () {
      const data = ethers.toUtf8Bytes("test data");
      
      await ticketNFT.connect(buyer1)["safeTransferFrom(address,address,uint256,bytes)"](
        buyer1.address, buyer2.address, tokenId, data
      );
      
      expect(await ticketNFT.ownerOf(tokenId)).to.equal(buyer2.address);
    });
  });
});