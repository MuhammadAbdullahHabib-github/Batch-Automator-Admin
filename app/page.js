"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Hourglass,
  MessageCircle,
  Sparkles,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { callRpc } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/lib/admin-auth";
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

// Fixed status colors (never themed) — always paired with an icon + label, never color alone.
const SEGMENT_META = {
  pending_approval: { label: "Pending approval", icon: Hourglass, color: "#2a78d6" },
  trial_active: { label: "Trial active", icon: Clock, color: "#fab219" },
  trial_expired: { label: "Trial expired", icon: AlertTriangle, color: "#ec835a" },
  converted: { label: "Converted from trial", icon: CheckCircle2, color: "#0ca30c" },
  direct: { label: "Direct purchase", icon: Wallet, color: "#0ca30c" },
  new: { label: "No trial yet", icon: Sparkles, color: null },
};

const FILTER_ORDER = [
  "all",
  "pending_approval",
  "trial_active",
  "trial_expired",
  "converted",
  "direct",
  "new",
];
const FILTER_META = {
  all: { label: "All", icon: Users, color: null },
  ...SEGMENT_META,
};

export default function ClientsPage() {
  const { role } = useAdminAuth();
  const [profiles, setProfiles] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [resellerFilter, setResellerFilter] = useState("all");
  const [selectedEmail, setSelectedEmail] = useState(null);

  async function loadProfiles() {
    setLoading(true);
    setStatus("Loading...");
    try {
      const rows = await callRpc("admin_list_profiles");
      setProfiles(rows ?? []);
      setStatus(`${rows?.length ?? 0} email(s).`);
    } catch (err) {
      setStatus(`Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfiles();
  }, []);

  async function handleAddOrUpdate(payload) {
    try {
      await callRpc("admin_add_or_update", payload);
      setStatus(`Saved ${payload.p_email}.`);
      await loadProfiles();
    } catch (err) {
      setStatus(`Failed to save ${payload.p_email}: ${err.message}`);
    }
  }

  async function handleStartTrial(email, durationMinutes) {
    try {
      await callRpc("admin_start_trial", { p_email: email, p_duration_minutes: durationMinutes });
      setStatus(durationMinutes ? `Trial started for ${email}.` : `Trial revoked for ${email}.`);
      await loadProfiles();
    } catch (err) {
      setStatus(`Failed to update trial for ${email}: ${err.message}`);
    }
  }

  async function handleRequestPaid(email) {
    try {
      await callRpc("request_paid_approval", { p_email: email });
      setStatus(`Requested paid access for ${email}.`);
      await loadProfiles();
    } catch (err) {
      setStatus(`Failed to request paid access for ${email}: ${err.message}`);
    }
  }

  async function handleApprovePaid(email) {
    try {
      await callRpc("approve_paid_request", { p_email: email });
      setStatus(`Approved paid access for ${email}.`);
      await loadProfiles();
    } catch (err) {
      setStatus(`Failed to approve ${email}: ${err.message}`);
    }
  }

  async function handleRejectPaid(email) {
    try {
      await callRpc("reject_paid_request", { p_email: email });
      setStatus(`Declined paid request for ${email}.`);
      await loadProfiles();
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
      await loadProfiles();
    } catch (err) {
      setStatus(`Failed to delete ${email}: ${err.message}`);
    }
  }

  const withSegment = useMemo(
    () => profiles.map((profile) => ({ ...profile, segmentKey: getSegmentKey(profile) })),
    [profiles]
  );

  const counts = useMemo(() => {
    const base = Object.fromEntries(FILTER_ORDER.map((key) => [key, 0]));
    base.all = withSegment.length;
    for (const profile of withSegment) base[profile.segmentKey] += 1;
    return base;
  }, [withSegment]);

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

  const selectedProfile = withSegment.find((profile) => profile.email === selectedEmail) ?? null;

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
          <Button variant="outline" onClick={loadProfiles}>
            Refresh
          </Button>
        </div>

        <AddForm onSave={handleAddOrUpdate} />

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {FILTER_ORDER.map((key) => (
            <StatTile
              key={key}
              filterKey={key}
              count={counts[key]}
              active={statusFilter === key}
              onClick={() => setStatusFilter(key)}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Input
            type="search"
            placeholder="Search by email, WhatsApp, or note…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="max-w-sm"
          />
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

        <Card className="mt-4 py-0">
          <Table>
            <TableHeader className="[&_th]:h-11 [&_th]:text-xs [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase">
              <TableRow>
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
                  onClick={() => setSelectedEmail(profile.email)}
                />
              ))}
              {!loading && filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={role === "owner" ? 5 : 4}
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
        onRequestPaid={handleRequestPaid}
        onApprovePaid={handleApprovePaid}
        onRejectPaid={handleRejectPaid}
        onDelete={handleDeleteProfile}
      />
    </div>
  );
}

function StatTile({ filterKey, count, active, onClick }) {
  const meta = FILTER_META[filterKey];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3 text-left ring-1 ring-transparent transition-colors",
        active
          ? "border-foreground/20 bg-muted ring-foreground/10"
          : "border-border bg-card hover:bg-muted/60"
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" style={meta.color ? { color: meta.color } : undefined} />
        {meta.label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{count}</div>
    </button>
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

function ProfileRow({ profile, showAddedBy, onClick }) {
  const segmentKey = getSegmentKey(profile);
  const meta = SEGMENT_META[segmentKey];
  const SegmentIcon = meta.icon;

  return (
    <TableRow onClick={onClick} className="cursor-pointer">
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
          {profile.trial_ends_at ? (
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
  onRequestPaid,
  onApprovePaid,
  onRejectPaid,
  onDelete,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {profile ? (
          <ProfileDetailForm
            // Remount whenever a server-driven field changes via an action button
            // (approve/reject paid, grant/revoke trial) so the form's local state —
            // which only needs to track in-progress typing for WhatsApp/note — doesn't
            // go stale relative to the prop. Typing itself never touches these fields,
            // so it doesn't remount mid-keystroke.
            key={`${profile.email}:${profile.is_paid}:${profile.paid_requested_at}:${profile.trial_started_at}:${profile.trial_duration_minutes}`}
            profile={profile}
            role={role}
            onSave={onSave}
            onStartTrial={onStartTrial}
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
  onRequestPaid,
  onApprovePaid,
  onRejectPaid,
  onDelete,
}) {
  const [whatsapp, setWhatsapp] = useState(profile.whatsapp_number ?? "");
  const [paid, setPaid] = useState(Boolean(profile.is_paid));
  const [note, setNote] = useState(profile.payment_note ?? "");
  const [customHours, setCustomHours] = useState("");

  // Ticks the trial progress bar / countdown text forward while the dialog is open.
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

  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-all">{profile.email}</DialogTitle>
        <DialogDescription>
          First seen {profile.created_at ? formatDateTime(profile.created_at) : "—"}
          {role === "owner" ? ` · Added by ${profile.added_by_label}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
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
              {profile.trial_ends_at && trialPercentElapsed !== null ? (
                <div className="flex flex-col gap-1 pt-1">
                  <Progress value={trialPercentElapsed} className="w-32" />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatCountdown(profile.trial_ends_at, now)}
                  </span>
                </div>
              ) : null}
            </div>
            <div className="flex gap-4 text-right text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Prompts used</div>
                <div className="tabular-nums">{profile.prompt_count ?? 0}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Last login</div>
                <div>{profile.last_login_at ? formatDateTime(profile.last_login_at) : "never"}</div>
              </div>
            </div>
          </div>

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

          <div className="flex flex-col gap-2 border-t pt-4">
            <Label>Paid access</Label>
            {isOwner ? (
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
                {isPendingApproval ? (
                  <div className="ml-auto flex gap-2">
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

          <div className="flex flex-col gap-2 border-t pt-4">
            <Label>Trial</Label>
            <p className="text-xs text-muted-foreground">
              Starting or extending resets the countdown to now. Capped at {MAX_TRIAL_HOURS}{" "}
              hours.
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
                className="w-32"
              />
              <Button
                size="sm"
                disabled={!customHours || Number(customHours) <= 0}
                onClick={() =>
                  grantTrial(Math.round(Math.min(MAX_TRIAL_HOURS, Number(customHours)) * 60))
                }
              >
                Start
              </Button>
              {profile.trial_started_at ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="ml-auto"
                  onClick={() => grantTrial(null)}
                >
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

function getSegmentKey(profile) {
  if (profile.paid_requested_at && !profile.is_paid) return "pending_approval";
  const hadTrial = Boolean(profile.trial_started_at);
  if (profile.is_paid) return hadTrial ? "converted" : "direct";
  if (hadTrial) return profile.has_access ? "trial_active" : "trial_expired";
  return "new";
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

function formatCountdown(trialEndsAtIso, now = Date.now()) {
  const diffMs = new Date(trialEndsAtIso).getTime() - now;
  const abs = Math.abs(diffMs);
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const text = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return diffMs > 0 ? `${text} left` : `expired ${text} ago`;
}
