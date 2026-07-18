"use client";

import { useEffect, useState } from "react";
import { Megaphone, Plus, Trash2, Wallet } from "lucide-react";
import { callRpc } from "@/lib/api";
import { useAdminAuth } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Shape matches what the extension's payment-info modal already renders — keeping it
// identical means the extension only has to fetch this instead of hardcoding it.
const EMPTY_PAYMENT_INFO = { priceLabel: "", instructions: "", methods: [], contact: "" };
const EMPTY_BANNER = { message: "", active: false, tone: "info" };
const BANNER_TONES = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

export default function SettingsPage() {
  const { role } = useAdminAuth();
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [banner, setBanner] = useState(null);
  const [status, setStatus] = useState("");

  async function loadConfig() {
    try {
      const paymentInfoData = await callRpc("admin_get_config", { p_key: "payment_info" });
      const bannerData = await callRpc("admin_get_config", { p_key: "banner" });
      setPaymentInfo(paymentInfoData ?? EMPTY_PAYMENT_INFO);
      setBanner(bannerData ?? EMPTY_BANNER);
    } catch (err) {
      setStatus(`Failed to load settings: ${err.message}`);
    }
  }

  // Fetch-on-mount, same shape as loadProfiles on the Clients page; setState only
  // happens after the await inside loadConfig, not synchronously in this effect body.
  useEffect(() => {
    if (role !== "owner") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadConfig();
  }, [role]);

  async function handleSavePaymentInfo(data) {
    await callRpc("admin_set_config", { p_key: "payment_info", p_data: data });
    setPaymentInfo(data);
    setStatus("Payment info saved.");
  }

  async function handleSaveBanner(data) {
    await callRpc("admin_set_config", { p_key: "banner", p_data: data });
    setBanner(data);
    setStatus(data.active ? "Banner published." : "Banner saved (inactive).");
  }

  if (role !== "owner") {
    return (
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-muted-foreground">
            Settings are only visible to the account owner.
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
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Payment instructions and the announcement banner shown inside the extension.
            </p>
          </div>
          <Button variant="outline" onClick={loadConfig}>
            Refresh
          </Button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BannerCard banner={banner} onSave={handleSaveBanner} />
          <PaymentInfoCard paymentInfo={paymentInfo} onSave={handleSavePaymentInfo} />
        </div>

        <p className="mt-3 min-h-[1.25rem] text-sm text-muted-foreground">{status}</p>
      </div>
    </div>
  );
}

// Keyed by whether data has loaded yet, so the form re-initializes from fresh server data
// the same way ProfileDetailForm on the Clients page does — rather than syncing via effect.
function BannerCard({ banner, onSave }) {
  if (!banner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="size-4" />
            Announcement banner
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }
  return <BannerForm key={JSON.stringify(banner)} banner={banner} onSave={onSave} />;
}

function BannerForm({ banner, onSave }) {
  const [message, setMessage] = useState(banner.message ?? "");
  const [tone, setTone] = useState(banner.tone ?? "info");
  const [active, setActive] = useState(Boolean(banner.active));
  const [saving, setSaving] = useState(false);

  async function handleSave(overrides) {
    setSaving(true);
    try {
      await onSave({ message, tone, active, ...overrides });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="size-4" />
          Announcement banner
        </CardTitle>
        <CardDescription>
          Shown to every user in the extension, regardless of trial or paid status.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          placeholder="e.g. We're rolling out a new feature this week — refresh the extension to get it."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
        />
        <div className="flex items-center gap-3">
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BANNER_TONES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Checkbox id="banner-active" checked={active} onCheckedChange={setActive} />
            <Label htmlFor="banner-active" className="text-sm font-normal">
              Active
            </Label>
          </div>
          <Button size="sm" className="ml-auto" disabled={saving} onClick={() => handleSave()}>
            {active ? "Publish" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentInfoCard({ paymentInfo, onSave }) {
  if (!paymentInfo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4" />
            Payment info
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }
  return <PaymentInfoForm key={JSON.stringify(paymentInfo)} paymentInfo={paymentInfo} onSave={onSave} />;
}

function PaymentInfoForm({ paymentInfo, onSave }) {
  const [priceLabel, setPriceLabel] = useState(paymentInfo.priceLabel ?? "");
  const [instructions, setInstructions] = useState(paymentInfo.instructions ?? "");
  const [contact, setContact] = useState(paymentInfo.contact ?? "");
  const [methods, setMethods] = useState(
    paymentInfo.methods?.length ? paymentInfo.methods : [{ label: "", value: "" }]
  );
  const [saving, setSaving] = useState(false);

  function updateMethod(index, field, value) {
    setMethods((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  }

  function addMethod() {
    setMethods((prev) => [...prev, { label: "", value: "" }]);
  }

  function removeMethod(index) {
    setMethods((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        priceLabel,
        instructions,
        contact,
        methods: methods.filter((m) => m.label.trim() || m.value.trim()),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="size-4" />
          Payment info
        </CardTitle>
        <CardDescription>
          Shown to users once their trial or access has run out — this replaces what used to
          be hardcoded in the extension.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price-label">Price</Label>
          <Input
            id="price-label"
            placeholder="Rs. 2,800 (one-time)"
            value={priceLabel}
            onChange={(event) => setPriceLabel(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="instructions">Instructions</Label>
          <Textarea
            id="instructions"
            placeholder="Send payment via bank transfer or Easypaisa using the details below, then message your sign-in email so access can be enabled."
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={3}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label>Payment methods</Label>
          {methods.map((method, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                placeholder="Label, e.g. Easypaisa"
                value={method.label}
                onChange={(event) => updateMethod(index, "label", event.target.value)}
                className="w-32"
              />
              <Input
                placeholder="Number / account details"
                value={method.value}
                onChange={(event) => updateMethod(index, "value", event.target.value)}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeMethod(index)}
                disabled={methods.length <= 1}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-fit" onClick={addMethod}>
            <Plus className="size-3.5" />
            Add method
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact">Contact</Label>
          <Input
            id="contact"
            placeholder="WhatsApp number or email for payment confirmation"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
          />
        </div>

        <Button size="sm" className="w-fit" disabled={saving} onClick={handleSave}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
