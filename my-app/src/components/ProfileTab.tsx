"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SignOutButton } from "@/components/sign-out-button";
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
  user: {
    name: string;
  };
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

    // 将日期转换为Unix时间戳（秒）
    const timestampInSeconds = Math.floor(new Date(eventDate).getTime() / 1000);
    
    // 验证输入
    if (!eventName || !eventDescription) {
      setTxStatus("错误: 活动名称和描述不能为空");
      return;
    }
    
    if (!eventDate) {
      setTxStatus("错误: 请选择活动日期");
      return;
    }
    
    if (timestampInSeconds <= Math.floor(Date.now() / 1000)) {
      setTxStatus("错误: 活动日期必须在未来");
      return;
    }
    
    const ticketsNum = parseInt(totalTickets);
    if (isNaN(ticketsNum) || ticketsNum <= 0) {
      setTxStatus("错误: 票数必须是大于零的整数");
      return;
    }
    
    // 处理票价 - 改进ETH到wei的转换
    let priceInWei;
    try {
      if (!ticketPrice || ticketPrice.trim() === '') {
        setTxStatus("错误: 请输入票价");
        return;
      }

      // 移除所有空格
      const cleanPrice = ticketPrice.trim().replace(/\s+/g, '');
      
      // 检查是否为数字格式
      if (!/^[0-9]+(\.[0-9]+)?$/.test(cleanPrice)) {
        setTxStatus("错误: 票价格式无效，请输入有效的数字");
        return;
      }
      
      // ETH转wei (1 ETH = 10^18 wei)
      if (cleanPrice.includes('.')) {
        // 小数点格式，按ETH单位处理
        const [whole, fraction = ''] = cleanPrice.split('.');
        // 确保小数部分不超过18位
        const paddedFraction = fraction.substring(0, 18).padEnd(18, '0');
        // 构建wei值
        priceInWei = whole + paddedFraction;
        // 移除前导零
        priceInWei = priceInWei.replace(/^0+/, '') || '0';
      } else {
        // 整数格式，可以是ETH或wei
        if (cleanPrice.length <= 9) {
          // 如果数字较小，认为是ETH，转换为wei
          priceInWei = cleanPrice.padEnd(cleanPrice.length + 18, '0');
        } else {
          // 数字较大，可能已经是wei
          priceInWei = cleanPrice;
        }
      }

      // 检查价格是否大于零
      if (priceInWei === '0' || /^0+$/.test(priceInWei)) {
        setTxStatus("错误: 票价必须大于零");
        return;
      }

      // 打印转换结果，方便调试
      console.log(`原始输入: ${ticketPrice}`);
      console.log(`转换为wei: ${priceInWei}`);
      
    } catch (e) {
      console.error("票价转换错误:", e);
      setTxStatus("错误: 票价格式无效");
      return;
    }

    console.log("创建活动参数:", {
      name: eventName,
      description: eventDescription,
      date: new Date(timestampInSeconds * 1000).toString(),
      timestamp: timestampInSeconds,
      tickets: ticketsNum,
      price: priceInWei,
      worldIdRequired
    });

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
                timestampInSeconds,
                ticketsNum,
                priceInWei, // 字符串形式的大整数
                worldIdRequired,
              ],
            },
          ],
        });
      console.log("交易详情:", commandPayload);
      setTxStatus(
        "交易已提交. 交易ID: " + finalPayload.transaction_id
      );
      setOpen(false);
    } catch (error: any) {
      console.error("交易错误详情:", error);
      // 提供更友好的错误信息
      if (error.message.includes("simulation failed")) {
        setTxStatus("交易模拟失败: 请检查输入参数，确保票价和日期有效。详细错误: " + error.message);
      } else if (error.message.includes("insufficient funds")) {
        setTxStatus("余额不足: 您的账户没有足够的资金支付交易费用");
      } else if (error.message.includes("user rejected")) {
        setTxStatus("交易被用户拒绝");
      } else {
        setTxStatus("交易失败: " + error.message);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <Avatar className="w-32 h-32">
        <AvatarFallback>{user.name[0]}</AvatarFallback>
      </Avatar>
      <span>{user.name}</span>
      <SignOutButton />
      <Button variant="default" className="mt-4" onClick={() => setOpen(true)}>
        Create Event
      </Button>
      <div className="mt-8 w-full">
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
                placeholder="票价 (ETH，例如: 0.001)"
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
