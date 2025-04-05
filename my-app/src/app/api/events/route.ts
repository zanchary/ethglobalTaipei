import { NextResponse } from "next/server";
import { ethers } from "ethers";

// Minimal ABI to query the EventCreated event from the EventTicketing contract
const eventTicketingABI = [
  "event EventCreated(uint256 indexed eventId, string name, string description, uint256 eventDate, uint256 totalTickets, uint256 ticketPrice, address organizer, bool worldIdRequired)",
];

export async function GET() {
  try {
    // Connect to your local Hardhat node
    const provider = new ethers.JsonRpcProvider(
      process.env.HARDHAT_RPC_URL || "http://localhost:8545"
    );
    const contractAddress = process.env.EVENT_TICKETING_ADDRESS;

    if (!contractAddress) {
      throw new Error(
        "EVENT_TICKETING_ADDRESS not set in environment variables"
      );
    }

    const contract = new ethers.Contract(
      contractAddress,
      eventTicketingABI,
      provider
    );

    // Query all EventCreated events
    const filter = contract.filters.EventCreated();

    const eventsRaw = await contract.queryFilter(filter);

    const events = eventsRaw.map((event) => {
      const args = event.args;

      return {
        id: args[0].toString(),
        name: args[1],
        description: args[2],
        // date: new Date(parseInt(args[3].toString(), 10)).toDateString(),
        totalTickets: args[4].toString(),
        ticketPrice: ethers.formatEther(args[5]),
        organizer: args[6],
        worldIdRequired: args[7],
      };
    });

    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
