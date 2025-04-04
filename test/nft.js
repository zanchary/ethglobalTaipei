const { expect } = require("chai");
const { ethers } = require("hardhat");
const { 
  deployTicketingSystem, 
  createSampleEvent, 
  advanceTime, 
  getCurrentTimestamp 
} = require("./test-helpers");

describe("EventTicketNFT", function() {
  let system;
  let eventId;
  let tokenId;
  
  beforeEach(async function() {
    // Deploy the system
    system = await deployTicketingSystem();
    
    // Create a sample event
    eventId = await createSampleEvent(system.ticketingApp, system.organizer1);
    
    // Purchase a ticket to get a token ID for testing
    const ticketTypeId = 1;
    const price = ethers.utils.parseEther("0.1");
    
    const tx = await system.ticketingApp.connect(system.buyer1).purchaseTicket(eventId, ticketTypeId, { value: price });
    const receipt = await tx.wait();
    
    const ticketPurchasedEvent = receipt.events.find(e => e.event === "TicketPurchased");
    tokenId = ticketPurchasedEvent.args.tokenId;
  });
  
  describe("Ticket Minting", function() {
    it("should correctly mint tickets with proper metadata", async function() {
      // Check ticket ownership
      const owner = await system.ticketNFT.ownerOf(tokenId);
      expect(owner).to.equal(system.buyer1.address);
      
      // Check ticket event ID
      const ticketEventId = await system.ticketNFT.getTicketEventId(tokenId);
      expect(ticketEventId).to.equal(eventId);
      
      // Check ticket type ID
      const ticketTypeId = await system.ticketNFT.getTicketTypeId(tokenId);
      expect(ticketTypeId).to.equal(1);
      
      // Check attendance status (should be false initially)
      const isAttended = await system.ticketNFT.isTicketAttended(tokenId);
      expect(isAttended).to.be.false;
    });
    
    it("should reject minting from unauthorized accounts", async function() {
      // Try to mint a ticket directly from a non-ticketing app address
      // We need to call the same function that the ticketing app would call
      
      // First get the current timestamp for the event date
      const currentTime = await getCurrentTimestamp();
      
      await expect(
        system.ticketNFT.connect(system.buyer1).mintTicket(
          system.buyer1.address,
          eventId,
          1,
          "Test Event",
          "Test Ticket",
          currentTime + 86400,
          "Test Venue",
          true,
          ethers.utils.parseEther("0.1")
        )
      ).to.be.revertedWith("Only ticketing app can call this function");
    });
  });
  
  describe("Ticket Metadata", function() {
    it("should generate a valid token URI", async function() {
      const tokenURI = await system.ticketNFT.tokenURI(tokenId);
      
      // Token URI should be in base64 format
      expect(tokenURI).to.include("data:application/json;base64,");
      
      // Decode the base64 content
      const base64Content = tokenURI.replace("data:application/json;base64,", "");
      const decodedContent = Buffer.from(base64Content, 'base64').toString();
      const metadata = JSON.parse(decodedContent);
      
      // Check metadata fields
      expect(metadata).to.have.property("name");
      expect(metadata).to.have.property("description");
      expect(metadata).to.have.property("attributes");
      expect(metadata).to.have.property("qrCode");
      
      // Check specific attributes
      const eventIdAttribute = metadata.attributes.find(attr => attr.trait_type === "Event ID");
      expect(eventIdAttribute.value).to.equal(eventId.toString());
      
      const attendedAttribute = metadata.attributes.find(attr => attr.trait_type === "Attended");
      expect(attendedAttribute.value).to.equal("No");
    });
    
    it("should update metadata when marked as attended", async function() {
      // Mark the ticket as attended
      await system.ticketingApp.connect(system.organizer1).recordAttendance(tokenId, system.buyer1.address);
      
      // Get the updated token URI
      const tokenURI = await system.ticketNFT.tokenURI(tokenId);
      const base64Content = tokenURI.replace("data:application/json;base64,", "");
      const decodedContent = Buffer.from(base64Content, 'base64').toString();
      const metadata = JSON.parse(decodedContent);
      
      // Check that the attended attribute is now "Yes"
      const attendedAttribute = metadata.attributes.find(attr => attr.trait_type === "Attended");
      expect(attendedAttribute.value).to.equal("Yes");
    });
  });
  
  describe("Ticket Transfers and Resales", function() {
    it("should allow transfers for resellable tickets", async function() {
      // Transfer the ticket directly
      await system.ticketNFT.connect(system.buyer1).transferFrom(
        system.buyer1.address,
        system.buyer2.address,
        tokenId
      );
      
      // Check new owner
      const newOwner = await system.ticketNFT.ownerOf(tokenId);
      expect(newOwner).to.equal(system.buyer2.address);
    });
    
    it("should handle resale listing and cancellation", async function() {
      // List ticket for resale
      const resalePrice = ethers.utils.parseEther("0.15");
      await system.ticketNFT.connect(system.buyer1).listTicketForResale(tokenId, resalePrice);
      
      // Check if listed
      const [isForSale, price] = await system.ticketNFT.getResaleInfo(tokenId);
      expect(isForSale).to.be.true;
      expect(price).to.equal(resalePrice);
      
      // Cancel the listing
      await system.ticketNFT.connect(system.buyer1).cancelTicketResale(tokenId);
      
      // Check if no longer listed
      const [isStillForSale, _] = await system.ticketNFT.getResaleInfo(tokenId);
      expect(isStillForSale).to.be.false;
    });
    
    it("should block transfers of attended tickets", async function() {
      // Mark the ticket as attended
      await system.ticketingApp.connect(system.organizer1).recordAttendance(tokenId, system.buyer1.address);
      
      // Try to transfer
      await expect(
        system.ticketNFT.connect(system.buyer1).transferFrom(
          system.buyer1.address,
          system.buyer2.address,
          tokenId
        )
      ).to.be.revertedWith("Attended tickets cannot be transferred");
    });
  });
  
  describe("Metadata Updates", function() {
    it("should allow organizers to update ticket metadata via ticketing app", async function() {
      // Since we can't directly call updateTicketMetadata (as it's restricted to the ticketing app),
      // we need to call it through the ticketing app after the event
      
      // Advance time past the event date
      await advanceTime(86401); // Just past the event time
      
      // Update the event NFT metadata
      const newEventName = "Sample Concert (Completed)";
      const newEventLocation = "Test Venue (Archived)";
      
      await system.ticketingApp.connect(system.organizer1).updateEventNFTMetadata(
        eventId,
        newEventName,
        newEventLocation
      );
      
      // Check the token URI for updated metadata
      const tokenURI = await system.ticketNFT.tokenURI(tokenId);
      const base64Content = tokenURI.replace("data:application/json;base64,", "");
      const decodedContent = Buffer.from(base64Content, 'base64').toString();
      const metadata = JSON.parse(decodedContent);
      
      // The name should include the new event name
      expect(metadata.name).to.include(newEventName);
    });
    
    it("should reject direct metadata updates from unauthorized accounts", async function() {
      await expect(
        system.ticketNFT.connect(system.buyer1).updateTicketMetadata(
          tokenId,
          "Hacked Event",
          "Hacked Ticket",
          "Hacked Venue"
        )
      ).to.be.revertedWith("Only ticketing app can call this function");
    });
  });
});