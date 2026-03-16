"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign } from "lucide-react";

interface SpendEntryFormProps {
  accountId: string;
  onSuccess: () => void;
}

export function SpendEntryForm({ accountId, onSuccess }: SpendEntryFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    source: "Google Ads",
    medium: "cpc",
    campaign: "",
    date: new Date().toISOString().slice(0, 10),
    spend: "",
    clicks: "",
    impressions: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.spend || !form.date) return;
    setLoading(true);
    try {
      await api.createSpendEntry({
        accountId,
        source: form.source,
        medium: form.medium,
        campaign: form.campaign || undefined,
        date: form.date,
        spend: parseFloat(form.spend),
        clicks: form.clicks ? parseInt(form.clicks) : undefined,
        impressions: form.impressions ? parseInt(form.impressions) : undefined,
      });
      setOpen(false);
      setForm({
        source: "Google Ads",
        medium: "cpc",
        campaign: "",
        date: new Date().toISOString().slice(0, 10),
        spend: "",
        clicks: "",
        impressions: "",
      });
      onSuccess();
    } catch (err) {
      console.error("Failed to save spend entry:", err);
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <DollarSign className="mr-1 h-4 w-4" />
            Add Spend
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Campaign Spend</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 px-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="spend-source">Source</Label>
                <Input
                  id="spend-source"
                  value={form.source}
                  onChange={(e) => update("source", e.target.value)}
                  placeholder="Google Ads"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="spend-medium">Medium</Label>
                <Input
                  id="spend-medium"
                  value={form.medium}
                  onChange={(e) => update("medium", e.target.value)}
                  placeholder="cpc"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spend-campaign">Campaign</Label>
              <Input
                id="spend-campaign"
                value={form.campaign}
                onChange={(e) => update("campaign", e.target.value)}
                placeholder="Brand Campaign"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="spend-date">Date</Label>
                <Input
                  id="spend-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => update("date", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="spend-amount">Spend ($)</Label>
                <Input
                  id="spend-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.spend}
                  onChange={(e) => update("spend", e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="spend-clicks">Clicks</Label>
                <Input
                  id="spend-clicks"
                  type="number"
                  min="0"
                  value={form.clicks}
                  onChange={(e) => update("clicks", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="spend-impressions">Impressions</Label>
                <Input
                  id="spend-impressions"
                  type="number"
                  min="0"
                  value={form.impressions}
                  onChange={(e) => update("impressions", e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button type="submit" disabled={loading || !form.spend}>
              {loading ? "Saving..." : "Save Entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
