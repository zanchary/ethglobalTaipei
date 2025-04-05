#!/usr/bin/env node
/**
 * Offline Ticket Verifier
 * 
 * This script demonstrates how to implement offline ticket verification
 * for the CrossChainTicketNFT system. It can be used as a standalone tool
 * or adapted into a mobile application for event staff.
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const qrcode = require('qrcode-terminal');

// Configuration - would be loaded from a secure config file in production
const CONFIG = {
  // The secret verification key - this would be securely stored and not hard-coded in production
  verificationSecret: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  
  // Contract addresses - would be loaded from config or .env
  celoContractAddress: '0x0000000000000000000000000000000000000000', // Replace with actual address
  worldChainContractAddress: '0x0000000000000000000000000000000000000000', // Replace with actual address
  
  // Chain information
  celoChainId: 'celo',
  
  // Local database for storing verified tickets during offline mode
  dbPath: path.join(__dirname, '../offline-verified-tickets.json'),
  
  // ABI fragments needed for offline verification
  contractAbi: [
    'function generateOfflineVerificationCode(uint256 tokenId) view returns (bytes32)',
    'function verifyOfflineCode(uint256 tokenId, address owner, uint256 eventId, uint256 ticketIndex, bytes32 verificationCode, bytes32 secret) pure returns (bool)',
    'function getTicketInfo(uint256 tokenId) view returns (tuple(uint256 eventId, uint256 ticketIndex, uint256 purchasePrice, uint256 purchaseTime, string ticketURI))',
    'function ownerOf(uint256 tokenId) view returns (address)',
    'function isTicketUsed(uint256 tokenId) view returns (bool)'
  ]
};

// Maintains state during offline mode
let offlineVerifiedTickets = {};
let lastSyncTime = null;

/**
 * Initialize the verification system
 */
async function initialize() {
  console.log("🎫 Initializing Offline Ticket Verifier 🎫");
  
  // Load previously verified tickets if they exist
  if (fs.existsSync(CONFIG.dbPath)) {
    try {
      const data = fs.readFileSync(CONFIG.dbPath, 'utf8');
      const parsed = JSON.parse(data);
      offlineVerifiedTickets = parsed.tickets || {};
      lastSyncTime = parsed.lastSync || null;
      
      console.log(`Loaded ${Object.keys(offlineVerifiedTickets).length} previously verified tickets`);
      if (lastSyncTime) {
        console.log(`Last synced: ${new Date(lastSyncTime).toLocaleString()}`);
      }
    } catch (err) {
      console.error("Error loading offline database:", err.message);
      // Initialize empty database
      offlineVerifiedTickets = {};
      lastSyncTime = null;
    }
  } else {
    console.log("No previous verification database found. Starting fresh.");
  }
  
  // Create interactive CLI
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  // Main menu
  async function showMenu() {
    console.log("\n🎫 Offline Ticket Verifier 🎫");
    console.log("---------------------------");
    console.log("1. Scan Ticket QR Code");
    console.log("2. Manual Ticket Verification");
    console.log("3. View Verified Tickets");
    console.log("4. Sync Verified Tickets (requires internet)");
    console.log("5. Load Pre-generated Verification Codes");
    console.log("6. Generate Sample QR Code (for testing)");
    console.log("7. Exit");
    
    rl.question("Select an option: ", async (option) => {
      switch (option) {
        case "1":
          await scanQRCode(rl);
          break;
        case "2":
          await manualVerification(rl);
          break;
        case "3":
          viewVerifiedTickets();
          showMenu();
          break;
        case "4":
          await syncVerifiedTickets(rl);
          break;
        case "5":
          await loadVerificationCodes(rl);
          break;
        case "6":
          await generateSampleQR(rl);
          break;
        case "7":
          console.log("Goodbye! Thanks for using the Offline Ticket Verifier.");
          rl.close();
          return;
        default:
          console.log("Invalid option. Please try again.");
          showMenu();
      }
    });
  }
  
  // Start the application
  showMenu();
}

/**
 * Scan a QR code (simulated in this CLI version)
 */
async function scanQRCode(rl) {
  console.log("\n📱 Scan Ticket QR Code");
  console.log("--------------------");
  console.log("In a real application, this would activate the camera to scan a QR code.");
  console.log("For this demo, please enter the QR code data (or a sample code):");
  
  rl.question("QR code data: ", async (qrData) => {
    try {
      await processQRCode(qrData);
    } catch (error) {
      console.error("Error processing QR code:", error.message);
    }
    
    rl.question("\nPress Enter to continue...", () => {
      showMenu();
    });
  });
}

