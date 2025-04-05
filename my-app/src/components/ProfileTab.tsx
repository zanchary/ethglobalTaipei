"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { CircleUser, LogOut } from "lucide-react";
import { Event } from "@/components/Event";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  MiniAppSendTransactionPayload,
  MiniKit,
  ResponseEvent,
} from "@worldcoin/minikit-js";
import { useWaitForTransactionReceipt } from "@worldcoin/minikit-react";
import { Button } from "@/components/ui/button";
import createEventAbi from "@/abi/createEvent.json";
import { createPublicClient, http } from "viem";
import { worldchain } from "@/lib/chains";

interface ProfileTabProps {
  user: any;
  organizedEvents: any[];
}

export function ProfileTab({ user, organizedEvents }: ProfileTabProps) {
  const [open, setOpen] = useState(false);

  const [eventName, setEventName] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [totalTickets, setTotalTickets] = useState("");
  const [ticketPrice, setTicketPrice] = useState("");
  const [worldIdRequired, setWorldIdRequired] = useState(false);
  const [txStatus, setTxStatus] = useState("");

  const [transactionId, setTransactionId] = useState<string>("");

  const client = createPublicClient({
    chain: worldchain,
    transport: http("https://worldchain-mainnet.g.alchemy.com/public"),
  });

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      client: client,
      appConfig: {
        app_id: "app_c31bc11d034cb9864a9dbf2fc81d5d54",
      },
      transactionId: transactionId,
    });

  console.log("isConfirming, isConfirmed");
  console.log(isConfirming, isConfirmed);

  useEffect(() => {
    if (!MiniKit.isInstalled()) {
      return;
    }

    MiniKit.subscribe(
      ResponseEvent.MiniAppSendTransaction,
      async (payload: MiniAppSendTransactionPayload) => {
        if (payload.status === "error") {
          console.error("Error sending transaction", payload);
        } else {
          setTransactionId(payload.transaction_id);
        }
      }
    );

    return () => {
      MiniKit.unsubscribe(ResponseEvent.MiniAppSendTransaction);
    };
  }, []);

  const handleCreateEvent = async () => {
    if (!MiniKit.isInstalled()) {
      console.log("MiniKit is not installed");
      return;
    }

    const timestamp = Math.floor(new Date(eventDate).getTime() / 1000);

    console.log("user.address");
    console.log(user.address);

    // Convert totalTickets to a number and ticketPrice (ETH) to wei as BigInt
    const numericTotalTickets = parseInt(totalTickets);
    const numericTicketPrice = BigInt(
      Math.floor(parseFloat(ticketPrice) * 1e18)
    );

    try {
      const { commandPayload, finalPayload } =
        await MiniKit.commandsAsync.sendTransaction({
          transaction: [
            {
              address: process.env.NEXT_PUBLIC_EVENT_TICKETING_ADDRESS!,
              abi: createEventAbi,
              functionName: "createEvent",
              args: [
                eventName,
                eventDescription,
                timestamp,
                numericTotalTickets,
                numericTicketPrice,
                worldIdRequired,
                user.address,
              ],
            },
          ],
        });

      console.log(commandPayload);
      console.log(finalPayload);

      setTxStatus(
        "Transaction submitted. Transaction ID: " + finalPayload.transaction_id
      );
      setOpen(false);
    } catch (error: any) {
      console.error("Transaction error details:", error);
    }
  };

  return (
    <div className="relative flex flex-col items-center gap-4">
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="icon" onClick={() => signOut()}>
          <LogOut strokeWidth={3} />
        </Button>
      </div>
      <CircleUser size={120} strokeWidth={1.0} />
      <span>{user.name}</span>
      <Button variant="default" className="mt-4" onClick={() => setOpen(true)}>
        Create Event
      </Button>
      <div className="mt-8 w-full flex flex-col gap-4">
        <h2 className="text-xl font-bold mb-4">My Events</h2>
        {organizedEvents.length > 0 ? (
          organizedEvents.map((event) => <Event key={event.id} event={event} />)
        ) : (
          <p>No events organized by you</p>
        )}
      </div>
      {open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Event</DialogTitle>
              <DialogDescription>Enter event details below:</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Event Name"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="input"
              />
              <textarea
                placeholder="Description"
                value={eventDescription}
                onChange={(e) => setEventDescription(e.target.value)}
                className="input"
              />
              <input
                type="datetime-local"
                placeholder="Event Date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="input"
              />
              <input
                type="number"
                placeholder="Total Tickets"
                value={totalTickets}
                onChange={(e) => setTotalTickets(e.target.value)}
                className="input"
              />
              <input
                type="text"
                placeholder="Ticket Price (ETH, e.g.: 0.001)"
                value={ticketPrice}
                onChange={(e) => setTicketPrice(e.target.value)}
                className="input"
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={worldIdRequired}
                  onChange={(e) => setWorldIdRequired(e.target.checked)}
                />
                World ID Required
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="default" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="default" onClick={handleCreateEvent}>
                Submit
              </Button>
            </div>
            {txStatus && <p className="mt-2">{txStatus}</p>}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
