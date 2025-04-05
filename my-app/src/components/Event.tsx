import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "./ui/button";
import { MiniKit } from "@worldcoin/minikit-js";
import buyTicketAbi from "@/abi/buyTicket.json";

function truncatedAddress(address: string): string {
  return `${address.slice(0, 7)}...${address.slice(-5)}`;
}

interface Event {
  id: number;
  name: string;
  description: string;
  organizer: string;
  date: string;
  totalTickets: number;
  ticketPrice: any;
}

interface EventProps {
  event: Event;
}

export function Event({ event }: EventProps) {
  const handleBuyTicket = async () => {
    if (!MiniKit.isInstalled()) {
      console.log("MiniKit is not installed");
      return;
    }
    try {
      const res = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: process.env.NEXT_PUBLIC_EVENT_TICKETING_ADDRESS!,
            abi: buyTicketAbi,
            functionName: "buyTicket",
            args: [event.id],
            value:
              "0x" +
              BigInt(Math.floor(Number(event.ticketPrice) * 1e18)).toString(16),
          },
        ],
      });
      console.log("Transaction sent:", res);
    } catch (error) {
      console.error("Transaction error:", error);
    }
  };

  return (
    <Dialog key={event.id}>
      <DialogTrigger asChild>
        <Card>
          <CardHeader>
            <CardTitle>{event.name}</CardTitle>
            <CardDescription>
              <div>{event.description}</div>
              <div>Organized by: {truncatedAddress(event.organizer)}</div>
              <div> Total Tickets: {event.totalTickets} </div>
            </CardDescription>
          </CardHeader>
        </Card>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{event.name}</DialogTitle>
        <DialogDescription>
          Organized by: {truncatedAddress(event.organizer)}
          {/* <br /> */}
          {/* Date: {event.date} */}
        </DialogDescription>
        <DialogFooter>
          <Button onClick={handleBuyTicket}>
            Buy Ticket with {event.ticketPrice} ETH
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
