"use client";

import { useTransition } from "react";

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
              <AvatarFallback className="text-xs">
                {initials(actingUser.name)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline">{actingUser.name}</span>
            <Badge
              variant={actingUser.role === "coach" ? "default" : "secondary"}
            >
              {actingUser.role}
            </Badge>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Acting as (testing)</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {users.map((user) => (
          <DropdownMenuItem
            key={user.id}
            onClick={() => startTransition(() => setActingUser(user.id))}
            className="justify-between"
          >
            <span className={user.id === actingUser.id ? "font-semibold" : ""}>
              {user.name}
            </span>
            <Badge variant={user.role === "coach" ? "default" : "secondary"}>
              {user.role}
            </Badge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
