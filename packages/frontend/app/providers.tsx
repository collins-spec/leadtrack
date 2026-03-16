"use client";

import { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { AccountProvider } from "@/lib/account-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AccountProvider>{children}</AccountProvider>
    </AuthProvider>
  );
}
