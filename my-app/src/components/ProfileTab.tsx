"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SignOutButton } from "@/components/sign-out-button";
import { Event } from "@/components/Event";

interface ProfileTabProps {
  user: {
    name: string;
  };
  organizedEvents: any[];
}

export function ProfileTab({ user, organizedEvents }: ProfileTabProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <Avatar className="w-32 h-32">
        <AvatarFallback>{user.name[0]}</AvatarFallback>
      </Avatar>
      <span>{user.name}</span>
      <SignOutButton />
      <div className="mt-8 w-full">
        <h2 className="text-xl font-bold mb-4">My Events</h2>
        {organizedEvents.length > 0 ? (
          organizedEvents.map((event) => <Event key={event.id} event={event} />)
        ) : (
          <p>No events organized by you</p>
        )}
      </div>
    </div>
  );
}
