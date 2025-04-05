"use client";

import { Event } from "@/components/Event";

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
        <Event key={event.id} event={event} />
      ))}
    </div>
  );
}
