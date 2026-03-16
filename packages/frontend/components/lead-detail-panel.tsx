"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AudioPlayer } from "./audio-player";
import { LeadTagManager } from "./lead-tag-manager";
import { TranscriptionStatus } from "./transcription-status";
import { CallSummaryCard } from "./call-summary-card";
import { TranscriptViewer } from "./transcript-viewer";
import { Phone, FileText, MapPin, Globe, Clock, ExternalLink, Search, Megaphone, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export interface UnifiedLead {
  type: "call" | "form";
  id: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  contact: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  duration: number | null;
  callStatus: string | null;
  tags: { id: string; label: string; color: string }[];
  recordingUrl: string | null;
  formData: Record<string, any> | null;
  pageUrl: string | null;
  callerCity: string | null;
  callerState: string | null;
  transcriptionStatus: string | null;
  callSummary: string | null;
  leadScore: number | null;
  leadScoreLabel: string | null;
  // Google Ads attribution
  keyword: string | null;
  adsCampaign: string | null;
  matchType: string | null;
  adGroup: string | null;
  landingPage: string | null;
  gclid: string | null;
  createdAt: string;
}

interface TranscriptData {
  transcriptionStatus: string | null;
  transcriptText: string | null;
  transcriptSegments: { start: number; end: number; text: string }[] | null;
  callSummary: string | null;
  leadScore: number | null;
  leadScoreLabel: string | null;
  keywordsFound: { keyword: string; category: string; count: number; positions: number[] }[] | null;
  transcriptionError: string | null;
  transcribedAt: string | null;
}

interface LeadDetailPanelProps {
  lead: UnifiedLead | null;
  onClose: () => void;
  onTagsChange: (leadId: string, leadType: "call" | "form", tags: any[]) => void;
}

const statusColors: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-800",
  NO_ANSWER: "bg-yellow-100 text-yellow-800",
  BUSY: "bg-orange-100 text-orange-800",
  FAILED: "bg-red-100 text-red-800",
  RINGING: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function InfoRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon && <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
      <div>
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium">{value}</span>
      </div>
    </div>
  );
}

