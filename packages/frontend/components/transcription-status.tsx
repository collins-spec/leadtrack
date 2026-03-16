"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Check, AlertTriangle, Clock } from "lucide-react";

interface TranscriptionStatusProps {
  status: string | null;
  onRetry?: () => void;
}

export function TranscriptionStatus({ status, onRetry }: TranscriptionStatusProps) {
  if (!status) return null;

  switch (status) {
    case "PENDING":
      return (
        <Badge variant="outline" className="gap-1 text-xs text-blue-600 border-blue-300">
          <Clock className="h-3 w-3" />
          Queued
        </Badge>
      );
    case "PROCESSING":
      return (
        <Badge variant="outline" className="gap-1 text-xs text-amber-600 border-amber-300">
          <Loader2 className="h-3 w-3 animate-spin" />
          Transcribing...
        </Badge>
      );
    case "COMPLETED":
      return (
        <Badge variant="outline" className="gap-1 text-xs text-green-600 border-green-300">
          <Check className="h-3 w-3" />
          Transcribed
        </Badge>
      );
    case "FAILED":
      return (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="gap-1 text-xs text-red-600 border-red-300">
            <AlertTriangle className="h-3 w-3" />
            Failed
          </Badge>
          {onRetry && (
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      );
    default:
      return null;
  }
}
