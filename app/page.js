"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Info, RefreshCw, Rocket, TrendingUp, Wallet } from "lucide-react";
import { useAdminAuth } from "@/lib/admin-auth";
import { useProfiles } from "@/lib/use-profiles";
import { FILTER_META, FILTER_ORDER, getSegmentKey } from "@/lib/profile-segments";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function DashboardPage() {
  const { role } = useAdminAuth();
  const { profiles, status, reload } = useProfiles();
  const [now] = useState(() => Date.now());

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

  const metrics = useMemo(() => {
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const trialsStarted7d = withSegment.filter(
      (profile) => profile.trial_started_at && new Date(profile.trial_started_at).getTime() >= sevenDaysAgo
    ).length;
    const hadTrialCount = counts.converted + counts.trial_active + counts.trial_expired;
    const conversionRate = hadTrialCount > 0 ? Math.round((counts.converted / hadTrialCount) * 100) : null;
    const totalPaid = counts.direct + counts.converted;
    const sevenDaysAhead = now + 7 * 24 * 60 * 60 * 1000;
    const renewalsDue7d = withSegment.filter(
      (profile) =>
        profile.subscription_active &&
        new Date(profile.subscription_expires_at).getTime() <= sevenDaysAhead
    ).length;
    return { trialsStarted7d, conversionRate, totalPaid, renewalsDue7d };
  }, [withSegment, counts, now]);

  // Same numbers as the tiles above, split out by who added the client — "Direct" is
  // clients the owner added themselves; everything else is a named reseller. This is the
  // only place that answers "how much of this is from resellers vs. me."
  const bySource = useMemo(() => {
    const map = new Map();
    for (const profile of withSegment) {
      const key = profile.owner_id ?? "direct";
      if (!map.has(key)) {
        map.set(key, {
          label: profile.added_by_label,
          total: 0,
          subscriptionActive: 0,
          trialActive: 0,
          paid: 0,
          pendingApproval: 0,
        });
      }
      const entry = map.get(key);
      entry.total += 1;
      if (profile.segmentKey === "subscription_active") entry.subscriptionActive += 1;
      if (profile.segmentKey === "trial_active") entry.trialActive += 1;
      if (profile.is_paid) entry.paid += 1;
      if (profile.segmentKey === "pending_approval") entry.pendingApproval += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [withSegment]);

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Overview of client status. Click a tile to see the matching clients.
            </p>
          </div>
          <Button variant="outline" onClick={reload}>
            Refresh
          </Button>
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground">Activity</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Trials started (7d)" value={metrics.trialsStarted7d} icon={Rocket} />
            <MetricCard
              label="Conversion rate"
              value={metrics.conversionRate === null ? "—" : `${metrics.conversionRate}%`}
              icon={TrendingUp}
            />
            <MetricCard label="Total paid clients" value={metrics.totalPaid} icon={Wallet} />
            <MetricCard label="Renewals due (7d)" value={metrics.renewalsDue7d} icon={RefreshCw} />
          </div>
        </section>

        <section className="mt-6">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-muted-foreground">By status</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Every client is automatically tagged based on their trial, subscription, and paid state — hover the{" "}
            <Info className="inline size-3 -translate-y-px" /> on a tile for what it means.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {FILTER_ORDER.map((key) => (
              <StatTile key={key} filterKey={key} count={counts[key]} />
            ))}
          </div>
        </section>

        {role === "owner" ? (
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-muted-foreground">By reseller</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Who these clients came from — &quot;Direct&quot; means you added them yourself; everything
              else is a reseller&apos;s own clients.
            </p>
            <Card className="mt-3 py-0">
              <Table>
                <TableHeader className="[&_th]:h-11 [&_th]:text-xs [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase">
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Clients</TableHead>
                    <TableHead>Subscription active</TableHead>
                    <TableHead>Trial active</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Pending approval</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bySource.map((entry) => (
                    <TableRow key={entry.label}>
                      <TableCell className="font-medium">{entry.label}</TableCell>
                      <TableCell className="tabular-nums">{entry.total}</TableCell>
                      <TableCell className="tabular-nums">{entry.subscriptionActive}</TableCell>
                      <TableCell className="tabular-nums">{entry.trialActive}</TableCell>
                      <TableCell className="tabular-nums">{entry.paid}</TableCell>
                      <TableCell className="tabular-nums">{entry.pendingApproval}</TableCell>
                    </TableRow>
                  ))}
                  {bySource.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No clients yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </Card>
          </section>
        ) : null}

        <p className="mt-6 min-h-[1.25rem] text-sm text-muted-foreground">{status}</p>
      </div>
    </div>
  );
}

function StatTile({ filterKey, count }) {
  const meta = FILTER_META[filterKey];
  const Icon = meta.icon;
  const href = filterKey === "all" ? "/clients" : `/clients?status=${filterKey}`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted/60"
          />
        }
      >
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Icon className="mt-0.5 size-3.5 shrink-0" style={meta.color ? { color: meta.color } : undefined} />
          <span className="flex-1">{meta.label}</span>
          <Info className="mt-0.5 size-3 shrink-0 opacity-60" />
        </div>
        <div className="text-2xl font-semibold tabular-nums">{count}</div>
      </TooltipTrigger>
      <TooltipContent>{meta.description}</TooltipContent>
    </Tooltip>
  );
}

function MetricCard({ label, value, icon: Icon }) {
  return (
    <Card className="py-0">
      <CardContent className="flex items-center gap-3 px-4 py-3">
        <Icon className="size-4 text-muted-foreground" />
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
