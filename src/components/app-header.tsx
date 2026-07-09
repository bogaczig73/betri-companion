import Link from "next/link";

import { MainNav, type NavItem } from "@/components/main-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserSwitcher } from "@/components/user-switcher";
import type { User } from "@/db/schema";

export function AppHeader({
  users,
  actingUser,
}: {
  users: User[];
  actingUser: User | null;
}) {
  const navItems: NavItem[] = [
    { href: "/", label: "Dashboard", icon: "dashboard" },
    ...(actingUser?.role === "coach"
      ? ([
          { href: "/athletes", label: "Athletes", icon: "athletes" },
          { href: "/plans", label: "Plans", icon: "plans" },
        ] satisfies NavItem[])
      : []),
    ...(actingUser
      ? ([
          { href: "/calendar", label: "Calendar", icon: "calendar" },
          { href: "/chat", label: "Chat", icon: "chat" },
          { href: "/lactate", label: "Lactate", icon: "lactate" },
          { href: "/papers", label: "Library", icon: "library" },
        ] satisfies NavItem[])
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
            betri
            <span className="hidden text-primary min-[480px]:inline">
              .companion
            </span>
          </Link>
          <MainNav items={navItems} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          {actingUser ? (
            <UserSwitcher users={users} actingUser={actingUser} />
          ) : (
            <span className="text-sm text-muted-foreground">
              No users — run the seed script
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
