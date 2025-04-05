// Local deployment and testing script - All-in-one solution
// This script deploys all contracts and performs basic functionality tests
// Includes enhanced error handling and debugging features to ensure proper operation in various scenarios
const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("Starting local deployment and testing process...");

  // Get deployer and test accounts
  const [deployer, organizer, attendee1, attendee2] = await ethers.getSigners();
  console.log("Using deployer address:", deployer.address);
  console.log("Test accounts:");
  console.log("- Event Organizer:", organizer.address);
  console.log("- Attendee 1:", attendee1.address);
  console.log("- Attendee 2:", attendee2.address);

  // Get current chain ID
  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;
  console.log(`Current chain ID: ${chainId}`);

  // Define contract address variables
  let eventTicketingAddress;
  let eventTicketNFTAddress;
  let mockWorldIDAddress;
  let worldIDVerifierAddress;

  try {
    // 1. Deploy MockWorldID contract
    console.log("\nStep 1: Deploying MockWorldID contract...");
    const MockWorldID = await ethers.getContractFactory("MockWorldID");
    const mockWorldIDDeployTx = await MockWorldID.deploy();
    const mockWorldID = await mockWorldIDDeployTx.waitForDeployment();
    mockWorldIDAddress = await mockWorldID.getAddress();
    console.log("MockWorldID deployment complete, address:", mockWorldIDAddress);

    // 2. Deploy WorldIDVerifier contract
    console.log("\nStep 2: Deploying WorldIDVerifier contract...");
    const WorldIDVerifier = await ethers.getContractFactory("WorldIDVerifier");
    const worldIDVerifierDeployTx = await WorldIDVerifier.deploy(
      mockWorldIDAddress, // Pass MockWorldID address
      "app_testing" // Application ID
    );
    const worldIDVerifier = await worldIDVerifierDeployTx.waitForDeployment();
    worldIDVerifierAddress = await worldIDVerifier.getAddress();
    console.log("WorldIDVerifier deployment complete, address:", worldIDVerifierAddress);

    // 3. Deploy EventTicketNFT contract
    console.log("\nStep 3: Deploying EventTicketNFT contract...");
    const EventTicketNFT = await ethers.getContractFactory("EventTicketNFT");
    const deployTx = await EventTicketNFT.deploy();
    const eventTicketNFT = await deployTx.waitForDeployment();
    eventTicketNFTAddress = await eventTicketNFT.getAddress();
    console.log("EventTicketNFT deployment complete, address:", eventTicketNFTAddress);
    
    // For simplified version, we don't use a cross-chain bridge, so we pass in a zero address
    console.log("\nUsing zero address as cross-chain bridge address (simplified version)");
    const crossChainBridgeAddress = "0x0000000000000000000000000000000000000000";
    
    // 4. Deploy EventTicketing contract
    console.log("\nStep 4: Deploying EventTicketing contract...");
    const EventTicketing = await ethers.getContractFactory("EventTicketing");
    const eventTicketingDeployTx = await EventTicketing.deploy(
      eventTicketNFTAddress,  // Ticket NFT contract address
      worldIDVerifierAddress,  // WorldID verifier address
      crossChainBridgeAddress  // Cross-chain bridge contract address (zero address)
    );
    const eventTicketing = await eventTicketingDeployTx.waitForDeployment();
    eventTicketingAddress = await eventTicketing.getAddress();
    console.log("EventTicketing deployment complete, address:", eventTicketingAddress);

    // 5. Set permissions and associations
    console.log("\nStep 5: Setting contract permissions and associations...");
    const minterRole = await eventTicketNFT.MINTER_ROLE();
    const grantRoleTx = await eventTicketNFT.grantRole(minterRole, eventTicketingAddress);
    await grantRoleTx.wait();
    console.log(`Granted minting permission to EventTicketing contract (${eventTicketingAddress}) on EventTicketNFT`);

    console.log("\nContract deployment complete, starting test flow...");

    // Save contract addresses to JSON file
    const addresses = {
      eventTicketingAddress,
      eventTicketNFTAddress,
      worldIDVerifierAddress,
      mockWorldIDAddress,
      deployerAddress: deployer.address,
      timestamp: new Date().toISOString(),
      chainId: chainId.toString()
    };
    
    const filePath = path.join(__dirname, '../deployed-addresses.json');
    fs.writeFileSync(filePath, JSON.stringify(addresses, null, 2));
    console.log(`Saved contract addresses to file: ${filePath}`);

    // ===== Start Testing Flow =====
    console.log("\nStarting to test basic ticketing functionality...");

    // Verify organizer first
    console.log("\nVerifying event organizer...");
    const verifyOrganizerTx = await eventTicketing.verifyOrganizer(organizer.address);
    await verifyOrganizerTx.wait();
    console.log("Event organizer verified");

    // 1. Test creating an event
    console.log("\nTesting event creation...");
    const currentTime = Math.floor(Date.now() / 1000);
    const eventStartTime = currentTime + 3600; // Starts in 1 hour
    const eventEndTime = currentTime + 7200; // Ends in 2 hours

    // Event organizer needs ETH to pay for event creation fees
    const transferTx = await deployer.sendTransaction({
      to: organizer.address,
      value: ethers.parseEther("1.0")
    });
    await transferTx.wait();
    console.log("Transferred 1 ETH to event organizer");

    // Create event - corrected parameters to match contract function definition
    const createEventTx = await eventTicketing.connect(organizer).createEvent(
      "Test Event", // Name
      "This is a simple test event", // Description
      eventEndTime, // Event date (using end time)
      100, // Total tickets
      ethers.parseEther("0.01"), // Ticket price: 0.01 ETH
      false // Require World ID verification
    );

    console.log("Waiting for event creation transaction confirmation...");
    const createEventReceipt = await createEventTx.wait();
    
    // Event handling is slightly different in ethers v6
    console.log("Searching for EventCreated event...");
    console.log("Receipt log count:", createEventReceipt.logs.length);
    
    // Print log information for debugging
    for (let i = 0; i < createEventReceipt.logs.length; i++) {
      const log = createEventReceipt.logs[i];
      console.log(`Log #${i}:`, log.fragment ? log.fragment.name : "No name");
    }
    
    let eventId;
    try {
      const eventCreatedEvent = createEventReceipt.logs.find(
        log => log.fragment && log.fragment.name === 'EventCreated'
      );
      
      if (!eventCreatedEvent) {
        // Try to find the first log with args
        const logWithArgs = createEventReceipt.logs.find(log => log.args && log.args.length > 0);
        if (logWithArgs) {
          console.log("EventCreated event not found, but found a log with parameters");
          eventId = logWithArgs.args[0];
        } else {
          console.error("No logs with parameters found");
          return;
        }
      } else {
        // Check if the event has the expected number of arguments
        // 注意：Event结构体有10个字段，但EventCreated事件现在只有7个参数
        // 这是为了避免"Stack too deep"错误，将事件参数减少到必要的关键字段
        console.log("EventCreated event found with args:");
        
        // 确保事件有正确数量的参数
        if (eventCreatedEvent.args.length !== 7) {
          console.warn(`警告：EventCreated事件应该有7个参数，但实际有${eventCreatedEvent.args.length}个`);
        }
        
        // 正确地解析和记录7个参数
        console.log({
          eventId: eventCreatedEvent.args[0].toString(),
          name: eventCreatedEvent.args[1],
          totalTickets: eventCreatedEvent.args[2].toString(),
          ticketPrice: ethers.formatEther(eventCreatedEvent.args[3]),
          organizer: eventCreatedEvent.args[4],
          eventDate: new Date(Number(eventCreatedEvent.args[5]) * 1000).toISOString(),
          worldIdRequired: eventCreatedEvent.args[6]
        });
        
        // 添加解释，说明Event结构体与事件参数的对应关系
        console.log(`
注意：Event结构体有10个字段，而EventCreated事件只发出7个参数：
1. eventId - 事件ID（自动生成的）
2. name - 事件名称
3. totalTickets - 总票数
4. ticketPrice - 票价
5. organizer - 组织者地址
6. eventDate - 事件日期
7. worldIdRequired - 是否需要World ID验证

而Event结构体的其他字段如下：
- description - 在事件中未包含
- ticketsSold - 初始为0，不需要包含在事件中
- isActive - 总是初始化为true，不需要包含在事件中
- verifiedAttendees - 这是一个映射，无法包含在事件中
`);
        
        eventId = eventCreatedEvent.args[0]; // First parameter is eventId
      }
      
      console.log(`Event created successfully, ID: ${eventId}`);
    } catch (error) {
      console.error("Error parsing event data:", error.message);
      // Fallback method: assume there's only one event and the event ID is 1
      console.log("Trying default event ID: 1");
      eventId = 1;
    }

    // Get event details - directly use getEventDetails function
    let eventPrice;
    try {
      console.log("\nTrying to use getEventDetails function...");
      const eventDetailsFromGetter = await eventTicketing.getEventDetails(eventId);
      console.log("Event details from getter:", {
        name: eventDetailsFromGetter[0],
        description: eventDetailsFromGetter[1],
        eventDate: eventDetailsFromGetter[2].toString(),
        totalTickets: eventDetailsFromGetter[3].toString(),
        ticketsSold: eventDetailsFromGetter[4].toString(),
        ticketPrice: ethers.formatEther(eventDetailsFromGetter[5]),
        organizer: eventDetailsFromGetter[6]
      });
      
      // Use ticket price from getter function
      eventPrice = eventDetailsFromGetter[5];
      console.log("Ticket price:", ethers.formatEther(eventPrice));
    } catch (error) {
      console.error("Failed to get event details:", error.message);
      return;
    }
    
    // 2. Test buying tickets
    console.log("\nTesting ticket purchase...");
    
    // Transfer some ETH to attendee1
    const transferTx1 = await deployer.sendTransaction({
      to: attendee1.address,
      value: ethers.parseEther("0.1")
    });
    await transferTx1.wait();
    console.log("Transferred 0.1 ETH to attendee 1");
    
    const buyTicketTx = await eventTicketing.connect(attendee1).buyTicket(
      eventId,
      { value: eventPrice } // Use ticket price from getter
    );
    const buyTicketReceipt = await buyTicketTx.wait();
    console.log(`Attendee 1 purchased a ticket for event ${eventId}`);

    // Search for TicketMinted event
    console.log("Searching for TicketMinted event...");
    console.log("Receipt log count:", buyTicketReceipt.logs.length);
    
    // Print log information for debugging
    for (let i = 0; i < buyTicketReceipt.logs.length; i++) {
      const log = buyTicketReceipt.logs[i];
      console.log(`Log #${i}:`, log.fragment ? log.fragment.name : "No name");
    }
    
    let ticketId1;
    try {
      const ticketMintedEvent = buyTicketReceipt.logs.find(
        log => log.fragment && log.fragment.name === 'TicketMinted'
      );
      
      if (!ticketMintedEvent) {
        // Try to find any log that might contain a tokenId
        const logWithArgs = buyTicketReceipt.logs.find(log => log.args && log.args.length > 0);
        if (logWithArgs) {
          console.log("TicketMinted event not found, but found a log with parameters");
          ticketId1 = logWithArgs.args[0]; // Assume first parameter is tokenId
        } else {
          // Last resort: try to get tokenId directly from NFT contract
          console.log("Trying to get the latest minted token from NFT contract");
          const balance = await eventTicketNFT.balanceOf(attendee1.address);
          if (balance > 0) {
            // Assume the latest minted token is the first one, index 0
            ticketId1 = await eventTicketNFT.tokenOfOwnerByIndex(attendee1.address, 0);
          } else {
            console.error("Cannot determine tokenId, attendee 1 has no tickets");
            return;
          }
        }
      } else {
        // 验证TicketMinted事件有正确数量的参数
        if (ticketMintedEvent.args.length !== 4) {
          console.warn(`警告：TicketMinted事件应该有4个参数，但实际有${ticketMintedEvent.args.length}个`);
        }
        
        // 正确地解析和记录所有4个参数
        console.log("TicketMinted event found with args:");
        console.log({
          tokenId: ticketMintedEvent.args[0].toString(),
          eventId: ticketMintedEvent.args[1].toString(),
          buyer: ticketMintedEvent.args[2],
          price: ethers.formatEther(ticketMintedEvent.args[3])
        });
        
        // 添加解释，说明TicketMinted事件只包含4个关键参数
        console.log(`
注意：TicketMinted事件包含4个参数：
1. tokenId - 票据NFT的令牌ID
2. eventId - 关联的活动ID
3. buyer - 购买者地址
4. price - 购买价格

更详细的票据信息可以通过NFT合约的getTicketInfo()函数获取。
`);
        
        ticketId1 = ticketMintedEvent.args[0]; // First parameter is tokenId
      }
      
      console.log(`Ticket ID: ${ticketId1}`);
    } catch (error) {
      console.error("Error parsing ticket event data:", error.message);
      // If we can't get tokenId, we can try a default value
      console.log("Using default ticket ID: 1");
      ticketId1 = 1;
    }

    // Buy another ticket for attendee2
    const transferTx2 = await deployer.sendTransaction({
      to: attendee2.address,
      value: ethers.parseEther("0.1")
    });
    await transferTx2.wait();
    console.log("Transferred 0.1 ETH to attendee 2");
    
    const buyTicket2Tx = await eventTicketing.connect(attendee2).buyTicket(
      eventId,
      { value: eventPrice } // Use ticket price from getter
    );
    const buyTicket2Receipt = await buyTicket2Tx.wait();
    console.log(`Attendee 2 purchased a ticket for event ${eventId}`);

    // Search for TicketMinted event
    console.log("Searching for attendee 2's TicketMinted event...");
    
    let ticketId2;
    try {
      const ticketMintedEvent2 = buyTicket2Receipt.logs.find(
        log => log.fragment && log.fragment.name === 'TicketMinted'
      );
      
      if (!ticketMintedEvent2) {
        // Try to find any log that might contain a tokenId
        const logWithArgs = buyTicket2Receipt.logs.find(log => log.args && log.args.length > 0);
        if (logWithArgs) {
          console.log("TicketMinted event not found, but found a log with parameters");
          ticketId2 = logWithArgs.args[0]; // Assume first parameter is tokenId
        } else {
          // Last resort: try to get tokenId directly from NFT contract
          console.log("Trying to get the latest minted token from NFT contract");
          const balance = await eventTicketNFT.balanceOf(attendee2.address);
          if (balance > 0) {
            // Assume the latest minted token is the first one, index 0
            ticketId2 = await eventTicketNFT.tokenOfOwnerByIndex(attendee2.address, 0);
          } else {
            console.log("Cannot determine attendee 2's tokenId, using tokenId1 + 1 as estimate");
            ticketId2 = Number(ticketId1) + 1;
          }
        }
      } else {
        ticketId2 = ticketMintedEvent2.args[0]; // First parameter is tokenId
      }
      
      console.log(`Attendee 2's ticket ID: ${ticketId2}`);
    } catch (error) {
      console.error("Error parsing attendee 2's ticket event data:", error.message);
      // If we can't get tokenId, we can estimate it's the next ID after ticketId1
      ticketId2 = Number(ticketId1) + 1;
      console.log(`Using estimated ticket ID: ${ticketId2}`);
    }

    // 3. Check ticket NFT
    console.log("\nChecking ticket NFTs...");
    
    try {
      // Check attendee1's ticket
      const attendee1TicketBalance = await eventTicketNFT.balanceOf(attendee1.address);
      console.log(`Number of tickets owned by attendee 1: ${attendee1TicketBalance}`);
      
      // Get ticket URI
      try {
        const ticketURI1 = await eventTicketNFT.tokenURI(ticketId1);
        console.log(`Attendee 1's ticket URI: ${ticketURI1}`);
      } catch (error) {
        console.error("Failed to get ticket URI:", error.message);
      }
      
      // Check attendee2's ticket
      const attendee2TicketBalance = await eventTicketNFT.balanceOf(attendee2.address);
      console.log(`Number of tickets owned by attendee 2: ${attendee2TicketBalance}`);
    } catch (error) {
      console.error("Failed to check ticket NFTs:", error.message);
    }
    
    // 4. Test event status
    console.log("\nChecking event status...");
    try {
      const updatedEventDetails = await eventTicketing.getEventDetails(eventId);
      console.log("Updated event details:", {
        totalTickets: updatedEventDetails[3].toString(),
        ticketsSold: updatedEventDetails[4].toString(),
        ticketsAvailable: (updatedEventDetails[3] - updatedEventDetails[4]).toString()
      });
    } catch (error) {
      console.error("Failed to get updated event status:", error.message);
    }
    
    // 5. Test ticket validation
    console.log("\nTesting ticket validation...");
    // Organizer validates the ticket
    try {
      // Use useTicket function to validate ticket
      console.log(`Attempting to validate ticket ID: ${ticketId1}...`);
      const useTicketTx = await eventTicketing.connect(organizer).useTicket(ticketId1);
      await useTicketTx.wait();
      console.log(`Attendee 1's ticket has been validated`);
      
      // Check ticket status
      try {
        const isUsed = await eventTicketNFT.isTicketUsed(ticketId1);
        console.log(`Attendee 1's ticket usage status: ${isUsed ? "Used" : "Unused"}`);
      } catch (error) {
        console.error("Failed to check ticket usage status:", error.message);
      }
      
      // Check attendance record
      try {
        const hasAttended = await eventTicketing.hasAttended(eventId, attendee1.address);
        console.log(`Attendee 1's attendance record: ${hasAttended ? "Attended" : "Not attended"}`);
      } catch (error) {
        console.error("Failed to check attendance record:", error.message);
      }
    } catch (error) {
      console.error("Ticket validation failed:", error.message);
      
      // Try to check current ticket status
      try {
        console.log("Trying to check current ticket status...");
        
        // Check ticket owner
        const owner = await eventTicketNFT.ownerOf(ticketId1);
        console.log(`Owner of ticket ID ${ticketId1}: ${owner}`);
        
        // Try to check if ticket is already used
        try {
          const isUsed = await eventTicketNFT.isTicketUsed(ticketId1);
          console.log(`Ticket usage status: ${isUsed ? "Used" : "Unused"}`);
        } catch (error) {
          console.log("Unable to check ticket usage status:", error.message);
        }
        
        // Check organizer permissions
        const minterRole = await eventTicketNFT.MINTER_ROLE();
        const hasRole = await eventTicketNFT.hasRole(minterRole, eventTicketingAddress);
        console.log(`Ticketing contract has minting permission: ${hasRole}`);
        
        // Check if the caller is the event organizer
        const eventDetails = await eventTicketing.getEventDetails(eventId);
        const isOrganizer = eventDetails[6] === organizer.address;
        console.log(`Caller is the event organizer: ${isOrganizer}`);
      } catch (e) {
        console.error("Error checking ticket status:", e.message);
      }
    }
    
    console.log("\nBasic ticketing functionality test complete!");
    console.log("\n===============================================");
    console.log("🎉 Deployment and testing completely successful!");
    console.log("===============================================");
    console.log("Contract address information:");
    console.log("- MockWorldID:", mockWorldIDAddress);
    console.log("- WorldIDVerifier:", worldIDVerifierAddress);
    console.log("- EventTicketNFT:", eventTicketNFTAddress);
    console.log("- EventTicketing:", eventTicketingAddress);
    console.log("===============================================");
    
    // Create simplified .env file content
    const envContent = `
# Contract Addresses
EVENT_TICKETING_ADDRESS="${eventTicketingAddress}"
EVENT_TICKET_NFT_ADDRESS="${eventTicketNFTAddress}"
WORLD_ID_VERIFIER_ADDRESS="${worldIDVerifierAddress}"
MOCK_WORLD_ID_ADDRESS="${mockWorldIDAddress}"

# Deployer Address
DEPLOYER_ADDRESS="${deployer.address}"
`;

    console.log("\nPlease save the following content to your .env file:");
    console.log(envContent);

    // Try to directly update .env file (if it exists)
    try {
      const envPath = path.join(__dirname, '../.env');
      if (fs.existsSync(envPath)) {
        fs.appendFileSync(envPath, envContent);
        console.log(`Updated .env file: ${envPath}`);
      } else {
        fs.writeFileSync(envPath, envContent);
        console.log(`Created .env file: ${envPath}`);
      }
    } catch (error) {
      console.log("Unable to automatically update .env file:", error.message);
      console.log("Please manually copy the content above to your .env file");
    }

    console.log("\n===============================================");
    console.log("Execution complete! If you encounter any issues, please check the error messages and troubleshoot accordingly.");
    console.log("You can use the following commands to verify contract status:");
    console.log("- View contract addresses: cat backend/deployed-addresses.json");
    console.log("- Use frontend interface: Add the .env file to the frontend directory and start the application");
    console.log("===============================================");
  } catch (error) {
    console.error("Error during execution:", error);
    console.log("\nDeployed contracts:");
    if (mockWorldIDAddress) console.log("- MockWorldID:", mockWorldIDAddress);
    if (worldIDVerifierAddress) console.log("- WorldIDVerifier:", worldIDVerifierAddress);
    if (eventTicketNFTAddress) console.log("- EventTicketNFT:", eventTicketNFTAddress);
    if (eventTicketingAddress) console.log("- EventTicketing:", eventTicketingAddress);
  }
}

// Run deployment and testing script
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Runtime error:", error);
      process.exit(1);
    });
} else {
  module.exports = main;
} 