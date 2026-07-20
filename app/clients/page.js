"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Clock,
  CreditCard,
  LogIn,
  MessageCircle,
  MessageSquare,
  Trash2,
} from "lucide-react";
import { callRpc } from "@/lib/api";
import { useAdminAuth } from "@/lib/admin-auth";
import { useProfiles } from "@/lib/use-profiles";
import { FILTER_ORDER, SEGMENT_META, getSegmentKey } from "@/lib/profile-segments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

// Business rule: trials are capped at 24 hours (enforced again server-side in
// admin_start_trial). Within that ceiling, industry practice for short/hourly trials is
// to hand out the full allotted window by default — a 24h cap only converts well if the
// user reaches their "aha moment" before it lapses, so 24h (the max) is the recommended
// default rather than a stingier slice of it.
const MAX_TRIAL_HOURS = 24;
const TRIAL_PRESETS = [
  { label: "1 hour", minutes: 1 * 60 },
  { label: "6 hours", minutes: 6 * 60 },
  { label: "24 hours", minutes: 24 * 60, recommended: true },
];

const SUBSCRIPTION_DAYS = 30;

export default function ClientsPage() {
  return (
    <Suspense fallback={null}>
      <ClientsPageContent />
    </Suspense>
  );
}

function ClientsPageContent() {
  const { role } = useAdminAuth();
  const searchParams = useSearchParams();
  const { profiles, status, setStatus, loading, reload } = useProfiles();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => {
    const fromUrl = searchParams.get("status");
    return fromUrl && FILTER_ORDER.includes(fromUrl) ? fromUrl : "all";
  });
  const [resellerFilter, setResellerFilter] = useState("all");
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [selected, setSelected] = useState(new Set());

  async function handleAddOrUpdate(payload) {
    try {
      await callRpc("admin_add_or_update", payload);
      setStatus(`Saved ${payload.p_email}.`);
      await reload();
    } catch (err) {
      setStatus(`Failed to save ${payload.p_email}: ${err.message}`);
    }
  }

  async function handleStartTrial(email, durationMinutes) {
    try {
      await callRpc("admin_start_trial", { p_email: email, p_duration_minutes: durationMinutes });
      setStatus(durationMinutes ? `Trial started for ${email}.` : `Trial revoked for ${email}.`);
      await reload();
    } catch (err) {
      setStatus(`Failed to update trial for ${email}: ${err.message}`);
    }
  }

  async function handleStartSubscription(email, durationDays) {
    try {
      await callRpc("admin_start_subscription", { p_email: email, p_duration_days: durationDays });
      setStatus(durationDays ? `Subscription started for ${email}.` : `Subscription cancelled for ${email}.`);
      await reload();
    } catch (err) {
      setStatus(`Failed to update subscription for ${email}: ${err.message}`);
    }
  }

  async function handleRequestPaid(email) {
    try {
      await callRpc("request_paid_approval", { p_email: email });
      setStatus(`Requested paid access for ${email}.`);
      await reload();
    } catch (err) {
      setStatus(`Failed to request paid access for ${email}: ${err.message}`);
    }
  }

  async function handleApprovePaid(email) {
    try {
      await callRpc("approve_paid_request", { p_email: email });
      setStatus(`Approved paid access for ${email}.`);
      await reload();
    } catch (err) {
      setStatus(`Failed to approve ${email}: ${err.message}`);
    }
  }

  async function handleRejectPaid(email) {
    try {
      await callRpc("reject_paid_request", { p_email: email });
      setStatus(`Declined paid request for ${email}.`);
      await reload();
    } catch (err) {
      setStatus(`Failed to decline ${email}: ${err.message}`);
    }
  }

  async function handleDeleteProfile(email) {
    if (!window.confirm(`Delete ${email}? This cannot be undone.`)) return;
    try {
      await callRpc("admin_delete_profile", { p_email: email });
      setStatus(`Deleted ${email}.`);
      setSelectedEmail(null);
      await reload();
    } catch (err) {
      setStatus(`Failed to delete ${email}: ${err.message}`);
    }
  }

  function toggleSelect(email) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  async function handleBulkTrial(durationMinutes) {
    const emails = Array.from(selected);
    if (emails.length === 0) return;
    try {
      await callRpc("admin_bulk_start_trial", { p_emails: emails, p_duration_minutes: durationMinutes });
      setStatus(
        durationMinutes
          ? `Started trial for ${emails.length} client(s).`
          : `Revoked trial for ${emails.length} client(s).`
      );
      setSelected(new Set());
      await reload();
    } catch (err) {
      setStatus(`Bulk trial update failed: ${err.message}`);
    }
  }

  async function handleBulkSubscription(durationDays) {
    const emails = Array.from(selected);
    if (emails.length === 0) return;
    try {
      await callRpc("admin_bulk_start_subscription", { p_emails: emails, p_duration_days: durationDays });
      setStatus(
        durationDays
          ? `Started subscription for ${emails.length} client(s).`
          : `Cancelled subscription for ${emails.length} client(s).`
      );
      setSelected(new Set());
      await reload();
    } catch (err) {
      setStatus(`Bulk subscription update failed: ${err.message}`);
    }
  }

  async function handleBulkSetPaid(paid) {
    const emails = Array.from(selected);
    if (emails.length === 0) return;
    try {
      await callRpc("admin_bulk_set_paid", { p_emails: emails, p_paid: paid });
      setStatus(`Marked ${emails.length} client(s) as ${paid ? "paid" : "unpaid"}.`);
      setSelected(new Set());
      await reload();
    } catch (err) {
      setStatus(`Bulk paid update failed: ${err.message}`);
    }
  }

  async function handleBulkDelete() {
    const emails = Array.from(selected);
    if (emails.length === 0) return;
    if (!window.confirm(`Delete ${emails.length} selected client(s)? This cannot be undone.`)) return;
    try {
      await callRpc("admin_bulk_delete_profiles", { p_emails: emails });
      setStatus(`Deleted ${emails.length} client(s).`);
      setSelected(new Set());
      await reload();
    } catch (err) {
      setStatus(`Bulk delete failed: ${err.message}`);
    }
  }

  const withSegment = useMemo(
    () => profiles.map((profile) => ({ ...profile, segmentKey: getSegmentKey(profile) })),
    [profiles]
  );

  const resellerOptions = useMemo(() => {
    const map = new Map();
    for (const profile of withSegment) {
      const value = profile.owner_id ?? "direct";
      if (!map.has(value)) map.set(value, profile.added_by_label);
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [withSegment]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withSegment.filter((profile) => {
      const matchesStatus = statusFilter === "all" || profile.segmentKey === statusFilter;
      const matchesReseller =
        resellerFilter === "all" || (profile.owner_id ?? "direct") === resellerFilter;
      const matchesQuery =
        !q ||
        profile.email.toLowerCase().includes(q) ||
        (profile.whatsapp_number ?? "").toLowerCase().includes(q) ||
        (profile.payment_note ?? "").toLowerCase().includes(q);
      return matchesStatus && matchesReseller && matchesQuery;
    });
  }, [withSegment, statusFilter, resellerFilter, query]);

  function toggleSelectAllVisible() {
    setSelected((prev) => {
      const allSelected = filtered.length > 0 && filtered.every((profile) => prev.has(profile.email));
      const next = new Set(prev);
      for (const profile of filtered) {
        if (allSelected) next.delete(profile.email);
        else next.add(profile.email);
      }
      return next;
    });
  }

  const selectedProfile = withSegment.find((profile) => profile.email === selectedEmail) ?? null;
  const statusLabel = FILTER_ORDER.includes(statusFilter) ? SEGMENT_META[statusFilter]?.label ?? "All" : "All";

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {role === "owner"
                ? "Nobody gets access until added here. Grant a timed trial, or mark paid for unlimited."
                : "Add your clients here and grant timed trials. Paid access needs the owner's approval."}
            </p>
          </div>
          <Button variant="outline" onClick={reload}>
            Refresh
          </Button>
        </div>

        <AddForm onSave={handleAddOrUpdate} />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            type="search"
            placeholder="Search by email, WhatsApp, or note…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="max-w-sm"
          />
          {statusFilter !== "all" ? (
            <Badge variant="outline" className="gap-1">
              {statusLabel}
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-foreground"
                onClick={() => setStatusFilter("all")}
                aria-label="Clear status filter"
              >
                ×
              </button>
            </Badge>
          ) : null}
          {role === "owner" && resellerOptions.length > 1 ? (
            <Select value={resellerFilter} onValueChange={setResellerFilter}>
              <SelectTrigger className="w-48">
                <SelectValue>
                  {(value) =>
                    value === "all"
                      ? "Added by: anyone"
                      : resellerOptions.find((option) => option.value === value)?.label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Added by: anyone</SelectItem>
                {resellerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        {selected.size > 0 ? (
          <Card className="mt-4 py-3">
            <CardContent className="flex flex-wrap items-center gap-2 px-4">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleBulkSubscription(SUBSCRIPTION_DAYS)}>
                  Subscribe {SUBSCRIPTION_DAYS} days
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkSubscription(null)}>
                  Cancel subscription
                </Button>
                {TRIAL_PRESETS.map((preset) => (
                  <Button
                    key={preset.minutes}
                    variant="secondary"
                    size="sm"
                    onClick={() => handleBulkTrial(preset.minutes)}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Button variant="outline" size="sm" onClick={() => handleBulkTrial(null)}>
                  Revoke trial
                </Button>
                {role === "owner" ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => handleBulkSetPaid(true)}>
                      Mark paid
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleBulkSetPaid(false)}>
                      Mark unpaid
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card className="mt-4 py-0">
          <Table>
            <TableHeader className="[&_th]:h-11 [&_th]:text-xs [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && filtered.every((profile) => selected.has(profile.email))}
                    onCheckedChange={toggleSelectAllVisible}
                  />
                </TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                {role === "owner" ? <TableHead>Added by</TableHead> : null}
                <TableHead>Prompts used</TableHead>
                <TableHead>Last login</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((profile) => (
                <ProfileRow
                  key={profile.email}
                  profile={profile}
                  showAddedBy={role === "owner"}
                  selected={selected.has(profile.email)}
                  onToggleSelect={toggleSelect}
                  onClick={() => setSelectedEmail(profile.email)}
                />
              ))}
              {!loading && filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={role === "owner" ? 6 : 5}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {profiles.length === 0
                      ? "No emails yet. Add one above."
                      : "No profiles match this filter."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Card>

        <p className="mt-3 min-h-[1.25rem] text-sm text-muted-foreground">
          {status} {filtered.length !== profiles.length ? `(${filtered.length} shown)` : ""}
        </p>
      </div>

      <ProfileDetailDialog
        profile={selectedProfile}
        open={Boolean(selectedProfile)}
        onOpenChange={(open) => {
          if (!open) setSelectedEmail(null);
        }}
        role={role}
        onSave={handleAddOrUpdate}
        onStartTrial={handleStartTrial}
        onStartSubscription={handleStartSubscription}
        onRequestPaid={handleRequestPaid}
        onApprovePaid={handleApprovePaid}
        onRejectPaid={handleRejectPaid}
        onDelete={handleDeleteProfile}
      />
    </div>
  );
}

function AddForm({ onSave }) {
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [note, setNote] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const value = email.trim();
    if (!value) return;
    await onSave({
      p_email: value,
      p_whatsapp: whatsapp.trim() || null,
      p_note: note || null,
    });
    setEmail("");
    setWhatsapp("");
    setNote("");
  }

  return (
    <Card className="mt-6">
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1.4fr_auto]"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-email">Email</Label>
            <Input
              id="add-email"
              type="email"
              required
              placeholder="user@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-whatsapp">WhatsApp</Label>
            <Input
              id="add-whatsapp"
              type="tel"
              placeholder="923001234567"
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-note">Note</Label>
            <Input
              id="add-note"
              type="text"
              placeholder="e.g. Easypaisa Rs.2800 - 2026-07-20"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Button type="submit">Save</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ProfileRow({ profile, showAddedBy, selected, onToggleSelect, onClick }) {
  const segmentKey = getSegmentKey(profile);
  const meta = SEGMENT_META[segmentKey];
  const SegmentIcon = meta.icon;

  return (
    <TableRow onClick={onClick} className="cursor-pointer">
      <TableCell onClick={(event) => event.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(profile.email)} />
      </TableCell>
      <TableCell className="font-medium">{profile.email}</TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <Badge
            variant="outline"
            className="w-fit gap-1"
            style={
              meta.color
                ? { color: meta.color, borderColor: `${meta.color}4d`, backgroundColor: `${meta.color}1f` }
                : undefined
            }
          >
            <SegmentIcon className="size-3" />
            {meta.label}
          </Badge>
          {segmentKey === "subscription_active" || segmentKey === "subscription_expired" ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatCountdown(profile.subscription_expires_at)}
            </span>
          ) : profile.trial_ends_at ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatCountdown(profile.trial_ends_at)}
            </span>
          ) : null}
        </div>
      </TableCell>
      {showAddedBy ? (
        <TableCell className="text-muted-foreground">{profile.added_by_label}</TableCell>
      ) : null}
      <TableCell className="tabular-nums text-muted-foreground">
        {profile.prompt_count ?? 0}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {profile.last_login_at ? formatDateTime(profile.last_login_at) : "never"}
      </TableCell>
    </TableRow>
  );
}

function ProfileDetailDialog({
  profile,
  open,
  onOpenChange,
  role,
  onSave,
  onStartTrial,
  onStartSubscription,
  onRequestPaid,
  onApprovePaid,
  onRejectPaid,
  onDelete,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {profile ? (
          <ProfileDetailForm
            // Remount whenever a server-driven field changes via an action button
            // (approve/reject paid, grant/revoke trial, start/cancel subscription) so the
            // form's local state — which only needs to track in-progress typing for
            // WhatsApp/note — doesn't go stale relative to the prop. Typing itself never
            // touches these fields, so it doesn't remount mid-keystroke.
            key={`${profile.email}:${profile.is_paid}:${profile.paid_requested_at}:${profile.trial_started_at}:${profile.trial_duration_minutes}:${profile.subscription_started_at}:${profile.subscription_expires_at}`}
            profile={profile}
            role={role}
            onSave={onSave}
            onStartTrial={onStartTrial}
            onStartSubscription={onStartSubscription}
            onRequestPaid={onRequestPaid}
            onApprovePaid={onApprovePaid}
            onRejectPaid={onRejectPaid}
            onDelete={onDelete}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// Keyed by profile.email in the parent so switching rows remounts this component,
// which re-initializes local state from the new profile without needing an effect.
function ProfileDetailForm({
  profile,
  role,
  onSave,
  onStartTrial,
  onStartSubscription,
  onRequestPaid,
  onApprovePaid,
  onRejectPaid,
  onDelete,
}) {
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp_number ?? "");
  const [paid, setPaid] = useState(Boolean(profile.is_paid));
  const [note, setNote] = useState(profile.payment_note ?? "");
  const [customHours, setCustomHours] = useState("");
  const [customDays, setCustomDays] = useState("");

  // Ticks the trial/subscription progress bar / countdown text forward while the dialog is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const save = (overrides) =>
    onSave({
      p_email: profile.email,
      p_whatsapp: whatsapp.trim() || null,
      p_note: note || null,
      ...overrides,
    });

  const grantTrial = (minutes) => onStartTrial(profile.email, minutes);
  const grantSubscription = (days) => onStartSubscription(profile.email, days);

  const segmentKey = getSegmentKey(profile);
  const meta = SEGMENT_META[segmentKey];
  const SegmentIcon = meta.icon;
  const waDigits = whatsapp.replace(/\D/g, "");
  const isOwner = role === "owner";
  const isPendingApproval = Boolean(profile.paid_requested_at) && !profile.is_paid;

  const trialStartMs = profile.trial_started_at ? new Date(profile.trial_started_at).getTime() : null;
  const trialDurationMs = (profile.trial_duration_minutes ?? 0) * 60_000;
  const trialPercentElapsed =
    trialStartMs && trialDurationMs
      ? Math.min(100, Math.max(0, ((now - trialStartMs) / trialDurationMs) * 100))
      : null;

  const subStartMs = profile.subscription_started_at
    ? new Date(profile.subscription_started_at).getTime()
    : null;
  const subEndMs = profile.subscription_expires_at
    ? new Date(profile.subscription_expires_at).getTime()
    : null;
  const subscriptionPercentElapsed =
    subStartMs && subEndMs && subEndMs > subStartMs
      ? Math.min(100, Math.max(0, ((now - subStartMs) / (subEndMs - subStartMs)) * 100))
      : null;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-all">{profile.email}</DialogTitle>
        <DialogDescription>
          First seen {profile.created_at ? formatDateTime(profile.created_at) : "—"}
          {role === "owner" ? ` · Added by ${profile.added_by_label}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <Badge
                variant="outline"
                className="w-fit gap-1"
                style={
                  meta.color
                    ? { color: meta.color, borderColor: `${meta.color}4d`, backgroundColor: `${meta.color}1f` }
                    : undefined
                }
              >
                <SegmentIcon className="size-3" />
                {meta.label}
              </Badge>
              <div className="flex flex-wrap gap-4 pt-1">
                {profile.subscription_expires_at && subscriptionPercentElapsed !== null ? (
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <CreditCard className="size-3" style={{ color: "#7c5cff" }} />
                      Subscription
                    </span>
                    <Progress value={subscriptionPercentElapsed} className="w-32" />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatCountdown(profile.subscription_expires_at, now)}
                    </span>
                  </div>
                ) : null}
                {profile.trial_ends_at && trialPercentElapsed !== null ? (
                  <div className="flex flex-col gap-1">
                    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <Clock className="size-3" style={{ color: "#fab219" }} />
                      Trial
                    </span>
                    <Progress value={trialPercentElapsed} className="w-32" />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatCountdown(profile.trial_ends_at, now)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex gap-2 text-sm">
              <div className="flex flex-col items-center gap-1 rounded-lg border p-2">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MessageSquare className="size-3" />
                  Prompts used
                </span>
                <span className="tabular-nums font-medium">{profile.prompt_count ?? 0}</span>
              </div>
              <div className="flex flex-col items-center gap-1 rounded-lg border p-2">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <LogIn className="size-3" />
                  Last login
                </span>
                <span className="font-medium">
                  {profile.last_login_at ? formatDateTime(profile.last_login_at) : "never"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detail-whatsapp">WhatsApp</Label>
              <div className="flex items-center gap-1">
                <Input
                  id="detail-whatsapp"
                  type="tel"
                  placeholder="923001234567"
                  value={whatsapp}
                  onChange={(event) => setWhatsapp(event.target.value)}
                  onBlur={() => save({})}
                />
                {waDigits ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    nativeButton={false}
                    render={
                      <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noreferrer" />
                    }
                  >
                    <MessageCircle style={{ color: "#0ca30c" }} />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detail-note">Note</Label>
              <Input
                id="detail-note"
                type="text"
                placeholder="e.g. Easypaisa Rs.2800 - 2026-07-20"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onBlur={() => save({})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <Label>Paid access</Label>
              {isOwner ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="detail-paid"
                      checked={paid}
                      onCheckedChange={(checked) => {
                        setPaid(checked);
                        save({ p_paid: checked });
                      }}
                    />
                    <Label htmlFor="detail-paid" className="text-sm font-normal">
                      Paid (unlimited)
                    </Label>
                  </div>
                  {isPendingApproval ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={() => onRejectPaid(profile.email)}>
                        Decline
                      </Button>
                      <Button size="sm" onClick={() => onApprovePaid(profile.email)}>
                        Approve
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : profile.is_paid ? (
                <p className="text-sm text-muted-foreground">Already has paid access.</p>
              ) : isPendingApproval ? (
                <p className="text-sm text-muted-foreground">Requested — waiting on the owner to approve.</p>
              ) : (
                <Button size="sm" variant="secondary" className="w-fit" onClick={() => onRequestPaid(profile.email)}>
                  Request paid access
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <Label className="flex items-center gap-1.5">
                <CreditCard className="size-3.5" style={{ color: "#7c5cff" }} />
                Subscription
              </Label>
              <p className="text-xs text-muted-foreground">Renewing resets the countdown to now.</p>
              <Button size="sm" className="w-fit" onClick={() => grantSubscription(SUBSCRIPTION_DAYS)}>
                {profile.subscription_started_at ? "Renew" : "Subscribe"} {SUBSCRIPTION_DAYS} days
              </Button>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Custom days"
                  value={customDays}
                  onChange={(event) => setCustomDays(event.target.value)}
                  className="w-28"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!customDays || Number(customDays) <= 0}
                  onClick={() => grantSubscription(Math.round(Number(customDays)))}
                >
                  Start
                </Button>
              </div>
              {profile.subscription_started_at ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-fit"
                  onClick={() => grantSubscription(null)}
                >
                  Cancel subscription
                </Button>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <Label className="flex items-center gap-1.5">
                <Clock className="size-3.5" style={{ color: "#fab219" }} />
                Trial
              </Label>
              <p className="text-xs text-muted-foreground">
                Resets the countdown to now. Capped at {MAX_TRIAL_HOURS}h.
              </p>
              <div className="flex flex-wrap gap-2">
                {TRIAL_PRESETS.map((preset) => (
                  <Button
                    key={preset.minutes}
                    variant={preset.recommended ? "default" : "secondary"}
                    size="sm"
                    onClick={() => grantTrial(preset.minutes)}
                  >
                    {preset.label}
                    {preset.recommended ? (
                      <span className="text-xs opacity-70">(recommended)</span>
                    ) : null}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max={MAX_TRIAL_HOURS}
                  step="0.5"
                  placeholder="Custom hours"
                  value={customHours}
                  onChange={(event) => setCustomHours(event.target.value)}
                  className="w-28"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!customHours || Number(customHours) <= 0}
                  onClick={() =>
                    grantTrial(Math.round(Math.min(MAX_TRIAL_HOURS, Number(customHours)) * 60))
                  }
                >
                  Start
                </Button>
              </div>
              {profile.trial_started_at ? (
                <Button variant="destructive" size="sm" className="w-fit" onClick={() => grantTrial(null)}>
                  Revoke trial
                </Button>
              ) : null}
            </div>
          </div>

          {isOwner ? (
            <div className="flex flex-col gap-2 border-t pt-4">
              <Button
                variant="destructive"
                size="sm"
                className="w-fit"
                onClick={() => onDelete(profile.email)}
              >
                <Trash2 className="size-3.5" />
                Delete email
              </Button>
            </div>
          ) : null}
        </div>
    </>
  );
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Under 24h: "Xh Ym" (matches how short trials are already granted/read).
// 24h or more: "Dd Hh Mm" — raw hours past 24 are hard to read at a glance (e.g. "119h 18m"),
// so once a full day is crossed, break it into days + hours + minutes.
function formatCountdown(trialEndsAtIso, now = Date.now()) {
  const diffMs = new Date(trialEndsAtIso).getTime() - now;
  const abs = Math.abs(diffMs);
  const totalMinutes = Math.floor(abs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const text = days > 0 ? `${days}d ${hours}h ${minutes}m` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return diffMs > 0 ? `${text} left` : `expired ${text} ago`;
}
