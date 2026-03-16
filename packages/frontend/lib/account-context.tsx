"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api } from "./api";
import { useAuth } from "./auth-context";

interface Account {
  id: string;
  name: string;
  businessPhone: string;
  timezone: string;
  createdAt?: string;
  _count?: { callLogs: number; formLeads: number; trackingNumbers: number };
}

interface AccountContextType {
  accounts: Account[];
  currentAccount: Account | null;
  setCurrentAccount: (account: Account) => void;
  refreshAccounts: () => Promise<void>;
  loading: boolean;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentAccount, setCurrentAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAccounts = async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data);

      // Check if current account still exists (handles deletion)
      const stillExists = currentAccount && data.find((a: Account) => a.id === currentAccount.id);

      if (data.length > 0 && !stillExists) {
        // Restore from localStorage or use first
        const savedId =
          typeof window !== "undefined"
            ? localStorage.getItem("leadtrack_account")
            : null;
        const saved = data.find((a: Account) => a.id === savedId);
        setCurrentAccount(saved || data[0]);
      } else if (data.length === 0) {
        setCurrentAccount(null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) refreshAccounts();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSetAccount = (account: Account) => {
    setCurrentAccount(account);
    if (typeof window !== "undefined") {
      localStorage.setItem("leadtrack_account", account.id);
    }
  };

  return (
    <AccountContext.Provider
      value={{
        accounts,
        currentAccount,
        setCurrentAccount: handleSetAccount,
        refreshAccounts,
        loading,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context)
    throw new Error("useAccount must be used within AccountProvider");
  return context;
}
