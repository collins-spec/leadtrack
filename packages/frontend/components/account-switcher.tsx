"use client";

import { useAccount } from "@/lib/account-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

export function AccountSwitcher() {
  const { accounts, currentAccount, setCurrentAccount } = useAccount();

  if (accounts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground px-1">No accounts yet</div>
    );
  }

  return (
    <Select
      value={currentAccount?.id || ""}
      onValueChange={(val) => {
        const account = accounts.find((a) => a.id === val);
        if (account) setCurrentAccount(account);
      }}
    >
      <SelectTrigger className="w-full">
        <span className="truncate">
          {currentAccount?.name || "Select account"}
        </span>
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