/**
 * Process QR code data for verification
 */
async function processQRCode(qrData) {
  try {
    // Parse the QR code data
    let decoded;
    try {
      // Handle base64 encoded data
      if (qrData.match(/^[A-Za-z0-9+/=]+$/)) {
        const buffer = Buffer.from(qrData, 'base64');
        decoded = ethers.utils.defaultAbiCoder.decode(
          ['uint256', 'uint256', 'uint256', 'string', 'address', 'address', 'address', 'uint256', 'bytes32'],
          buffer
        );
      } else {
        // Try parsing as hex
        decoded = ethers.utils.defaultAbiCoder.decode(
          ['uint256', 'uint256', 'uint256', 'string', 'address', 'address', 'address', 'uint256', 'bytes32'],
          qrData
        );
      }
    } catch (error) {
      throw new Error("Invalid QR code format: " + error.message);
    }
    
    // Extract data from decoded QR code
    const [
      tokenId,
      eventId,
      ticketIndex,
      chainId,
      contractAddress,
      worldContractAddress,
      ticketOwner,
      timestamp,
      checksum
    ] = decoded;
    
    console.log("\nTicket Information:");
    console.log("------------------");
    console.log(`Token ID: ${tokenId}`);
    console.log(`Event ID: ${eventId}`);
    console.log(`Ticket Index: ${ticketIndex}`);
    console.log(`Chain: ${chainId}`);
    console.log(`Owner: ${ticketOwner}`);
    console.log(`Timestamp: ${new Date(timestamp.toNumber() * 1000).toLocaleString()}`);
    
    // Verify the checksum
    const calculatedChecksum = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'address', 'uint256', 'uint256', 'address', 'address', 'string', 'uint256'],
        [tokenId, ticketOwner, eventId, ticketIndex, contractAddress, worldContractAddress, chainId, timestamp]
      )
    );
    
    if (calculatedChecksum !== checksum) {
      console.log("❌ INVALID TICKET: Checksum verification failed");
      return false;
    }
    
    // Check if ticket is already verified
    const ticketKey = tokenId.toString();
    if (offlineVerifiedTickets[ticketKey]) {
      console.log("❌ TICKET ALREADY USED");
      console.log(`Verified on: ${new Date(offlineVerifiedTickets[ticketKey].timestamp).toLocaleString()}`);
      return false;
    }
    
    // Validate timestamp (not too old)
    const currentTime = Math.floor(Date.now() / 1000);
    const timestampValue = timestamp.toNumber();
    const maxAge = 24 * 60 * 60; // 24 hours
    
    if (currentTime - timestampValue > maxAge) {
      console.log("⚠️ WARNING: QR code is more than 24 hours old");
      // In a real app, you might want additional verification for old QR codes
    }
    
    // In offline mode, we can perform cryptographic verification with our local secret
    // This simulates what would happen if we called verifyOfflineCode
    const verificationCode = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'address', 'uint256', 'uint256', 'address', 'bytes32'],
        [tokenId, ticketOwner, eventId, ticketIndex, contractAddress, CONFIG.verificationSecret]
      )
    );
    
    // Generate verification hash for later syncing
    const verificationHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'bytes32', 'uint256'],
        [tokenId, verificationCode, currentTime]
      )
    );
    
    console.log("\n✅ TICKET VERIFIED SUCCESSFULLY");
    
    // Store ticket in local verified database with timestamp
    offlineVerifiedTickets[ticketKey] = {
      tokenId: tokenId.toString(),
      eventId: eventId.toString(),
      ticketIndex: ticketIndex.toString(),
      owner: ticketOwner,
      timestamp: Date.now(),
      verificationHash: verificationHash
    };
    
    // Save verified tickets database
    saveVerifiedTickets();
    
    return true;
  } catch (error) {
    console.log("❌ ERROR VERIFYING TICKET:", error.message);
    return false;
  }
}

/**
 * Manual ticket verification
 */
