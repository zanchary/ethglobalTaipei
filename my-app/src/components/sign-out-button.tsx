"use client";

import { signOut } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";

export function SignOutButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut();
    } catch (error) {
      console.error("Sign out error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button size="lg" onClick={handleSignOut} disabled={isLoading}>
      <div className="flex items-center gap-3">
        {isLoading && <Loader2 className="animate-spin" />}
        Sign Out
      </div>
    </Button>
  );
}
