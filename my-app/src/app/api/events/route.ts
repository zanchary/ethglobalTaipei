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
      "https://worldchain-mainnet.g.alchemy.com/public"
    );
    const contractAddress = process.env.NEXT_PUBLIC_EVENT_TICKETING_ADDRESS;

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
      
      // 检查组织者地址是否有效
      const organizerAddress = args[6];
      if (!organizerAddress || organizerAddress === ethers.ZeroAddress) {
        console.warn(`警告: 事件ID ${args[0].toString()} 的组织者地址无效:`, organizerAddress);
        console.warn('事件参数:', args);
      }

      return {
        id: args[0].toString(),
        name: args[1],
        description: args[2],
        // date: new Date(parseInt(args[3].toString(), 10)).toDateString(),
        totalTickets: args[4].toString(),
        ticketPrice: ethers.formatEther(args[5]),
        organizer: organizerAddress || ethers.ZeroAddress, // 确保至少有一个有效值
        worldIdRequired: args[7],
      };
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("获取事件列表错误:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
