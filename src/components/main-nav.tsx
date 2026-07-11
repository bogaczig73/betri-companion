"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ClipboardList,
  Dumbbell,
  FileStack,
  FlaskConical,
  LayoutDashboard,
  MessageCircle,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  athletes: Users,
  workouts: Dumbbell,
  plans: ClipboardList,
  templates: FileStack,
  calendar: Calendar,
  chat: MessageCircle,
  lab: FlaskConical,
  lactate: FlaskConical,
  library: BookOpen,
  users: UserCog,
};

export type NavLeaf = {
  href: string;
  label: string;
  icon: keyof typeof NAV_ICONS;
};

export type NavItem =
  | NavLeaf
  | { label: string; icon: keyof typeof NAV_ICONS; items: NavLeaf[] };

export function navLeaves(items: NavItem[]): NavLeaf[] {
  return items.flatMap((item) => ("items" in item ? item.items : [item]));
}

export function isNavItemActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

const pillClassName = (active: boolean) =>
  cn(
    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition-colors",
    active
      ? "bg-muted text-foreground"
      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  );

export function MainNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 text-sm md:flex">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        if ("items" in item) {
          const active = item.items.some((leaf) =>
            isNavItemActive(pathname, leaf.href),
          );
          return (
            <DropdownMenu key={item.label}>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={item.label}
                    title={item.label}
                    className={pillClassName(active)}
                  >
                    <Icon className="size-4" />
                    {/* Labels don't fit until lg; icon-only below that. */}
                    <span className="hidden lg:inline">{item.label}</span>
                    <ChevronDown className="size-3 text-muted-foreground" />
                  </button>
                }
              />
              <DropdownMenuContent align="start" className="w-44">
                {item.items.map((leaf) => {
                  const LeafIcon = NAV_ICONS[leaf.icon];
                  return (
                    <DropdownMenuItem
                      key={leaf.href}
                      className="gap-2"
                      render={<Link href={leaf.href} />}
                    >
                      <LeafIcon className="size-4 text-muted-foreground" />
                      {leaf.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        }
        const active = isNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            title={item.label}
            className={pillClassName(active)}
          >
            <Icon className="size-4" />
            <span className="hidden lg:inline">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
