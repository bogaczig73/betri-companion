"use client";

import { useTransition } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { setActingUser } from "@/app/actions/acting-user";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/db/schema";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserSwitcher({
  users,
  actingUser,
}: {
  users: User[];
  actingUser: User;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" className="gap-2 px-2" disabled={isPending}>
            <Avatar className="size-7">
              <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                {initials(actingUser.name)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline">{actingUser.name}</span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch user</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {users.map((user) => (
          <DropdownMenuItem
            key={user.id}
            onClick={() => startTransition(() => setActingUser(user.id))}
            className="gap-2"
          >
            <Check
              className={
                user.id === actingUser.id
                  ? "size-4 text-primary"
                  : "size-4 opacity-0"
              }
            />
            <span className="flex-1">{user.name}</span>
            <Badge variant={user.role === "coach" ? "default" : "secondary"}>
              {user.role}
            </Badge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
