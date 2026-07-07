import Link from "next/link";

import { UserSwitcher } from "@/components/user-switcher";
import type { User } from "@/db/schema";

export function AppHeader({
  users,
  actingUser,
}: {
  users: User[];
  actingUser: User | null;
}) {
  const navItems = [
    { href: "/", label: "Dashboard" },
    ...(actingUser?.role === "coach"
      ? [
          { href: "/athletes", label: "Athletes" },
          { href: "/plans", label: "Plans" },
        ]
      : []),
    ...(actingUser
      ? [
          { href: "/chat", label: "Chat" },
          { href: "/lactate", label: "Lactate" },
          { href: "/papers", label: "Library" },
        ]
      : []),
  ];

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            betri<span className="text-muted-foreground">.companion</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        {actingUser ? (
          <UserSwitcher users={users} actingUser={actingUser} />
        ) : (
          <span className="text-sm text-muted-foreground">
            No users — run the seed script
          </span>
        )}
      </div>
    </header>
  );
}
