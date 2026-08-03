"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, MessageCircle, PlusCircle, RefreshCw, Search, ShieldOff } from "lucide-react";
import { useAdminAuth } from "@/lib/admin-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Flow AI licenses live in the Flow AI Cloudflare Worker (KV), not Supabase — this
// page calls /api/flowai (a Route Handler), which proxies to the Worker with the
// admin token held server-side. Successor to the standalone admin-portal app in
// the Flow AI repo.

// Trial presets mirror the Clients page pattern — a trial is simply a
// short-duration license (the Worker only knows durations, not trial types).
const TRIAL_PRESETS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3, recommended: true },
  { label: "7 days", days: 7 },
];

// wa.me only accepts digits — strip spaces, dashes, and the leading +.
function waMeLink(whatsapp) {
  return `https://wa.me/${String(whatsapp).replace(/\D/g, "")}`;
}

export default function FlowAiPage() {
  const { role, session } = useAdminAuth();
  const [licenses, setLicenses] = useState(null); // null = not loaded yet
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState(""); // license key currently being mutated
  const [createdLicense, setCreatedLicense] = useState(null); // shown once after create
  const [extendTarget, setExtendTarget] = useState(null);
  const [lookupOpen, setLookupOpen] = useState(false);

  const accessToken = session?.access_token;

  async function runAction(action, payload) {
    const response = await fetch("/api/flowai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, payload }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || `Request failed (${response.status})`);
    }
    return data;
  }

  async function loadLicenses() {
    setLoading(true);
    try {
      const data = await runAction("list", {});
      setLicenses((data.licenses ?? []).map(withComputedStatus));
    } catch (err) {
      setStatus(`Failed to load licenses: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (role !== "owner" || !accessToken) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLicenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, accessToken]);

  async function handleCreate(form) {
    try {
      const data = await runAction("create", form);
      setCreatedLicense({
        licenseKey: data.licenseKey,
        customerEmail: data.customerEmail,
        expiresAt: data.expiresAt,
        whatsapp: data.whatsapp,
      });
      setStatus(`Created license for ${data.customerEmail}.`);
      await loadLicenses();
    } catch (err) {
      setStatus(`Failed to create license: ${err.message}`);
    }
  }

  async function handleExtend({ months, days, note, whatsapp }) {
    try {
      const data = await runAction("extend", {
        licenseKey: extendTarget.licenseKey,
        months,
        days,
        note,
        whatsapp,
      });
      setStatus(`Extended ${data.customerEmail} — new expiry ${formatDate(data.expiresAt)}.`);
      setExtendTarget(null);
      await loadLicenses();
    } catch (err) {
      setStatus(`Failed to extend ${extendTarget.customerEmail}: ${err.message}`);
    }
  }

  async function handleRevoke(license) {
    if (
      !window.confirm(
        `Revoke the license for ${license.customerEmail}? Their extension stops working within ~5 minutes. This cannot be undone from here.`
      )
    ) {
      return;
    }
    setBusyKey(license.licenseKey);
    try {
      await runAction("revoke", { licenseKey: license.licenseKey });
      setStatus(`Revoked ${license.customerEmail}.`);
      await loadLicenses();
    } catch (err) {
      setStatus(`Failed to revoke ${license.customerEmail}: ${err.message}`);
    } finally {
      setBusyKey("");
    }
  }

  async function handleReset(license) {
    if (
      !window.confirm(
        `Reset activation for ${license.customerEmail}? This frees the key so the customer can activate on a new device.`
      )
    ) {
      return;
    }
    setBusyKey(license.licenseKey);
    try {
      await runAction("reset", { licenseKey: license.licenseKey });
      setStatus(`Activation reset for ${license.customerEmail}.`);
      await loadLicenses();
    } catch (err) {
      setStatus(`Failed to reset ${license.customerEmail}: ${err.message}`);
    } finally {
      setBusyKey("");
    }
  }

  async function handleLookup(subject) {
    const payload = subject.includes("@") ? { customerEmail: subject } : { licenseKey: subject };
    return withComputedStatus(await runAction("lookup", payload));
  }

  const sortedLicenses = useMemo(() => licenses ?? [], [licenses]);

  if (role !== "owner") {
    return (
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-semibold tracking-tight">Flow AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Flow AI license management is restricted to owners.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Flow AI</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manual licenses for Flow AI customers (JazzCash, EasyPaisa, bank transfer). Keys are
              stored in the Flow AI Worker — changes apply to extensions within ~5 minutes.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setLookupOpen(true)}>
              <Search className="size-3.5" />
              Lookup
            </Button>
            <Button variant="outline" onClick={loadLicenses} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        <CreateLicenseForm onCreate={handleCreate} />

        <Card className="mt-6 py-0">
          <Table>
            <TableHeader className="[&_th]:h-11 [&_th]:text-xs [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase">
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>License key</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Activated</TableHead>
                <TableHead>Note</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedLicenses.map((license) => {
                const busy = busyKey === license.licenseKey;
                return (
                  <TableRow key={license.licenseKey}>
                    <TableCell className="font-medium">{license.customerEmail}</TableCell>
                    <TableCell>
                      {license.whatsapp ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          nativeButton={false}
                          render={
                            <a
                              href={waMeLink(license.whatsapp)}
                              target="_blank"
                              rel="noreferrer"
                              title={`Chat on WhatsApp: ${license.whatsapp}`}
                            />
                          }
                        >
                          <MessageCircle style={{ color: "#0ca30c" }} />
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs text-muted-foreground">{license.licenseKey}</code>
                        <CopyButton text={license.licenseKey} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge license={license} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(license.expiresAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {license.instanceName || formatDate(license.activatedAt)}
                    </TableCell>
                    <TableCell
                      className="max-w-48 truncate text-muted-foreground"
                      title={license.note || ""}
                    >
                      {license.note || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || license.status !== "active"}
                          onClick={() => setExtendTarget(license)}
                        >
                          <PlusCircle className="size-3.5" />
                          Extend
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || !license.activatedAt}
                          onClick={() => handleReset(license)}
                        >
                          <RefreshCw className="size-3.5" />
                          Reset
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={busy || license.status !== "active"}
                          onClick={() => handleRevoke(license)}
                        >
                          <ShieldOff className="size-3.5" />
                          Revoke
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {licenses !== null && sortedLicenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No licenses yet. Create one above.
                  </TableCell>
                </TableRow>
              ) : null}
              {licenses === null ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Card>

        <p className="mt-3 min-h-[1.25rem] text-sm text-muted-foreground">{status}</p>
      </div>

      <CreatedLicenseDialog
        license={createdLicense}
        onOpenChange={(open) => {
          if (!open) setCreatedLicense(null);
        }}
      />
      <ExtendDialog
        license={extendTarget}
        onOpenChange={(open) => {
          if (!open) setExtendTarget(null);
        }}
        onExtend={handleExtend}
      />
      <LookupDialog open={lookupOpen} onOpenChange={setLookupOpen} onLookup={handleLookup} />
    </div>
  );
}

// Expiry must be computed outside render (Date.now() is impure there) — handlers
// stamp each record with isExpired when it arrives from the Worker.
function withComputedStatus(license) {
  const isExpired =
    license?.status === "active" &&
    Boolean(license?.expiresAt) &&
    Date.parse(license.expiresAt) <= Date.now();
  return { ...license, isExpired };
}

function StatusBadge({ license }) {
  if (license.status !== "active") {
    return <Badge variant="destructive">Revoked</Badge>;
  }
  if (license.isExpired) {
    return <Badge variant="outline">Expired</Badge>;
  }
  return <Badge variant="secondary">Active</Badge>;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="ghost" size="icon" className="size-6" onClick={handleCopy}>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CreateLicenseForm({ onCreate }) {
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState("months");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  function applyTrialPreset(days) {
    setUnit("days");
    setAmount(String(days));
    setNote((current) => current || "Trial");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setCreating(true);
    try {
      const parsed = Number(amount);
      const payload = {
        customerEmail: email.trim(),
        whatsapp: whatsapp.trim(),
        note: note.trim(),
      };
      if (unit === "months") payload.months = parsed;
      else payload.days = parsed;
      await onCreate(payload);
      setEmail("");
      setWhatsapp("");
      setAmount("1");
      setUnit("months");
      setNote("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_0.5fr_0.7fr_1fr_auto]"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flowai-email">Customer email</Label>
            <Input
              id="flowai-email"
              type="email"
              required
              placeholder="customer@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flowai-whatsapp">WhatsApp</Label>
            <Input
              id="flowai-whatsapp"
              type="tel"
              placeholder="+92 300 1234567"
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flowai-amount">Duration</Label>
            <Input
              id="flowai-amount"
              type="number"
              required
              min={1}
              max={unit === "months" ? 24 : 365}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flowai-unit">Unit</Label>
            <select
              id="flowai-unit"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              className="flex h-8 w-full items-center rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="months">Months</option>
              <option value="days">Days (trial)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="flowai-note">Note</Label>
            <Input
              id="flowai-note"
              type="text"
              placeholder="e.g. JazzCash receipt #123"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={creating}>
            <PlusCircle className="size-3.5" />
            Create
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Trial:</span>
          {TRIAL_PRESETS.map((preset) => (
            <Button
              key={preset.days}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyTrialPreset(preset.days)}
            >
              {preset.label}
              {preset.recommended ? " ★" : ""}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          One license per email — if the customer already has one, extend it from the table below.
        </p>
      </CardContent>
    </Card>
  );
}

// Shown once right after creating a license — the key is delivered to the customer
// manually (WhatsApp etc.), so it's built to be copied immediately, mirroring the
// NewCredentialsDialog on the Resellers page.
function CreatedLicenseDialog({ license, onOpenChange }) {
  return (
    <Dialog open={Boolean(license)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {license ? <CreatedLicenseContent key={license.licenseKey} license={license} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CreatedLicenseContent({ license }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(license.licenseKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>License for {license.customerEmail}</DialogTitle>
        <DialogDescription>
          Expires {formatDate(license.expiresAt)}. Send this key to the customer — they paste it
          into the extension&apos;s Pro upgrade dialog to activate.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-2">
        <Input readOnly value={license.licenseKey} className="font-mono" />
        <Button variant="outline" size="icon" onClick={handleCopy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
      {license.whatsapp ? (
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <a
              href={`${waMeLink(license.whatsapp)}?text=${encodeURIComponent(
                `Your Flow AI Pro license key: ${license.licenseKey}`
              )}`}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          <MessageCircle style={{ color: "#0ca30c" }} />
          Send key on WhatsApp
        </Button>
      ) : null}
    </>
  );
}

function ExtendDialog({ license, onOpenChange, onExtend }) {
  return (
    <Dialog open={Boolean(license)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {license ? (
          <ExtendDialogContent key={license.licenseKey} license={license} onExtend={onExtend} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// Keyed by licenseKey above so form state initializes per-license (WhatsApp
// pre-fill) and never leaks from a previously edited license.
function ExtendDialogContent({ license, onExtend }) {
  const [amount, setAmount] = useState("1");
  const [unit, setUnit] = useState("months");
  const [note, setNote] = useState("");
  const [whatsapp, setWhatsapp] = useState(license.whatsapp ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const parsed = Number(amount);
      await onExtend({
        months: unit === "months" ? parsed : undefined,
        days: unit === "days" ? parsed : undefined,
        note: note.trim(),
        whatsapp: whatsapp.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Extend {license.customerEmail}</DialogTitle>
        <DialogDescription>
          Current expiry {formatDate(license.expiresAt)} — the extension adds on top of it (or
          from today if already expired).
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            required
            min={1}
            max={unit === "months" ? 24 : 365}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            className="flex h-8 w-full items-center rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="months">Months</option>
            <option value="days">Days</option>
          </select>
        </div>
        <Input
          type="text"
          placeholder="Note (optional — replaces existing)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <Input
          type="tel"
          placeholder="WhatsApp (optional — replaces existing)"
          value={whatsapp}
          onChange={(event) => setWhatsapp(event.target.value)}
        />
        <Button type="submit" disabled={submitting}>
          Extend license
        </Button>
      </form>
    </>
  );
}

function LookupDialog({ open, onOpenChange, onLookup }) {
  const [subject, setSubject] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSearching(true);
    setError("");
    setResult(null);
    try {
      setResult(await onLookup(subject.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Lookup license</DialogTitle>
          <DialogDescription>Search by customer email or license key.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            autoFocus
            required
            placeholder="customer@example.com or FLOWAI-…"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
          <Button type="submit" disabled={searching}>
            <Search className="size-3.5" />
            Search
          </Button>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {result ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-border p-3 text-sm">
            <dt className="text-muted-foreground">Customer</dt>
            <dd className="font-medium">{result.customerEmail}</dd>
            <dt className="text-muted-foreground">WhatsApp</dt>
            <dd>
              {result.whatsapp ? (
                <a
                  href={waMeLink(result.whatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {result.whatsapp}
                </a>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-muted-foreground">Key</dt>
            <dd className="flex items-center gap-1.5 font-mono text-xs">
              {result.licenseKey}
              <CopyButton text={result.licenseKey} />
            </dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <StatusBadge license={result} />
            </dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{formatDate(result.createdAt)}</dd>
            <dt className="text-muted-foreground">Expires</dt>
            <dd>{formatDate(result.expiresAt)}</dd>
            <dt className="text-muted-foreground">Activated</dt>
            <dd>{result.instanceName || formatDate(result.activatedAt)}</dd>
            <dt className="text-muted-foreground">Note</dt>
            <dd>{result.note || "—"}</dd>
          </dl>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