async function manualVerification(rl) {
  console.log("\n🔢 Manual Ticket Verification");
  console.log("---------------------------");
  
  // Gather ticket information
  rl.question("Token ID: ", (tokenId) => {
    rl.question("Event ID: ", (eventId) => {
      rl.question("Ticket Index: ", (ticketIndex) => {
        rl.question("Owner Address: ", (owner) => {
          try {
            // Generate verification hash
            const currentTime = Math.floor(Date.now() / 1000);
            const ticketKey = tokenId.toString();
            
            // Check if already verified
            if (offlineVerifiedTickets[ticketKey]) {
              console.log("\n❌ TICKET ALREADY USED");
              console.log(`Verified on: ${new Date(offlineVerifiedTickets[ticketKey].timestamp).toLocaleString()}`);
              
              rl.question("\nPress Enter to continue...", () => {
                showMenu();
              });
              return;
            }
            
            // In offline mode, perform local verification with our secret
            const verificationCode = ethers.utils.keccak256(
              ethers.utils.defaultAbiCoder.encode(
                ['uint256', 'address', 'uint256', 'uint256', 'address', 'bytes32'],
                [tokenId, owner, eventId, ticketIndex, CONFIG.celoContractAddress, CONFIG.verificationSecret]
              )
            );
            
            const verificationHash = ethers.utils.keccak256(
              ethers.utils.defaultAbiCoder.encode(
                ['uint256', 'bytes32', 'uint256'],
                [tokenId, verificationCode, currentTime]
              )
            );
            
            console.log("\n✅ TICKET VERIFIED MANUALLY");
            
            // Store in verified tickets database
            offlineVerifiedTickets[ticketKey] = {
              tokenId: tokenId,
              eventId: eventId,
              ticketIndex: ticketIndex,
              owner: owner,
              timestamp: Date.now(),
              verificationHash: verificationHash,
              manual: true
            };
            
            // Save database
            saveVerifiedTickets();
            
            rl.question("\nPress Enter to continue...", () => {
              showMenu();
            });
          } catch (error) {
            console.log("\n❌ VERIFICATION ERROR:", error.message);
            rl.question("\nPress Enter to continue...", () => {
              showMenu();
            });
          }
        });
      });
    });
  });
}

/**
 * View list of locally verified tickets
 */
function viewVerifiedTickets() {
  console.log("\n📋 Verified Tickets");
  console.log("------------------");
  
  const ticketIds = Object.keys(offlineVerifiedTickets);
  if (ticketIds.length === 0) {
    console.log("No tickets have been verified yet.");
    return;
  }
  
  console.log(`Total verified tickets: ${ticketIds.length}`);
  console.log("Recent verifications:");
  
  // Sort by timestamp, most recent first
  const sortedTickets = ticketIds
    .map(id => offlineVerifiedTickets[id])
    .sort((a, b) => b.timestamp - a.timestamp);
  
  // Show 10 most recent
  sortedTickets.slice(0, 10).forEach((ticket, index) => {
    console.log(`${index + 1}. Token ID: ${ticket.tokenId} - Event: ${ticket.eventId} - Verified: ${new Date(ticket.timestamp).toLocaleString()}`);
  });
  
  // Count tickets by event
  const eventCounts = {};
  sortedTickets.forEach(ticket => {
    const eventId = ticket.eventId;
    eventCounts[eventId] = (eventCounts[eventId] || 0) + 1;
  });
  
  console.log("\nVerified tickets by event:");
  Object.entries(eventCounts).forEach(([eventId, count]) => {
    console.log(`Event ID ${eventId}: ${count} tickets`);
  });
}

/**
 * Sync verified tickets to the blockchain
 */
async function syncVerifiedTickets(rl) {
  console.log("\n🔄 Sync Verified Tickets");
  console.log("----------------------");
  console.log("This would connect to the blockchain and submit all offline verifications.");
  console.log("For this demo, we'll just simulate the sync process.");
  
  const ticketIds = Object.keys(offlineVerifiedTickets);
  if (ticketIds.length === 0) {
    console.log("No tickets to sync.");
    rl.question("\nPress Enter to continue...", () => {
      showMenu();
    });
    return;
  }
  
  // Gather tickets that haven't been synced yet
  let unsynced = ticketIds
    .map(id => offlineVerifiedTickets[id])
    .filter(ticket => !ticket.synced);
  
  console.log(`Found ${unsynced.length} unsynced verifications.`);
  
  if (unsynced.length === 0) {
    console.log("All tickets are already synced.");
    rl.question("\nPress Enter to continue...", () => {
      showMenu();
    });
    return;
  }
  
  // Simulate syncing process
  console.log("Syncing tickets to blockchain...");
  
  // Prepare data for syncOfflineVerifications function
  const tokenIds = unsynced.map(t => t.tokenId);
  const verificationHashes = unsynced.map(t => t.verificationHash);
  const timestamp = Math.floor(Date.now() / 1000);
  
  // In a real app, we would:
  // 1. Connect to a provider
  // 2. Load the contract
  // 3. Sign the transaction
  // 4. Submit to blockchain
  
  console.log("Data to submit:");
  console.log(`Token IDs: ${tokenIds.join(", ")}`);
  console.log(`Verification Hashes: ${verificationHashes.slice(0, 2).join(", ")}... (${verificationHashes.length} total)`);
  console.log(`Timestamp: ${timestamp}`);
  
  // Simulate successful sync
  unsynced.forEach(ticket => {
    offlineVerifiedTickets[ticket.tokenId].synced = true;
    offlineVerifiedTickets[ticket.tokenId].syncedAt = Date.now();
  });
  
  lastSyncTime = Date.now();
  saveVerifiedTickets();
  
  console.log("\n✅ Successfully synced all verifications!");
  rl.question("\nPress Enter to continue...", () => {
    showMenu();
  });
}

