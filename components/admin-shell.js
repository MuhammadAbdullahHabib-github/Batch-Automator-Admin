"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings, UserCog, Users } from "lucide-react";
import { useAdminAuth } from "@/lib/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  if (loading) return null;

  if (!session) {
    return <SignInGate />;
  }

  const navItems = NAV_ITEMS.filter((item) => !item.ownerOnly || role === "owner");

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="px-2 py-1.5">
            <div className="text-sm font-semibold">Batch Automator</div>
            <div className="text-xs text-muted-foreground">
              {me?.display_name || me?.email} · {role === "owner" ? "Owner" : "Reseller"}
            </div>
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
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div className="flex items-center gap-2 border-b px-4 py-3 md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-medium">Batch Automator</span>
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
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
