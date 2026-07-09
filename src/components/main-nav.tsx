"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Calendar,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  MessageCircle,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  athletes: Users,
  plans: ClipboardList,
  calendar: Calendar,
  chat: MessageCircle,
  lactate: FlaskConical,
  library: BookOpen,
};

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof NAV_ICONS;
};

export function isNavItemActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 text-sm md:flex">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const active = isNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
