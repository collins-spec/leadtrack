"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

const DEFAULT_PHONE = "(555) 123-4567";

function TestLandingContent() {
  const searchParams = useSearchParams();
  const accountId = searchParams.get("accountId") || "";
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState({
    visitorId: "",
    sessionToken: "",
    currentNumber: DEFAULT_PHONE,
    snippetLoaded: false,
  });

  // Inject the LeadTrack snippet
  useEffect(() => {
    if (!accountId) return;
    const apiBase = (
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
    ).replace(/\/api$/, "");

    const script = document.createElement("script");
    script.src = `${apiBase}/api/snippet/${accountId}`;
    script.async = true;
    script.onload = () =>
      setDebugInfo((prev) => ({ ...prev, snippetLoaded: true }));
    document.body.appendChild(script);

    return () => {
      try {
        document.body.removeChild(script);
      } catch {
        /* already removed */
      }
    };
  }, [accountId]);

  // Poll debug info
  useEffect(() => {
    if (!debugOpen) return;
    const interval = setInterval(() => {
      const el = document.querySelector("[data-leadtrack-number]");
      setDebugInfo((prev) => ({
        ...prev,
        visitorId: localStorage.getItem("_lt_vid") || "(none)",
        sessionToken: document.cookie
          .split("; ")
          .find((c) => c.startsWith("_lt_session="))
          ?.split("=")[1] || "(none)",
        currentNumber: el?.textContent?.trim() || DEFAULT_PHONE,
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [debugOpen]);

  const buildUrl = useCallback(
    (params: Record<string, string>) => {
      const base = `/test-landing?accountId=${accountId}`;
      const qs = Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");
      return qs ? `${base}&${qs}` : base;
    },
    [accountId]
  );

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // Let snippet capture the form first (it listens in capture phase)
    // Then prevent default navigation
    e.preventDefault();
    setFormSubmitted(true);
    setTimeout(() => setFormSubmitted(false), 4000);
  };

  if (!accountId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Missing Account ID
          </h1>
          <p className="text-gray-600">
            This test page requires an <code className="bg-gray-200 px-1.5 py-0.5 rounded text-sm">accountId</code> query parameter.
          </p>
          <p className="text-gray-600 text-sm">
            Go to <strong>Integration</strong> in your LeadTrack dashboard and
            click <strong>&quot;Open Test Page&quot;</strong> to launch this page
            with the correct account.
          </p>
        </div>
      </div>
    );
  }

  const utmLinks: { label: string; color: string; params: Record<string, string> }[] = [
    {
      label: "Google Ads",
      color: "bg-blue-600 hover:bg-blue-700",
      params: {
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "hvac-repair",
        utm_term: "ac+repair+near+me",
        gclid: "test-gclid-abc123xyz",
      },
    },
    {
      label: "Facebook Ads",
      color: "bg-indigo-600 hover:bg-indigo-700",
      params: {
        utm_source: "facebook",
        utm_medium: "cpc",
        utm_campaign: "summer-sale",
      },
    },
    {
      label: "Bing Ads",
      color: "bg-teal-600 hover:bg-teal-700",
      params: {
        utm_source: "bing",
        utm_medium: "cpc",
        utm_campaign: "emergency-service",
      },
    },
    {
      label: "Direct / Organic",
      color: "bg-gray-600 hover:bg-gray-700",
      params: {},
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center font-bold text-sm">
              CA
            </div>
            <span className="font-bold text-lg">Cool Air HVAC</span>
          </div>
          <a
            href="tel:+15551234567"
            data-leadtrack-number
            className="text-lg font-semibold hover:text-orange-400 transition-colors"
          >
            {DEFAULT_PHONE}
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-800 to-slate-900 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold leading-tight">
            Professional HVAC Services
            <br />
            You Can Trust
          </h1>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            24/7 emergency repairs, installations, and maintenance. Licensed and
            insured technicians serving your area for over 15 years.
          </p>
          <a
            href="tel:+15551234567"
            data-leadtrack-number
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-lg text-lg transition-colors"
          >
            Call Now: {DEFAULT_PHONE}
          </a>
        </div>
      </section>

      {/* UTM Test Links */}
      <section className="bg-amber-50 border-y border-amber-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <p className="text-sm font-medium text-amber-800 mb-3 text-center">
            Test Traffic Sources — click a source to simulate a visitor from that channel:
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {utmLinks.map((link) => (
              <a
                key={link.label}
                href={buildUrl(link.params)}
                className={`${link.color} text-white text-sm font-medium py-2 px-4 rounded-md transition-colors`}
              >
                {link.label}
              </a>
            ))}
          </div>
          {searchParams.get("utm_source") && (
            <p className="text-xs text-amber-700 text-center mt-3">
              Current source:{" "}
              <strong>{searchParams.get("utm_source")}</strong> /{" "}
              {searchParams.get("utm_medium") || "—"} /{" "}
              {searchParams.get("utm_campaign") || "—"}
              {searchParams.get("gclid") && (
                <span className="ml-2">
                  (gclid: {searchParams.get("gclid")})
                </span>
              )}
            </p>
          )}
        </div>
      </section>

      {/* Services + Contact Form */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4 grid md:grid-cols-2 gap-12">
          {/* Services */}
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-900">Our Services</h2>
            {[
              {
                title: "AC Repair",
                desc: "Fast diagnosis and repair of all air conditioning systems.",
              },
              {
                title: "Heating Systems",
                desc: "Furnace repair, heat pump installation, and maintenance.",
              },
              {
                title: "Installation",
                desc: "New HVAC system installation with warranty coverage.",
              },
              {
                title: "Maintenance Plans",
                desc: "Preventive maintenance to keep your system running efficiently.",
              },
            ].map((svc) => (
              <div key={svc.title} className="flex gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                  <span className="text-orange-600 font-bold text-sm">
                    {svc.title[0]}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{svc.title}</h3>
                  <p className="text-sm text-gray-600">{svc.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Contact Form */}
          <div>
            <div className="bg-gray-50 rounded-xl p-6 border">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">
                Request a Free Quote
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Fill out the form and we&apos;ll get back to you within the
                hour.
              </p>

              {formSubmitted ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                  <p className="text-green-800 font-medium">
                    Form submitted! Check your LeadTrack dashboard.
                  </p>
                  <p className="text-green-600 text-sm mt-1">
                    The snippet captured this submission automatically.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      name="name"
                      placeholder="John Smith"
                      required
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      placeholder="john@example.com"
                      required
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      placeholder="(555) 987-6543"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Message
                    </label>
                    <textarea
                      name="message"
                      rows={3}
                      placeholder="Describe your HVAC issue..."
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2.5 rounded-md transition-colors"
                  >
                    Get Free Quote
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-8">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-slate-400 text-sm">
            &copy; 2026 Cool Air HVAC. This is a test landing page for
            LeadTrack.
          </p>
          <a
            href="tel:+15551234567"
            data-leadtrack-number
            className="text-lg font-semibold hover:text-orange-400 transition-colors"
          >
            {DEFAULT_PHONE}
          </a>
        </div>
      </footer>

      {/* Debug Panel */}
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setDebugOpen(!debugOpen)}
          className="bg-gray-900 text-white text-xs font-mono py-1.5 px-3 rounded-md shadow-lg hover:bg-gray-800 transition-colors"
        >
          {debugOpen ? "Close Debug" : "Debug Panel"}
        </button>
        {debugOpen && (
          <div className="absolute bottom-10 right-0 w-80 bg-gray-900 text-green-400 font-mono text-xs rounded-lg shadow-2xl p-4 space-y-2">
            <p className="text-gray-400 font-bold uppercase text-[10px] tracking-wider">
              LeadTrack Debug
            </p>
            <div className="space-y-1.5">
              <Row label="Account ID" value={accountId} />
              <Row
                label="Snippet"
                value={debugInfo.snippetLoaded ? "Loaded" : "Pending..."}
              />
              <Row label="Visitor ID" value={debugInfo.visitorId} />
              <Row label="Session" value={debugInfo.sessionToken} />
              <Row label="Phone Shown" value={debugInfo.currentNumber} />
              <Row
                label="Number Swapped"
                value={
                  debugInfo.currentNumber !== DEFAULT_PHONE ? "Yes" : "No"
                }
              />
              <Row
                label="UTM Source"
                value={searchParams.get("utm_source") || "(none)"}
              />
              <Row
                label="UTM Campaign"
                value={searchParams.get("utm_campaign") || "(none)"}
              />
              <Row
                label="GCLID"
                value={searchParams.get("gclid") || "(none)"}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 shrink-0">{label}:</span>
      <span className="text-green-400 truncate">{value}</span>
    </div>
  );
}

export default function TestLandingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      }
    >
      <TestLandingContent />
    </Suspense>
  );
}
