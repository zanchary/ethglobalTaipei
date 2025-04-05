import { NextResponse } from "next/server";

export async function GET() {
  // Return mock event data; later this can be replaced with on-chain data.
  const events = [
    {
      id: 1,
      title: "ETH Taipei",
      organizer: "m4xshen.0955",
      date: "2025-04-05",
    },
    {
      id: 2,
      title: "Next.js Conf 2025",
      organizer: "test.1234",
      date: "2025-05-05",
    },
    {
      id: 3,
      title: "COSCUP",
      organizer: "test.5678",
      date: "2025-06-05",
    },
  ];
  return NextResponse.json({ events });
}
