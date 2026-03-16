"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account-context";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Hash, Search } from "lucide-react";

export default function NumbersPage() {
  const { currentAccount } = useAccount();
  const [numbers, setNumbers] = useState<any[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [areaCode, setAreaCode] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [provisionForm, setProvisionForm] = useState({
    source: "Google Ads",
    medium: "cpc",
    campaignTag: "",
    friendlyName: "",
  });
  const [selectedNumber, setSelectedNumber] = useState<string>("");

  const fetchNumbers = async () => {
    if (!currentAccount) return;
    try {
      const data = await api.getTrackingNumbers(currentAccount.id);
      setNumbers(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccount]);

  const searchNumbers = async () => {
    setSearching(true);
    try {
      const data = await api.searchAvailableNumbers(areaCode || undefined);
      setAvailableNumbers(data);
    } catch (err: any) {
      alert(err.message || "Failed to search numbers. Check Twilio credentials.");
    } finally {
      setSearching(false);
    }
  };

  const handleProvision = async () => {
    if (!currentAccount || !selectedNumber) return;
    setProvisioning(true);
    try {
      await api.provisionNumber({
        phoneNumber: selectedNumber,
        accountId: currentAccount.id,
        source: provisionForm.source,
        medium: provisionForm.medium,
        campaignTag: provisionForm.campaignTag || undefined,
        friendlyName: provisionForm.friendlyName || undefined,
      });
      setDialogOpen(false);
      setSelectedNumber("");
      setAvailableNumbers([]);
      fetchNumbers();
    } catch (err: any) {
      alert(err.message || "Failed to provision number");
    } finally {
      setProvisioning(false);
    }
  };

  if (!currentAccount) {
    return <div className="text-muted-foreground">Select an account.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tracking Numbers</h1>
          <p className="text-muted-foreground">
            {numbers.length} number{numbers.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Number
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Provision Tracking Number</DialogTitle>
              <DialogDescription>
                Search for available numbers and configure attribution.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Search */}
              <div className="flex gap-2">
                <Input
                  placeholder="Area code (e.g. 212)"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value)}
                />
                <Button onClick={searchNumbers} disabled={searching}>
                  <Search className="h-4 w-4 mr-2" />
                  {searching ? "Searching..." : "Search"}
                </Button>
              </div>

              {/* Available numbers */}
              {availableNumbers.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
                  {availableNumbers.map((n) => (
                    <button
                      key={n.phoneNumber}
                      onClick={() => setSelectedNumber(n.phoneNumber)}
                      className={`w-full text-left rounded-md px-3 py-2 text-sm transition-colors ${
                        selectedNumber === n.phoneNumber
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      }`}
                    >
                      {n.phoneNumber} — {n.locality}, {n.region}
                    </button>
                  ))}
                </div>
              )}

              {/* Attribution config */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Source</Label>
                  <Input
                    value={provisionForm.source}
                    onChange={(e) =>
                      setProvisionForm({ ...provisionForm, source: e.target.value })
                    }
                    placeholder="Google Ads"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Medium</Label>
                  <Input
                    value={provisionForm.medium}
                    onChange={(e) =>
                      setProvisionForm({ ...provisionForm, medium: e.target.value })
                    }
                    placeholder="cpc"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Campaign Tag</Label>
                  <Input
                    value={provisionForm.campaignTag}
                    onChange={(e) =>
                      setProvisionForm({ ...provisionForm, campaignTag: e.target.value })
                    }
                    placeholder="Brand Campaign"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Friendly Name</Label>
                  <Input
                    value={provisionForm.friendlyName}
                    onChange={(e) =>
                      setProvisionForm({ ...provisionForm, friendlyName: e.target.value })
                    }
                    placeholder="Auto-generated"
                  />
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleProvision}
                disabled={!selectedNumber || provisioning}
              >
                {provisioning ? "Provisioning..." : "Provision Number"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Source / Medium</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {numbers.map((num) => (
                <TableRow key={num.id}>
                  <TableCell className="font-mono">{num.phoneNumber}</TableCell>
                  <TableCell>{num.friendlyName}</TableCell>
                  <TableCell>
                    {num.source} / {num.medium}
                  </TableCell>
                  <TableCell>{num.campaignTag || "--"}</TableCell>
                  <TableCell>
                    {num.isDNIPool ? (
                      <Badge variant="secondary">DNI Pool</Badge>
                    ) : (
                      <Badge variant="outline">Static</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {num.isActive ? (
                      <Badge className="bg-green-100 text-green-800">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {numbers.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-8 text-muted-foreground"
                  >
                    <Hash className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No tracking numbers configured yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
