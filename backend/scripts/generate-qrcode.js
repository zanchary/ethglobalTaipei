const { ethers } = require("hardhat");
require('dotenv').config();
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("Starting QR code generation script...");

  // Load contract addresses from .env file or use defaults
  const eventTicketingAddress = process.env.EVENT_TICKETING_ADDRESS;
  const eventTicketNFTAddress = process.env.EVENT_TICKET_NFT_ADDRESS;

  if (!eventTicketingAddress || !eventTicketNFTAddress) {
    console.error("Missing contract addresses. Please set EVENT_TICKETING_ADDRESS and EVENT_TICKET_NFT_ADDRESS in your .env file");
    return;
  }

  // Get account to connect with
  const [deployer, organizer, attendee1] = await ethers.getSigners();
  console.log("Connected with account:", deployer.address);

  // Get contract instances
  const EventTicketing = await ethers.getContractFactory("EventTicketing");
  const eventTicketing = EventTicketing.attach(eventTicketingAddress);

  const EventTicketNFT = await ethers.getContractFactory("EventTicketNFT");
  const eventTicketNFT = EventTicketNFT.attach(eventTicketNFTAddress);

  // Get ticket ID from command line or use default
  const tokenId = process.argv[2] ? Number(process.argv[2]) : 1;
  console.log(`Generating QR code for ticket ID: ${tokenId}`);

  try {
    // First verify that the ticket exists and get its info
    const ticketOwner = await eventTicketNFT.ownerOf(tokenId);
    console.log(`Ticket owner: ${ticketOwner}`);

    // Get ticket info
    const ticketInfo = await eventTicketNFT.getTicketInfo(tokenId);
    console.log(`Ticket info:`, {
      eventId: ticketInfo.eventId.toString(),
      ticketIndex: ticketInfo.ticketIndex.toString(),
      purchasePrice: ethers.formatEther(ticketInfo.purchasePrice),
      isUsed: await eventTicketNFT.isTicketUsed(tokenId)
    });

    // Generate QR code data from the contract
    console.log("Generating QR code data from contract...");
    const qrData = await eventTicketing.generateQRCodeData(tokenId);
    console.log("QR code data generated (hex):", qrData);

    // Convert the QR data to base64 format for QR code generation
    const qrDataBase64 = Buffer.from(qrData.slice(2), 'hex').toString('base64');
    console.log("QR code data (base64):", qrDataBase64);

    // Save QR code data to file
    const qrDataDir = path.join(__dirname, '../qr-codes');
    if (!fs.existsSync(qrDataDir)) {
      fs.mkdirSync(qrDataDir, { recursive: true });
    }

    // Generate QR code image
    const qrCodePath = path.join(qrDataDir, `ticket-${tokenId}.png`);
    await QRCode.toFile(qrCodePath, qrDataBase64);
    console.log(`QR code image saved to: ${qrCodePath}`);

    // Also save the raw data for easy access
    const qrDataPath = path.join(qrDataDir, `ticket-${tokenId}-data.txt`);
    fs.writeFileSync(qrDataPath, qrDataBase64);
    console.log(`QR code data saved to: ${qrDataPath}`);

    // Now let's verify the QR code to demonstrate the full workflow
    console.log("\nVerifying QR code data...");
    const maxAgeSeconds = 3600; // Set max age to 1 hour for testing
    const verifyResult = await eventTicketing.verifyQRCode(qrData, maxAgeSeconds);
    
    console.log("Verification result:", {
      isValid: verifyResult[0],
      tokenId: verifyResult[1].toString(),
      eventId: verifyResult[2].toString(),
      owner: verifyResult[3]
    });

    console.log("\nIn a real-world scenario:");
    console.log("1. Attendee shows the QR code");
    console.log("2. Event organizer scans it with an app");
    console.log("3. App calls verifyQRCode() to validate the ticket");
    console.log("4. If valid, organizer calls useTicket() to mark attendance");
    
    // Get event details to display more info
    try {
      const eventDetails = await eventTicketing.getEventDetails(ticketInfo.eventId);
      console.log("\nEvent details:");
      console.log({
        name: eventDetails[0],
        description: eventDetails[1],
        date: new Date(Number(eventDetails[2]) * 1000).toISOString(),
        organizer: eventDetails[6]
      });
    } catch (error) {
      console.log("Couldn't get event details:", error.message);
    }

  } catch (error) {
    console.error("Error generating QR code:", error);
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Runtime error:", error);
    process.exit(1);
  }); 