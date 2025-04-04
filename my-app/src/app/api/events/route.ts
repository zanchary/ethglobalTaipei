import { NextResponse } from "next/server";

export async function GET() {
  // Return mock event data; later this can be replaced with on-chain data.
  const events = [
    {
      id: 1,
      title: "Event 1",
      organizer: "Organizer 1",
      date: "2025-04-05"
    },
    {
      id: 2,
      title: "Event 2",
      organizer: "Organizer 2",
      date: "2025-05-05"
    },
    {
      id: 3,
      title: "Event 3",
      organizer: "Organizer 3",
      date: "2025-06-05"
    }
  ];
  return NextResponse.json({ events });
}
