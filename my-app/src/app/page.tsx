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
        console.log("获取的事件数据:", data.events);
        setEvents(data.events);
      } catch (error) {
        console.error("获取事件列表错误:", error);
      }
    }

    if (session?.user) {
      fetchEvents();
    }
  }, [session]);

  const organizedEvents = session?.user
    ? events.filter((event) => {
        // 检查地址格式并规范化比较
        const eventAddress = (typeof event.organizer === 'string') 
          ? event.organizer.toLowerCase() 
          : String(event.organizer);
          
        const userAddress = session.user.address 
          ? session.user.address.toLowerCase() 
          : '';
          
        // 在开发环境下打印调试信息
        if (process.env.NODE_ENV === 'development') {
          console.log(`比较地址 - 事件: ${eventAddress}, 用户: ${userAddress}`);
        }
        
        return eventAddress === userAddress;
      })
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
            <ProfileTab user={session.user} organizedEvents={organizedEvents} />
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
