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

interface Event {
  id: number;
  title: string;
  organizer: string;
  date: string;
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
            <CardTitle>{event.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div>Organized by: {event.organizer}</div>
            <div>Date: {event.date}</div>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{event.title}</DialogTitle>
        <DialogDescription>
          Organized by: {event.organizer}
          <br />
          Date: {event.date}
        </DialogDescription>
        <DialogFooter>
          <Button>Buy Ticket</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
