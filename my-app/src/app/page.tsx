"use client";

import { WalletAuthButton } from "@/components/wallet-auth-button";
import { useSession } from "next-auth/react";
import { SignOutButton } from "@/components/sign-out-button";

export default function Page() {
  const { data: session } = useSession();

  return (
    <div className="flex items-center w-full justify-center flex-col h-[100dvh] bg-white text-black safe-area-inset">
      {session?.user ? (
        <div className="flex flex-col items-center gap-2">
          {session.user.name}
          <SignOutButton />
        </div>
      ) : (
        <WalletAuthButton />
      )}
    </div>
  );
}
