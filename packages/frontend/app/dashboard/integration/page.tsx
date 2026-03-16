"use client";

import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account-context";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Copy, Check, Code, FileText, Phone, ExternalLink } from "lucide-react";

export default function IntegrationPage() {
  const { currentAccount } = useAccount();
  const [copied, setCopied] = useState(false);
  const [dniPoolCount, setDniPoolCount] = useState(0);

  useEffect(() => {
    if (!currentAccount) return;
    const fetchNumbers = async () => {
      try {
        const numbers = await api.getTrackingNumbers(currentAccount.id);
        setDniPoolCount(
          numbers.filter((n: any) => n.isDNIPool && n.isActive).length
        );
      } catch {
        /* ignore */
      }
    };
    fetchNumbers();
  }, [currentAccount]);

  if (!currentAccount) {
    return <div className="text-muted-foreground">Select an account.</div>;
  }

  const apiBase = (
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
  ).replace(/\/api$/, "");
  const snippetCode = `<script src="${apiBase}/api/snippet/${currentAccount.id}"></script>`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(snippetCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integration</h1>
        <p className="text-muted-foreground">
          Set up tracking on your client&apos;s website
        </p>
      </div>

      <Tabs defaultValue="embed">
        <TabsList>
          <TabsTrigger value="embed">
            <Code className="h-4 w-4 mr-1.5" />
            Embed Code
          </TabsTrigger>
          <TabsTrigger value="forms">
            <FileText className="h-4 w-4 mr-1.5" />
            Form Tracking
          </TabsTrigger>
          <TabsTrigger value="dni">
            <Phone className="h-4 w-4 mr-1.5" />
            DNI Setup
          </TabsTrigger>
        </TabsList>

        {/* ── Embed Code Tab ──────────────────────────────────────────── */}
        <TabsContent value="embed">
          <Card>
            <CardHeader>
              <CardTitle>Embed Code</CardTitle>
              <CardDescription>
                Add this snippet to your client&apos;s website, just before the
                closing &lt;/body&gt; tag. It enables both form tracking and
                dynamic number insertion.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <pre className="rounded-lg bg-muted p-4 text-sm font-mono overflow-x-auto">
                  {snippetCode}
                </pre>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={copyToClipboard}
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                In production, replace <code>localhost:4000</code> with your
                backend domain.
              </p>

              <div className="rounded-lg border p-4 mt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Test Your Integration</p>
                    <p className="text-xs text-muted-foreground">
                      Open a sample landing page to verify DNI and form tracking
                    </p>
                  </div>
                  <a
                    href={`/test-landing?accountId=${currentAccount.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Open Test Page
                    </Button>
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Form Tracking Tab ───────────────────────────────────────── */}
        <TabsContent value="forms">
          <Card>
            <CardHeader>
              <CardTitle>Form Tracking</CardTitle>
              <CardDescription>
                The snippet automatically captures all form submissions on the
                page — no additional markup needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-3">
                  <Step n={1}>
                    Add the embed code to your site (see Embed Code tab)
                  </Step>
                  <Step n={2}>
                    Forms are tracked automatically — every form submission
                    fires a beacon to LeadTrack
                  </Step>
                  <Step n={3}>
                    Captured data: all form fields, UTM parameters, GCLID,
                    referrer, and page URL
                  </Step>
                  <Step n={4}>
                    Form submissions appear in the Leads section of your
                    dashboard
                  </Step>
                </div>

                <div className="rounded-lg border p-4 mt-4">
                  <p className="text-sm font-medium mb-2">How it works</p>
                  <p className="text-sm text-muted-foreground">
                    The snippet listens for the{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      submit
                    </code>{" "}
                    event on all forms using a document-level capture-phase
                    listener. Form data is sent via{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      navigator.sendBeacon
                    </code>{" "}
                    so the request completes even as the page navigates. The
                    form itself is never blocked or delayed.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    To exclude a form, add{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      data-leadtrack-ignore
                    </code>{" "}
                    to the &lt;form&gt; element.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DNI Setup Tab ───────────────────────────────────────────── */}
        <TabsContent value="dni">
          <Card>
            <CardHeader>
              <CardTitle>Dynamic Number Insertion</CardTitle>
              <CardDescription>
                Swap your client&apos;s phone number with a tracking number
                based on the visitor&apos;s ad source.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Pool status */}
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium">DNI Pool Numbers</p>
                    <p className="text-xs text-muted-foreground">
                      Numbers marked as &quot;DNI Pool&quot; on the Tracking
                      Numbers page
                    </p>
                  </div>
                  <Badge
                    variant={dniPoolCount > 0 ? "default" : "destructive"}
                  >
                    {dniPoolCount} active
                  </Badge>
                </div>

                {dniPoolCount === 0 && (
                  <div className="rounded-lg bg-yellow-50 border-yellow-200 border p-3 text-sm text-yellow-800">
                    You need at least one tracking number marked as
                    &quot;DNI Pool&quot; before DNI will work. Go to Tracking
                    Numbers and provision a number with the DNI Pool option.
                  </div>
                )}

                <div className="space-y-3">
                  <Step n={1}>Add the embed code to your site</Step>
                  <Step n={2}>
                    Add the{" "}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      data-leadtrack-number
                    </code>{" "}
                    attribute to elements containing phone numbers
                  </Step>
                </div>

                {/* Example code */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Example HTML</p>
                  <pre className="rounded-lg bg-muted p-4 text-sm font-mono overflow-x-auto whitespace-pre">{`<!-- Link with click-to-call -->
<a href="tel:+15551234567" data-leadtrack-number>
  (555) 123-4567
</a>

<!-- Plain text -->
<span data-leadtrack-number>(555) 123-4567</span>`}</pre>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium mb-2">How it works</p>
                  <p className="text-sm text-muted-foreground">
                    When a visitor loads the page, the snippet sends their UTM
                    parameters and GCLID to LeadTrack, which assigns a tracking
                    number from the DNI pool. The phone number on the page
                    swaps instantly. A session cookie tracks the visitor for 30
                    minutes — if they call the tracking number, the call is
                    attributed to their ad click.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {n}
      </span>
      <p className="text-sm pt-0.5">{children}</p>
    </div>
  );
}
