import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import React, { useEffect } from "react";
import { Button } from "./ui/button";

function truncatedAddress(address: string): string {
  // 检查地址是否为零地址
  const isZeroAddress = address === "0x0000000000000000000000000000000000000000";
  if (isZeroAddress && process.env.NODE_ENV === "development") {
    console.warn("警告: 检测到零地址作为组织者地址");
    return "0x0000...0000 (无效地址)";
  }
  
  // 如果地址无效或格式不正确
  if (!address || typeof address !== 'string' || !address.startsWith('0x') || address.length < 12) {
    console.warn("警告: 无效的以太坊地址格式:", address);
    return String(address || "无效地址");
  }
  
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
  // 开发环境下对零地址进行警告
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && 
        event.organizer === "0x0000000000000000000000000000000000000000") {
      console.warn(`事件 [${event.id}] "${event.name}" 的组织者地址是零地址。`, event);
    }
  }, [event]);

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
