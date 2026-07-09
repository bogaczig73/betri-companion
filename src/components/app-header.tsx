import Link from "next/link";

import { MainNav, type NavItem } from "@/components/main-nav";
import { MobileMenu } from "@/components/mobile-menu";
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
    ...(actingUser?.role === "coach"
      ? ([{ href: "/users", label: "Users", icon: "users" }] satisfies NavItem[])
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
            betri<span className="text-primary">.companion</span>
          </Link>
          <MainNav items={navItems} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          {actingUser ? (
            <div className="hidden md:block">
              <UserSwitcher users={users} actingUser={actingUser} />
            </div>
          ) : (
            <span className="hidden text-sm text-muted-foreground md:inline">
              No users — run the seed script
            </span>
          )}
          <MobileMenu
            items={navItems}
            users={users}
            actingUser={actingUser}
          />
        </div>
      </div>
    </header>
  );
}
