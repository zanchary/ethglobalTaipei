"use client";

import { WalletAuthButton } from "@/components/wallet-auth-button";
import { useSession } from "next-auth/react";
import { SignOutButton } from "@/components/sign-out-button";
import { useState, useEffect } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Event } from "@/components/Event";

interface Event {
  id: number;
  title: string;
  organizer: string;
  date: string;
}

export default function Page() {
  const { data: session } = useSession();
  const [events, setEvents] = useState<Event[]>([]);
  const [activeTab, setActiveTab] = useState<"events" | "profile">("events");

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch("/api/events");
        const data = await res.json();
        setEvents(data.events);
      } catch (error) {
        console.error(error);
      }
    }

    if (session?.user) {
      fetchEvents();
    }
  }, [session]);

  const organizedEvents = session?.user
    ? events.filter((event) => event.organizer === session.user.name)
    : [];

  return (
    <div className="flex p-6 items-center w-full justify-center flex-col h-[100dvh] bg-white text-black safe-area-inset">
      {session?.user ? (
        <div className="flex flex-col gap-4 flex-1 w-full">
          {activeTab === "events" && (
            <div className="flex flex-col gap-4">
              {events.map((event) => (
                <Event key={event.id} event={event} />
              ))}
            </div>
          )}
          {activeTab === "profile" && (
            <div className="flex flex-col items-center gap-4">
              <Avatar className="w-32 h-32">
                <AvatarFallback>{session.user.name[0]}</AvatarFallback>
              </Avatar>
              <span>{session.user.name}</span>
              <SignOutButton />
              <div className="mt-8 w-full">
                <h2 className="text-xl font-bold mb-4">My Events</h2>
                {organizedEvents.length > 0 ? (
                  organizedEvents.map((event) => (
                    <Event key={event.id} event={event} />
                  ))
                ) : (
                  <p>No events organized by you</p>
                )}
              </div>
            </div>
          )}
          <div className="fixed bottom-6 left-0 right-0 flex justify-around border-t p-4 bg-white">
            <button
              onClick={() => setActiveTab("events")}
              className={activeTab === "events" ? "font-bold" : ""}
            >
              Events
            </button>
            <button
              onClick={() => setActiveTab("profile")}
              className={activeTab === "profile" ? "font-bold" : ""}
            >
              Profile
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <div className="text-3xl font-bold">Event Tickting</div>
          <WalletAuthButton />
        </div>
      )}
    </div>
  );
}