/**
 * Load pre-generated verification codes
 */
async function loadVerificationCodes(rl) {
  console.log("\n📂 Load Pre-generated Verification Codes");
  console.log("--------------------------------------");
  console.log("In a real app, staff would download verification codes before going offline.");
  console.log("This would allow verification of specific tickets without internet access.");
  
  rl.question("Path to verification codes file: ", (filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        console.log("File not found. Please provide a valid path.");
        rl.question("\nPress Enter to continue...", () => {
          showMenu();
        });
        return;
      }
      
      const data = fs.readFileSync(filePath, 'utf8');
      const codes = JSON.parse(data);
      
      console.log(`Loaded ${Object.keys(codes).length} verification codes.`);
      
      // In a real app, we'd store these securely for offline use
      console.log("Verification codes loaded successfully!");
      
      rl.question("\nPress Enter to continue...", () => {
        showMenu();
      });
    } catch (error) {
      console.log("Error loading verification codes:", error.message);
      rl.question("\nPress Enter to continue...", () => {
        showMenu();
      });
    }
  });
}

/**
 * Generate a sample QR code for testing
 */
async function generateSampleQR(rl) {
  console.log("\n🔄 Generate Sample QR Code");
  console.log("------------------------");
  
  // Create sample ticket data
  const sampleData = {
    tokenId: "123",
    eventId: "456",
    ticketIndex: "7",
    chainId: CONFIG.celoChainId,
    contractAddress: CONFIG.celoContractAddress,
    worldContractAddress: CONFIG.worldChainContractAddress,
    ticketOwner: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", // Random address
    timestamp: Math.floor(Date.now() / 1000)
  };
  
  // Calculate checksum
  const checksum = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'address', 'uint256', 'uint256', 'address', 'address', 'string', 'uint256'],
      [
        sampleData.tokenId,
        sampleData.ticketOwner,
        sampleData.eventId,
        sampleData.ticketIndex,
        sampleData.contractAddress,
        sampleData.worldContractAddress,
        sampleData.chainId,
        sampleData.timestamp
      ]
    )
  );
  
  // Encode the data
  const encoded = ethers.utils.defaultAbiCoder.encode(
    ['uint256', 'uint256', 'uint256', 'string', 'address', 'address', 'address', 'uint256', 'bytes32'],
    [
      sampleData.tokenId,
      sampleData.eventId,
      sampleData.ticketIndex,
      sampleData.chainId,
      sampleData.contractAddress,
      sampleData.worldContractAddress,
      sampleData.ticketOwner,
      sampleData.timestamp,
      checksum
    ]
  );
  
  // Convert to base64 for smaller QR code
  const base64Data = Buffer.from(encoded.slice(2), 'hex').toString('base64');
  
  console.log("Sample Ticket Data:");
  console.log(JSON.stringify(sampleData, null, 2));
  console.log("\nBase64 Encoded QR Data:");
  console.log(base64Data);
  
  console.log("\nQR Code:");
  qrcode.generate(base64Data, {small: true});
  
  console.log("\nScan this QR code with the verification function to test the system.");
  
  rl.question("\nPress Enter to continue...", () => {
    showMenu();
  });
}

/**
 * Save verified tickets to local storage
 */
function saveVerifiedTickets() {
  try {
    const data = {
      tickets: offlineVerifiedTickets,
      lastSync: lastSyncTime,
      updatedAt: Date.now()
    };
    
    fs.writeFileSync(CONFIG.dbPath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error saving verified tickets:", error.message);
  }
}

// Start the application
initialize().catch(console.error); 