"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Phone,
  Hash,
  LayoutDashboard,
  Code,
  Settings,
  LogOut,
  Inbox,
  Menu,
  X,
  Building2,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { AccountSwitcher } from "./account-switcher";
import { NotificationBell } from "./notification-bell";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/leads", label: "Lead Inbox", icon: Inbox },
  { href: "/dashboard/keywords", label: "Keywords", icon: TrendingUp },
  { href: "/dashboard/calls", label: "Call Log", icon: Phone },
  { href: "/dashboard/numbers", label: "Tracking Numbers", icon: Hash },
  { href: "/dashboard/accounts", label: "Sub Accounts", icon: Building2 },
  { href: "/dashboard/integration", label: "Integration", icon: Code },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, organization, logout } = useAuth();

  return (
    <>
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-bold text-lg"
          onClick={onNavigate}
        >
          <Phone className="h-5 w-5 text-primary" />
          LeadTrack
        </Link>
      </div>

      {/* Account Switcher */}
      <div className="border-b p-3">
        <AccountSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="border-t p-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {organization?.name}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={logout}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex h-14 items-center border-b bg-background px-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="ml-2 font-bold text-lg flex items-center gap-2">
          <Phone className="h-5 w-5 text-primary" />
          LeadTrack
        </span>
      </div>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-72 flex-col bg-background shadow-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 z-10 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex h-screen w-64 flex-col border-r bg-background shrink-0">
        <SidebarContent />
      </aside>
    </>
  );
}
