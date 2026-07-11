"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Menu, X } from "lucide-react";

import { setActingUser } from "@/app/actions/acting-user";
import {
  isNavItemActive,
  NAV_ICONS,
  navLeaves,
  type NavItem,
} from "@/components/main-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { User } from "@/db/schema";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function MobileMenu({
  items,
  users,
  actingUser,
}: {
  items: NavItem[];
  users: User[];
  actingUser: User | null;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();

  // Close when navigation changes the route (covers back/forward too).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  return (
    <div className="md:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-x-0 top-14 bottom-0 z-40 bg-black/20"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-x-0 top-14 z-50 border-b bg-background shadow-lg">
            <nav className="flex flex-col gap-1 p-3 text-sm">
              {/* Groups stay flat on mobile — vertical space is cheap. */}
              {navLeaves(items).map((item) => {
                const Icon = NAV_ICONS[item.icon];
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2.5 font-medium transition-colors",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {actingUser && (
              <>
                <Separator />
                <div className="p-3">
                  <p className="px-3 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Switch user
                  </p>
                  <div className="flex flex-col gap-1 text-sm">
                    {users.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            await setActingUser(user.id);
                            setOpen(false);
                          })
                        }
                        className="flex items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/60 disabled:opacity-50"
                      >
                        <Avatar size="sm">
                          <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
                            {initials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex-1 truncate font-medium">
                          {user.name}
                        </span>
                        <Badge
                          variant={user.role === "coach" ? "default" : "secondary"}
                        >
                          {user.role}
                        </Badge>
                        <Check
                          className={cn(
                            "size-4 text-primary",
                            user.id !== actingUser.id && "opacity-0",
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