export function LeadDetailPanel({ lead, onClose, onTagsChange }: LeadDetailPanelProps) {
  const isCall = lead?.type === "call";
  const isForm = lead?.type === "form";

  // Transcript state
  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [audioTime, setAudioTime] = useState(0);
  const seekRef = useRef<((time: number) => void) | null>(null);

  // Fetch transcript data when a call lead is selected
  useEffect(() => {
    setTranscript(null);
    setAudioTime(0);

    if (!lead || lead.type !== "call") return;

    // Only fetch if the call has been through the transcription pipeline
    if (lead.transcriptionStatus || lead.recordingUrl) {
      api.getCallTranscript(lead.id).then(setTranscript).catch(() => {});
    }
  }, [lead?.id, lead?.type, lead?.transcriptionStatus, lead?.recordingUrl]);

  const handleRetryTranscription = async () => {
    if (!lead) return;
    try {
      await api.retryTranscription(lead.id);
      // Re-fetch after a short delay
      setTimeout(() => {
        api.getCallTranscript(lead.id).then(setTranscript).catch(() => {});
      }, 1000);
    } catch {
      // Silently fail
    }
  };

  return (
    <Sheet open={!!lead} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
        {lead && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
                    isCall ? "bg-blue-100 text-blue-600" : "bg-green-100 text-green-600"
                  )}
                >
                  {isCall ? <Phone className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </div>
                <SheetTitle>
                  {isCall ? "Call Detail" : "Form Submission"}
                </SheetTitle>
              </div>
              <SheetDescription>{formatDate(lead.createdAt)}</SheetDescription>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-6">
              {/* Contact Info */}
              <section className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Contact
                </h3>
                {isCall && (
                  <>
                    <InfoRow label="Phone" value={lead.contact} icon={Phone} />
                    {lead.callerCity && (
                      <InfoRow
                        label="Location"
                        value={`${lead.callerCity}${lead.callerState ? `, ${lead.callerState}` : ""}`}
                        icon={MapPin}
                      />
                    )}
                  </>
                )}
                {isForm && (
                  <>
                    <InfoRow label="Name" value={lead.contactName} />
                    <InfoRow label="Email" value={lead.contactEmail} />
                    <InfoRow label="Phone" value={lead.contactPhone} icon={Phone} />
                  </>
                )}
              </section>

              <Separator />

              {/* Source Attribution */}
              <section className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Source
                </h3>
                <InfoRow label="Source" value={lead.source} icon={Globe} />
                <InfoRow label="Medium" value={lead.medium} />
                <InfoRow label="Campaign" value={lead.adsCampaign || lead.campaign} icon={Megaphone} />
                <InfoRow label="Keyword" value={lead.keyword} icon={Search} />
                {lead.matchType && (
                  <InfoRow label="Match Type" value={lead.matchType} icon={Target} />
                )}
                <InfoRow label="Ad Group" value={lead.adGroup} />
                {(lead.landingPage || (isForm && lead.pageUrl)) && (
                  <div className="flex items-start gap-2 text-sm">
                    <ExternalLink className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <span className="text-muted-foreground">Landing Page: </span>
                      <span className="font-medium break-all">{lead.landingPage || lead.pageUrl}</span>
                    </div>
                  </div>
                )}
                {lead.gclid && (
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-muted-foreground text-xs mt-0.5">GCLID: </span>
                    <span className="text-xs font-mono text-muted-foreground break-all">{lead.gclid}</span>
                  </div>
                )}
              </section>

              <Separator />

              {/* Tags */}
              <section className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Tags
                </h3>
                <LeadTagManager
                  leadId={lead.id}
                  leadType={lead.type}
                  tags={lead.tags}
                  onTagsChange={(newTags) => onTagsChange(lead.id, lead.type, newTags)}
                />
              </section>

              <Separator />

              {/* Call-specific details */}
              {isCall && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                      Call Details
                    </h3>
                    <TranscriptionStatus
                      status={transcript?.transcriptionStatus || lead.transcriptionStatus}
                      onRetry={handleRetryTranscription}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    {lead.callStatus && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          statusColors[lead.callStatus] || "bg-gray-100 text-gray-800"
                        )}
                      >
                        {lead.callStatus.replace("_", " ")}
                      </Badge>
                    )}
                    {lead.duration != null && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDuration(lead.duration)}
                      </div>
                    )}
                  </div>

                  {lead.recordingUrl && (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium">Recording</p>
                      <AudioPlayer
                        src={lead.recordingUrl}
                        onTimeUpdate={setAudioTime}
                        seekRef={seekRef}
                      />
                    </div>
                  )}

                  {/* AI Summary Card */}
                  {transcript?.callSummary && (
                    <CallSummaryCard
                      summary={transcript.callSummary}
                      leadScore={transcript.leadScore}
                      leadScoreLabel={transcript.leadScoreLabel}
                      keywordsFound={transcript.keywordsFound}
                    />
                  )}

                  {/* Transcript Viewer */}
                  {transcript?.transcriptSegments && transcript.transcriptSegments.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium">Transcript</p>
                      <TranscriptViewer
                        segments={transcript.transcriptSegments}
                        keywordsFound={transcript.keywordsFound}
                        currentTime={audioTime}
                        onSeekTo={(time) => seekRef.current?.(time)}
                      />
                    </div>
                  )}
                </section>
              )}

              {/* Form-specific details */}
              {isForm && lead.formData && (
                <section className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Form Fields
                  </h3>
                  <div className="rounded-lg border p-3 space-y-2">
                    {Object.entries(lead.formData).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground capitalize">
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                        <span className="font-medium text-right ml-4 break-all">
                          {String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
