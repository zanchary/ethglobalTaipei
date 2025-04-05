"use client";

import { WalletAuthButton } from "@/components/wallet-auth-button";
import { useSession } from "next-auth/react";
import { ProfileTab } from "@/components/ProfileTab";
import { useState, useEffect } from "react";
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
    <div className="flex p-6 pb-28 items-center w-full flex-col h-[100dvh] bg-white text-black overflow-y-scroll">
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
            <ProfileTab user={session.user} organizedEvents={organizedEvents} />
          )}
          <div className="fixed pb-10 bottom-0 left-0 right-0 flex justify-around border-t p-4 bg-white">
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
