"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";

interface Tag {
  id: string;
  label: string;
  color: string;
}

interface LeadTagManagerProps {
  leadId: string;
  leadType: "call" | "form";
  tags: Tag[];
  onTagsChange: (tags: Tag[]) => void;
}

const PRESET_TAGS = [
  { label: "Qualified", color: "#22c55e" },
  { label: "Spam", color: "#ef4444" },
  { label: "Wrong Number", color: "#f59e0b" },
  { label: "Booked", color: "#3b82f6" },
  { label: "Follow Up", color: "#8b5cf6" },
  { label: "New Customer", color: "#06b6d4" },
];

export function LeadTagManager({
  leadId,
  leadType,
  tags,
  onTagsChange,
}: LeadTagManagerProps) {
  const [loading, setLoading] = useState(false);

  const addTag = async (label: string, color: string) => {
    // Don't add duplicate
    if (tags.some((t) => t.label === label)) return;

    setLoading(true);
    try {
      const tag =
        leadType === "call"
          ? await api.addCallTag(leadId, label, color)
          : await api.addFormLeadTag(leadId, label, color);
      onTagsChange([...tags, tag]);
    } catch (err) {
      console.error("Failed to add tag:", err);
    } finally {
      setLoading(false);
    }
  };

  const removeTag = async (tagId: string) => {
    setLoading(true);
    try {
      if (leadType === "call") {
        await api.removeCallTag(leadId, tagId);
      } else {
        await api.removeFormLeadTag(leadId, tagId);
      }
      onTagsChange(tags.filter((t) => t.id !== tagId));
    } catch (err) {
      console.error("Failed to remove tag:", err);
    } finally {
      setLoading(false);
    }
  };

  // Filter out preset tags that are already applied
  const availablePresets = PRESET_TAGS.filter(
    (preset) => !tags.some((t) => t.label === preset.label)
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className="gap-1 pr-1"
          style={{ borderColor: tag.color, color: tag.color }}
        >
          {tag.label}
          <button
            onClick={() => removeTag(tag.id)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
            disabled={loading}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      {availablePresets.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 px-2 text-xs"
                disabled={loading}
              />
            }
          >
            <Plus className="h-3 w-3" />
            Tag
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Add tag</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availablePresets.map((preset) => (
              <DropdownMenuItem
                key={preset.label}
                onClick={() => addTag(preset.label, preset.color)}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: preset.color }}
                />
                {preset.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
