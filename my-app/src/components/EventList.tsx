"use client";

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

interface EventListProps {
  events: Event[];
}

export function EventList({ events }: EventListProps) {
  return (
    <div className="flex flex-col gap-4">
      {events.map((event) => (
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
              <div>Organized by: {event.organizer}</div>
              <div>Date: {event.date}</div>
            </DialogDescription>
            <DialogFooter>
              <Button>Buy Ticket</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
