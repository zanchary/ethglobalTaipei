import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import React from "react";
import { Button } from "./ui/button";

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
  return (
    <Dialog key={event.id}>
      <DialogTrigger asChild>
        <Card>
          <CardHeader>
            <CardTitle>{event.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div>{event.description}</div>
            <div>Organized by: {truncatedAddress(event.organizer)}</div>
            <div> Total Tickets: {event.totalTickets} </div>
            {/* <div>Date: {event.date}</div> */}
          </CardContent>
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
          <Button>Buy Ticket with {event.ticketPrice} ETH</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
