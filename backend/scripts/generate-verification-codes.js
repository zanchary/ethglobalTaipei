/**
 * Pre-Generate Verification Codes for Offline Use
 * 
 * This script pre-generates verification codes for tickets before an event,
 * allowing event staff to verify tickets even without internet access.
 */

const { ethers } = require('hardhat');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = path.join(__dirname, '../offline-codes');
const VERIFICATION_SECRET = process.env.VERIFICATION_SECRET || '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

async function main() {
  console.log("Pre-generating offline verification codes for tickets...");
  
  // Get arguments
  const eventId = process.argv[2];
  if (!eventId) {
    console.error("Please provide an event ID as the first argument");
    console.log("Usage: node generate-verification-codes.js <eventId> [output-file]");
    return;
  }
  
  // Optional output file name
  const outputFileName = process.argv[3] || `event-${eventId}-codes.json`;
  
  // Load contract addresses from .env
  const celoTicketNFTAddress = process.env.CELO_TICKET_NFT_ADDRESS;
  if (!celoTicketNFTAddress) {
    console.error("Please set CELO_TICKET_NFT_ADDRESS in .env file");
    return;
  }
  
  // Connect to network
  console.log("Connecting to network...");
  const [deployer] = await ethers.getSigners();
  console.log(`Connected with account: ${deployer.address}`);
  
  // Load contract
  const CrossChainTicketNFT = await ethers.getContractFactory("CrossChainTicketNFT");
  const ticketNFT = CrossChainTicketNFT.attach(celoTicketNFTAddress);
  
  console.log(`Querying event ${eventId} tickets...`);
  
  // In a real scenario, we'd need to query all tickets for the event
  // This would typically involve additional event-related queries
  // For this demo, we'll simulate retrieving tickets for the event
  
  // Query total supply
  const totalSupply = await ticketNFT.totalSupply();
  console.log(`Total NFT supply: ${totalSupply}`);
  
  // Track tickets for this event
  const eventTickets = [];
  const verificationCodes = {};
  
  // Loop through all tickets and find those for this event
  console.log("Finding tickets for this event...");
  for (let i = 0; i < totalSupply; i++) {
    try {
      const tokenId = await ticketNFT.tokenByIndex(i);
      const ticketInfo = await ticketNFT.getTicketInfo(tokenId);
      
      // Check if this ticket belongs to our event
      if (ticketInfo.eventId.toString() === eventId) {
        const owner = await ticketNFT.ownerOf(tokenId);
        const used = await ticketNFT.isTicketUsed(tokenId);
        
        if (!used) {
          eventTickets.push({
            tokenId: tokenId.toString(),
            eventId: ticketInfo.eventId.toString(),
            ticketIndex: ticketInfo.ticketIndex.toString(),
            owner,
            used
          });
        }
      }
    } catch (error) {
      console.error(`Error processing token at index ${i}:`, error.message);
    }
  }
  
  console.log(`Found ${eventTickets.length} unused tickets for event ${eventId}`);
  
  // Generate verification codes for each ticket
  console.log("Generating verification codes...");
  
  for (const ticket of eventTickets) {
    try {
      // Generate the verification code as it would be done on-chain
      const verificationCode = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'address', 'uint256', 'uint256', 'address', 'bytes32'],
          [
            ticket.tokenId,
            ticket.owner,
            ticket.eventId,
            ticket.ticketIndex,
            celoTicketNFTAddress,
            VERIFICATION_SECRET
          ]
        )
      );
      
      // Add to our verification codes object
      verificationCodes[ticket.tokenId] = {
        tokenId: ticket.tokenId,
        owner: ticket.owner,
        eventId: ticket.eventId,
        ticketIndex: ticket.ticketIndex,
        verificationCode: verificationCode,
        generated: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error generating code for token ${ticket.tokenId}:`, error.message);
    }
  }
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Save to file
  const outputPath = path.join(OUTPUT_DIR, outputFileName);
  
  // Add metadata
  const output = {
    eventId,
    celoContractAddress: celoTicketNFTAddress,
    totalCodes: Object.keys(verificationCodes).length,
    generatedAt: new Date().toISOString(),
    verificationCodes
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`Verification codes saved to: ${outputPath}`);
  
  // Security reminder
  console.log("\n⚠️ IMPORTANT SECURITY NOTICE:");
  console.log("The generated file contains sensitive verification data.");
  console.log("Only distribute it to authorized event staff.");
  console.log("Each staff member should have a unique device and code file.");
  console.log("Revoke access immediately if a device is lost or compromised.");
}

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 