"use client";

import { useState } from "react";
import { useAccount } from "@/lib/account-context";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const emptyForm = { name: "", businessPhone: "", timezone: "America/New_York" };

export default function AccountsPage() {
  const { accounts, currentAccount, setCurrentAccount, refreshAccounts } =
    useAccount();
  const { user } = useAuth();
  const isAdmin = user?.role === "OWNER" || user?.role === "ADMIN";
  const isOwner = user?.role === "OWNER";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (account: any) => {
    setEditingId(account.id);
    setForm({
      name: account.name,
      businessPhone: account.businessPhone,
      timezone: account.timezone || "America/New_York",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await api.updateAccount(editingId, {
          name: form.name,
          businessPhone: form.businessPhone,
          timezone: form.timezone || undefined,
        });
      } else {
        await api.createAccount({
          name: form.name,
          businessPhone: form.businessPhone,
          timezone: form.timezone || undefined,
        });
      }
      await refreshAccounts();
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Delete this account? All associated data (calls, leads, tracking numbers) will be permanently removed."
      )
    )
      return;
    setDeletingId(id);
    try {
      await api.deleteAccount(id);
      await refreshAccounts();
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "--";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Sub Accounts</h1>
          <p className="text-muted-foreground">
            {accounts.length} account{accounts.length !== 1 ? "s" : ""}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New Account
          </Button>
        )}
      </div>

      {/* Accounts Table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Business Phone</TableHead>
                <TableHead className="hidden md:table-cell">
                  Timezone
                </TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right hidden sm:table-cell">
                  Numbers
                </TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow
                  key={account.id}
                  className={cn(
                    currentAccount?.id === account.id && "bg-primary/5"
                  )}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {account.name}
                      {currentAccount?.id === account.id && (
                        <Badge variant="secondary" className="text-xs">
                          Active
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {account.businessPhone}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {account.timezone}
                  </TableCell>
                  <TableCell className="text-right">
                    {account._count?.callLogs ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    {account._count?.formLeads ?? 0}
                  </TableCell>
                  <TableCell className="text-right hidden sm:table-cell">
                    {account._count?.trackingNumbers ?? 0}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                    {formatDate(account.createdAt)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {currentAccount?.id !== account.id && (
                          <DropdownMenuItem
                            onClick={() => setCurrentAccount(account)}
                          >
                            <ArrowRightLeft className="h-4 w-4 mr-2" />
                            Switch to this account
                          </DropdownMenuItem>
                        )}
                        {isAdmin && (
                          <>
                            <DropdownMenuItem
                              onClick={() => openEdit(account)}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            {isOwner && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  disabled={deletingId === account.id}
                                  onClick={() => handleDelete(account.id)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  {deletingId === account.id
                                    ? "Deleting..."
                                    : "Delete"}
                                </DropdownMenuItem>
                              </>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-12 text-muted-foreground"
                  >
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No accounts yet.</p>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={openCreate}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Create your first account
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Account" : "Create New Account"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the account details below."
                : "Add a new sub account to your organization."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Account Name *</Label>
              <Input
                placeholder="e.g. Acme Plumbing"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Business Phone *</Label>
              <Input
                placeholder="+15551234567"
                value={form.businessPhone}
                onChange={(e) =>
                  setForm({ ...form, businessPhone: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Calls to tracking numbers will forward here.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input
                placeholder="America/New_York"
                value={form.timezone}
                onChange={(e) =>
                  setForm({ ...form, timezone: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleSave}
              disabled={
                saving || !form.name.trim() || !form.businessPhone.trim()
              }
            >
              {saving
                ? "Saving..."
                : editingId
                  ? "Save Changes"
                  : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
