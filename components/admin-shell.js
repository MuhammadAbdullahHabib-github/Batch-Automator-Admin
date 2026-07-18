"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CheckCircle2, KeyRound, LogOut, Settings, UserCog, Users, XCircle } from "lucide-react";
import { callRpc } from "@/lib/api";
import { supabase } from "@/lib/supabase-client";
import { useAdminAuth } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// One product (Batch Automator) today. When a second extension is added, this is the
// spot for a product switcher — the nav/page structure below doesn't assume there's
// only ever one.
const NAV_ITEMS = [
  { href: "/", label: "Clients", icon: Users, ownerOnly: false },
  { href: "/resellers", label: "Resellers", icon: UserCog, ownerOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, ownerOnly: true },
];

export function AdminShell({ children }) {
  const { session, me, role, loading, signOut } = useAdminAuth();
  const pathname = usePathname();
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  async function loadNotifications() {
    try {
      const rows = await callRpc("list_my_notifications");
      setNotifications(rows ?? []);
    } catch {
      // Notifications are non-critical — a failed fetch just leaves the bell as-is.
    }
  }

  // Polls the same way the trial countdown ticks elsewhere in the app (setInterval,
  // no realtime subscription) — simplest option that stays on the free tier.
  useEffect(() => {
    if (!session) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotifications();
    const id = setInterval(loadNotifications, 60_000);
    return () => clearInterval(id);
  }, [session]);

  async function handleNotifOpenChange(open) {
    setNotifOpen(open);
    if (open) {
      try {
        await callRpc("mark_all_notifications_read");
        await loadNotifications();
      } catch {
        // ignore — worst case the badge stays until the next poll
      }
    }
  }

  if (loading) return null;

  if (!session) {
    return <SignInGate />;
  }

  const navItems = NAV_ITEMS.filter((item) => !item.ownerOnly || role === "owner");
  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <div>
              <div className="text-sm font-semibold">Batch Automator</div>
              <div className="text-xs text-muted-foreground">
                {me?.display_name || me?.email} · {role === "owner" ? "Owner" : "Reseller"}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="relative shrink-0"
              onClick={() => handleNotifOpenChange(true)}
            >
              <Bell className="size-4" />
              {unreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </Button>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton isActive={pathname === item.href} render={<Link href={item.href} />}>
                      <item.icon />
                      {item.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex flex-col gap-2">
            <Button variant="ghost" size="sm" onClick={() => setChangePasswordOpen(true)}>
              <KeyRound className="size-3.5" />
              Change password
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex items-center gap-2 border-b px-4 py-3 md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-medium">Batch Automator</span>
        </div>
        {children}
      </SidebarInset>

      <NotificationsDialog
        open={notifOpen}
        onOpenChange={handleNotifOpenChange}
        notifications={notifications}
      />
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </SidebarProvider>
  );
}

function NotificationsDialog({ open, onOpenChange, notifications }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>Updates on your clients&apos; paid-access requests.</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                {n.type === "approved" ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: "#0ca30c" }} />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0" style={{ color: "#ec835a" }} />
                )}
                <div>
                  <div className="font-medium break-all">
                    {n.type === "approved" ? "Approved" : "Declined"}: {n.profile_email}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {open ? <ChangePasswordForm onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordForm({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>Set a new password for your account.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Input
          type="password"
          required
          minLength={8}
          placeholder="New password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Input
          type="password"
          required
          placeholder="Confirm new password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={submitting}>
          Update password
        </Button>
      </form>
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

function SignInGate() {
  const { signIn, signInError } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email, password);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Batch Automator </CardTitle>
          <CardDescription>Sign in with your email and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <Input
              type="email"
              autoFocus
              required
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" disabled={submitting}>
              Sign in
            </Button>
          </form>
          {signInError ? <p className="mt-3 text-sm text-destructive">{signInError}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}
