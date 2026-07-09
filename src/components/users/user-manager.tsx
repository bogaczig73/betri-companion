"use client";

import { Pencil, Plus, Trash2, UserRound, Users } from "lucide-react";
import { useState, useTransition } from "react";

import { createUser, deleteUser, updateUser } from "@/app/actions/users";
import { EmptyState } from "@/components/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { User, UserRole } from "@/db/schema";

const selectClassName =
  "border-input bg-transparent h-9 w-full rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30";

const TIMEZONES = (() => {
  const list = Intl.supportedValuesOf("timeZone");
  return list.includes("UTC") ? list : ["UTC", ...list];
})();

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type CoachLink = { coachId: string; athleteId: string };

type DialogState = { mode: "create" } | { mode: "edit"; user: User } | null;

function UserDialog({
  state,
  coaches,
  links,
  actingUserId,
  onClose,
}: {
  state: NonNullable<DialogState>;
  coaches: User[];
  links: CoachLink[];
  actingUserId: string;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const user = state.mode === "edit" ? state.user : undefined;
  const [role, setRole] = useState<UserRole>(user?.role ?? "athlete");

  const linkedCoachIds = user
    ? links.filter((l) => l.athleteId === user.id).map((l) => l.coachId)
    : [actingUserId];

  const submit = (formData: FormData) => {
    startTransition(async () => {
      setError(null);
      const res = user
        ? await updateUser(user.id, formData)
        : await createUser(formData);
      if (res.error) {
        setError(res.error);
      } else {
        onClose();
      }
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "Edit user" : "Add user"}</DialogTitle>
          <DialogDescription>
            {user
              ? "Update the account and its coach links."
              : "Create a coach or athlete account."}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="u-name">Name</Label>
            <Input
              id="u-name"
              name="name"
              required
              maxLength={200}
              defaultValue={user?.name}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-email">Email (optional)</Label>
            <Input
              id="u-email"
              name="email"
              type="email"
              defaultValue={user?.email ?? ""}
              placeholder="jane@example.com"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="u-role">Role</Label>
              {user ? (
                // Role is fixed after creation; see the note in actions/users.ts.
                <div className="flex h-9 items-center">
                  <Badge variant={user.role === "coach" ? "default" : "secondary"}>
                    {user.role}
                  </Badge>
                </div>
              ) : (
                <select
                  id="u-role"
                  name="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className={selectClassName}
                >
                  <option value="athlete">Athlete</option>
                  <option value="coach">Coach</option>
                </select>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-units">Units</Label>
              <select
                id="u-units"
                name="units"
                defaultValue={user?.units ?? "metric"}
                className={selectClassName}
              >
                <option value="metric">Metric</option>
                <option value="imperial">Imperial</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-timezone">Timezone</Label>
            <select
              id="u-timezone"
              name="timezone"
              defaultValue={user?.timezone ?? "UTC"}
              className={selectClassName}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          {role === "athlete" && (
            <div className="space-y-2">
              <Label>Coaches</Label>
              {coaches.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No coaches to link yet.
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                  {coaches.map((coach) => (
                    <label
                      key={coach.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        name="coachIds"
                        value={coach.id}
                        defaultChecked={linkedCoachIds.includes(coach.id)}
                        className="size-4 accent-primary"
                      />
                      <span className="flex-1 truncate">{coach.name}</span>
                      {coach.id === actingUserId && (
                        <span className="text-xs text-muted-foreground">you</span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : user ? "Save changes" : "Create user"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({
  user,
  meta,
  isActing,
  onEdit,
  onDelete,
  deletePending,
}: {
  user: User;
  meta: string;
  isActing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  deletePending: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar>
        <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
          {initials(user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{user.name}</span>
          {isActing && <Badge variant="outline">acting</Badge>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[user.email, user.timezone, user.units].filter(Boolean).join(" · ")}
        </p>
        <p className="truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" title="Edit user" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title={
            isActing
              ? "Switch to another user before removing yourself"
              : "Remove user"
          }
          disabled={isActing || deletePending}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

export function UserManager({
  users,
  links,
  actingUserId,
}: {
  users: User[];
  links: CoachLink[];
  actingUserId: string;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deletePending, startDelete] = useTransition();

  const coaches = users.filter((u) => u.role === "coach");
  const athletes = users.filter((u) => u.role === "athlete");
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const remove = (user: User) => {
    if (!confirm(`Remove ${user.name}? Their training history is kept.`)) return;
    startDelete(async () => {
      await deleteUser(user.id);
    });
  };

  const rowProps = (user: User, meta: string) => ({
    user,
    meta,
    isActing: user.id === actingUserId,
    onEdit: () => setDialog({ mode: "edit", user }),
    onDelete: () => remove(user),
    deletePending,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            Accounts and coach–athlete links.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: "create" })}>
          <Plus className="size-4" />
          Add user
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coaches</CardTitle>
          <CardDescription>
            Coaches manage athletes, plans, and the paper library.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {coaches.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title="No coaches"
              description="Add a coach to manage athletes and plans."
            />
          ) : (
            <ul className="divide-y">
              {coaches.map((coach) => {
                const count = links.filter((l) => l.coachId === coach.id).length;
                return (
                  <UserRow
                    key={coach.id}
                    {...rowProps(
                      coach,
                      count === 1 ? "1 athlete" : `${count} athletes`,
                    )}
                  />
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Athletes</CardTitle>
          <CardDescription>
            Each athlete can be linked to one or more coaches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {athletes.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No athletes yet"
              description="Add an athlete and link them to a coach."
            />
          ) : (
            <ul className="divide-y">
              {athletes.map((athlete) => {
                const coachNames = links
                  .filter((l) => l.athleteId === athlete.id)
                  .map((l) => nameById.get(l.coachId))
                  .filter(Boolean);
                return (
                  <UserRow
                    key={athlete.id}
                    {...rowProps(
                      athlete,
                      coachNames.length > 0
                        ? `Coached by ${coachNames.join(", ")}`
                        : "No coach linked",
                    )}
                  />
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {dialog && (
        <UserDialog
          state={dialog}
          coaches={coaches}
          links={links}
          actingUserId={actingUserId}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
