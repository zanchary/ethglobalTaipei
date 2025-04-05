const { ethers } = require("hardhat");
require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("Starting ticket validation script...");

  // Load contract addresses from .env file
  const eventTicketingAddress = process.env.EVENT_TICKETING_ADDRESS;
  const eventTicketNFTAddress = process.env.EVENT_TICKET_NFT_ADDRESS;

  if (!eventTicketingAddress || !eventTicketNFTAddress) {
    console.error("Missing contract addresses. Please set EVENT_TICKETING_ADDRESS and EVENT_TICKET_NFT_ADDRESS in your .env file");
    return;
  }

  // Get account to connect with (organizer should be the one validating)
  const [deployer, organizer] = await ethers.getSigners();
  console.log("Organizer account:", organizer.address);

  // Get contract instances
  const EventTicketing = await ethers.getContractFactory("EventTicketing");
  const eventTicketing = EventTicketing.attach(eventTicketingAddress);

  const EventTicketNFT = await ethers.getContractFactory("EventTicketNFT");
  const eventTicketNFT = EventTicketNFT.attach(eventTicketNFTAddress);

  // Get ticket ID from command line or use default
  const tokenId = process.argv[2] ? Number(process.argv[2]) : 1;
  console.log(`Validating ticket ID: ${tokenId}`);

  try {
    // First check if the ticket exists and get its info
    const ticketOwner = await eventTicketNFT.ownerOf(tokenId);
    console.log(`Ticket owner: ${ticketOwner}`);

    // Get ticket info
    const ticketInfo = await eventTicketNFT.getTicketInfo(tokenId);
    const eventId = ticketInfo.eventId;
    console.log(`Ticket info:`, {
      eventId: eventId.toString(),
      ticketIndex: ticketInfo.ticketIndex.toString(),
      purchasePrice: ethers.formatEther(ticketInfo.purchasePrice)
    });

    // Check if ticket is already used
    const isUsed = await eventTicketNFT.isTicketUsed(tokenId);
    console.log(`Is ticket already used? ${isUsed}`);
    
    if (isUsed) {
      console.log("Cannot validate: Ticket has already been used!");
      return;
    }

    // Get event details to ensure the organizer is authorized
    const eventDetails = await eventTicketing.getEventDetails(eventId);
    console.log(`Event organizer: ${eventDetails[6]}`);
    
    if (eventDetails[6].toLowerCase() !== organizer.address.toLowerCase()) {
      console.log(`Warning: You (${organizer.address}) are not the registered organizer of this event. 
      Only the event organizer (${eventDetails[6]}) can validate tickets.`);
      
      // For testing only - option to proceed anyway
      if (process.argv.includes("--force")) {
        console.log("Proceeding anyway due to --force flag...");
      } else {
        console.log("Use --force flag to proceed anyway (for testing only)");
        return;
      }
    }

    // 1. SIMULATE SCANNING: Loading QR code data from file
    console.log("\nSimulating QR code scan...");
    let qrDataBase64;
    try {
      const qrDataPath = path.join(__dirname, `../qr-codes/ticket-${tokenId}-data.txt`);
      qrDataBase64 = fs.readFileSync(qrDataPath, 'utf8');
      console.log("QR code data loaded from file");
    } catch (error) {
      console.log("Couldn't find QR code data file. Please generate QR code first using generate-qrcode.js");
      
      // If QR data file not found, generate new QR data from contract
      console.log("Generating fresh QR code data from contract...");
      const qrData = await eventTicketing.generateQRCodeData(tokenId);
      console.log("Using freshly generated QR data");
    }

    // 2. VERIFY TICKET VALIDITY: Use the contract to verify the QR code
    console.log("\nVerifying QR code data...");
    
    // If using data from file, convert from base64 back to hex
    let qrDataHex;
    if (qrDataBase64) {
      const qrDataBuffer = Buffer.from(qrDataBase64, 'base64');
      qrDataHex = '0x' + qrDataBuffer.toString('hex');
    } else {
      // Use freshly generated QR data
      qrDataHex = await eventTicketing.generateQRCodeData(tokenId);
    }
    
    const maxAgeSeconds = 3600; // Allow QR codes up to 1 hour old
    const verifyResult = await eventTicketing.verifyQRCode(qrDataHex, maxAgeSeconds);
    
    console.log("Verification result:", {
      isValid: verifyResult[0],
      tokenId: verifyResult[1].toString(),
      eventId: verifyResult[2].toString(),
      owner: verifyResult[3]
    });

    if (!verifyResult[0]) {
      console.log("QR code validation failed! This ticket may not be valid.");
      return;
    }

    // 3. MARK TICKET AS USED: Call useTicket as the organizer
    console.log("\nMarking ticket as used...");
    
    // Ask for confirmation before proceeding
    if (!process.argv.includes("--confirm")) {
      console.log("This is a simulation. Add --confirm flag to actually validate the ticket");
      console.log("Command: node validate-ticket.js " + tokenId + " --confirm");
      return;
    }
    
    const useTicketTx = await eventTicketing.connect(organizer).useTicket(tokenId);
    console.log("Transaction sent. Waiting for confirmation...");
    await useTicketTx.wait();
    console.log("✅ Ticket successfully validated and marked as used!");
    
    // 4. VERIFY RECORD: Check attendance record and used status
    const hasAttended = await eventTicketing.hasAttended(eventId, ticketOwner);
    const isNowUsed = await eventTicketNFT.isTicketUsed(tokenId);
    
    console.log("\nFinal verification:");
    console.log(`Ticket used status: ${isNowUsed ? "USED" : "NOT USED"}`);
    console.log(`Attendance record: ${hasAttended ? "ATTENDED" : "NOT ATTENDED"}`);
    
    // Check loyalty points (bonus feature)
    const loyalty = await eventTicketing.getUserLoyaltyPoints(ticketOwner);
    console.log(`Attendee loyalty points: ${loyalty}`);

  } catch (error) {
    console.error("Error validating ticket:", error);
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Runtime error:", error);
    process.exit(1);
  }); 