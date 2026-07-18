"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Trash2, Trophy, UserPlus } from "lucide-react";
import { callRpc } from "@/lib/api";
import { useAdminAuth } from "@/lib/admin-auth";
import { createReseller, deleteReseller, resetResellerPassword } from "@/app/actions/resellers";
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

export default function ResellersPage() {
  const { role, session } = useAdminAuth();
  const [resellers, setResellers] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [newCredentials, setNewCredentials] = useState(null); // { email, password } shown once

  async function loadResellers() {
    setLoading(true);
    try {
      const rows = await callRpc("admin_list_resellers");
      setResellers(rows ?? []);
    } catch (err) {
      setStatus(`Failed to load resellers: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (role !== "owner") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadResellers();
  }, [role]);

  async function handleCreate({ email, password, displayName }) {
    try {
      await createReseller({
        accessToken: session.access_token,
        email,
        password,
        displayName,
      });
      setNewCredentials({ email, password });
      setStatus(`Created reseller ${email}.`);
      await loadResellers();
    } catch (err) {
      setStatus(`Failed to create reseller: ${err.message}`);
    }
  }

  async function handleResetPassword(reseller) {
    try {
      const { password } = await resetResellerPassword({
        accessToken: session.access_token,
        userId: reseller.user_id,
      });
      setNewCredentials({ email: reseller.email, password });
      setStatus(`Password reset for ${reseller.email}.`);
    } catch (err) {
      setStatus(`Failed to reset password for ${reseller.email}: ${err.message}`);
    }
  }

  async function handleDeleteReseller(reseller) {
    const clientNote =
      reseller.client_count > 0
        ? ` Their ${reseller.client_count} client(s) will be kept and marked as Direct.`
        : "";
    if (!window.confirm(`Delete reseller ${reseller.email}?${clientNote} This cannot be undone.`)) {
      return;
    }
    try {
      await deleteReseller({
        accessToken: session.access_token,
        userId: reseller.user_id,
      });
      setStatus(`Deleted reseller ${reseller.email}.`);
      await loadResellers();
    } catch (err) {
      setStatus(`Failed to delete ${reseller.email}: ${err.message}`);
    }
  }

  const rankedResellers = useMemo(
    () => [...resellers].sort((a, b) => b.paid_count - a.paid_count),
    [resellers]
  );

  if (role !== "owner") {
    return (
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-muted-foreground">
            Resellers are only visible to the account owner.
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
            <h1 className="text-2xl font-semibold tracking-tight">Resellers</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Each reseller only sees and manages the clients they add — never each other&apos;s.
            </p>
          </div>
          <Button variant="outline" onClick={loadResellers}>
            Refresh
          </Button>
        </div>

        <CreateResellerForm onCreate={handleCreate} />

        <Card className="mt-6 py-0">
          <Table>
            <TableHeader className="[&_th]:h-11 [&_th]:text-xs [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase">
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Clients</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Pending approval</TableHead>
                <TableHead>Added</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankedResellers.map((reseller, index) => (
                <TableRow key={reseller.user_id}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    <div className="flex items-center gap-1">
                      {index === 0 && reseller.paid_count > 0 ? (
                        <Trophy className="size-3.5" style={{ color: "#fab219" }} />
                      ) : null}
                      {index + 1}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{reseller.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {reseller.display_name || "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">{reseller.client_count}</TableCell>
                  <TableCell className="tabular-nums">{reseller.paid_count}</TableCell>
                  <TableCell className="tabular-nums">{reseller.pending_approval_count}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(reseller.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResetPassword(reseller)}
                      >
                        <KeyRound className="size-3.5" />
                        Reset password
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteReseller(reseller)}
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && resellers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No resellers yet. Add one above.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Card>

        <p className="mt-3 min-h-[1.25rem] text-sm text-muted-foreground">{status}</p>
      </div>

      <NewCredentialsDialog
        credentials={newCredentials}
        onOpenChange={(open) => {
          if (!open) setNewCredentials(null);
        }}
      />
    </div>
  );
}

function CreateResellerForm({ onCreate }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setCreating(true);
    try {
      await onCreate({ email: email.trim(), password, displayName: displayName.trim() });
      setEmail("");
      setPassword("");
      setDisplayName("");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardContent>
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_auto]"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reseller-email">Email</Label>
            <Input
              id="reseller-email"
              type="email"
              required
              placeholder="reseller@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reseller-password">Password</Label>
            <Input
              id="reseller-password"
              type="text"
              required
              minLength={8}
              placeholder="Temporary password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reseller-name">Name</Label>
            <Input
              id="reseller-name"
              type="text"
              placeholder="e.g. Ahmed"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={creating}>
            <UserPlus className="size-3.5" />
            Create
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Share the email and password with them directly — they can sign in right away.
        </p>
      </CardContent>
    </Card>
  );
}

// Shown once right after creating a reseller or resetting their password — this is the
// only moment the password is ever visible, so it's built to be copied immediately.
function NewCredentialsDialog({ credentials, onOpenChange }) {
  return (
    <Dialog open={Boolean(credentials)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        {credentials ? (
          <NewCredentialsContent key={credentials.password} credentials={credentials} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NewCredentialsContent({ credentials }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(credentials.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Password for {credentials.email}</DialogTitle>
        <DialogDescription>
          This is shown once — copy it now and send it to them directly. It won&apos;t be
          shown again.
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-2">
        <Input readOnly value={credentials.password} className="font-mono" />
        <Button variant="outline" size="icon" onClick={handleCopy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </>
  );
}
