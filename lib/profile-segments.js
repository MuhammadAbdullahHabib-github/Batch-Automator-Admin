import {
  AlertTriangle,
  CalendarX,
  CheckCircle2,
  Clock,
  CreditCard,
  Hourglass,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

// Fixed status colors (never themed) — always paired with an icon + label, never color alone.
// `description` explains, in plain language, exactly what makes a client fall into this
// tag — shown as a tooltip on the Dashboard so the tags are self-explanatory.
export const SEGMENT_META = {
  pending_approval: {
    label: "Pending approval",
    icon: Hourglass,
    color: "#2a78d6",
    description: "Client asked for paid access. Waiting on the owner to approve or decline it.",
  },
  subscription_active: {
    label: "Subscription active",
    icon: CreditCard,
    color: "#7c5cff",
    description: "Has a running 30-day (or custom-length) subscription that hasn't expired yet.",
  },
  subscription_expired: {
    label: "Subscription expired",
    icon: CalendarX,
    color: "#ec835a",
    description: "Subscribed before, but the subscription ran out and hasn't been renewed.",
  },
  trial_active: {
    label: "Trial active",
    icon: Clock,
    color: "#fab219",
    description: "Inside their free trial window right now.",
  },
  trial_expired: {
    label: "Trial expired",
    icon: AlertTriangle,
    color: "#ec835a",
    description: "Free trial ran out and they were never marked paid or subscribed.",
  },
  converted: {
    label: "Converted from trial",
    icon: CheckCircle2,
    color: "#0ca30c",
    description: "Had a free trial first, then was marked \"Paid (unlimited)\" — a trial-to-paid conversion.",
  },
  direct: {
    label: "Direct purchase",
    icon: Wallet,
    color: "#0ca30c",
    description: "Marked \"Paid (unlimited)\" without ever going through a free trial.",
  },
  new: {
    label: "No trial yet",
    icon: Sparkles,
    color: null,
    description: "Added as a client, but never given a trial, subscription, or paid access.",
  },
};

export const FILTER_ORDER = [
  "all",
  "pending_approval",
  "subscription_active",
  "subscription_expired",
  "trial_active",
  "trial_expired",
  "converted",
  "direct",
  "new",
];

export const FILTER_META = {
  all: { label: "All", icon: Users, color: null, description: "Every client — added directly by the owner, or by any reseller." },
  ...SEGMENT_META,
};

export function getSegmentKey(profile) {
  if (profile.paid_requested_at && !profile.is_paid) return "pending_approval";
  const hadTrial = Boolean(profile.trial_started_at);
  if (profile.is_paid) return hadTrial ? "converted" : "direct";
  const hadSubscription = Boolean(profile.subscription_started_at);
  if (hadSubscription) return profile.subscription_active ? "subscription_active" : "subscription_expired";
  if (hadTrial) return profile.has_access ? "trial_active" : "trial_expired";
  return "new";
}
