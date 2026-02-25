"use client";

import { CircleHelp, Flame, FlameKindling, Trophy, Users, Zap } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const MAIN_NAV = [
  { href: "/", label: "Live Game", icon: Flame },
  { href: "/upcoming", label: "Upcoming", icon: Users },
  { href: "/hall-of-fame", label: "Hall of Fame", icon: Trophy },
] as const;

const JOIN_NAV = { href: "/join", label: "Join", icon: Zap } as const;
const HELP_NAV = { href: "/help", label: "Help", icon: CircleHelp } as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  function navClass(href: string) {
    const active = pathname === href;
    return `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "bg-ember/15 text-ember"
        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    }`;
  }

  function mobileNavClass(href: string) {
    const active = pathname === href;
    return `flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
      active ? "text-ember" : "text-muted-foreground"
    }`;
  }

  function mobileIconClass(href: string) {
    return `h-5 w-5 ${pathname === href ? "drop-shadow-[0_0_6px_oklch(0.75_0.18_45)]" : ""}`;
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Desktop header */}
      <header className="hidden border-b border-border/60 bg-card/80 backdrop-blur-md md:block">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <Link href="/" className="mr-6 flex items-center gap-2">
            <FlameKindling className="h-5 w-5 text-ember" />
            <span className="text-lg font-bold tracking-tight">
              surv<span className="text-ember">AI</span>vor
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            {MAIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={navClass(item.href)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Push Help/Join to the far right */}
          <div className="ml-auto flex items-center gap-2">
            {[HELP_NAV, JOIN_NAV].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? "border-ember/40 bg-ember/15 text-ember"
                    : "border-border/60 text-muted-foreground hover:border-ember/30 hover:bg-ember/5 hover:text-ember"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-20 md:pb-0">{children}</main>

      {/* Mobile bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-card/95 backdrop-blur-md md:hidden">
        <div className="flex items-center justify-around py-2">
          {MAIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={mobileNavClass(item.href)}
            >
              <item.icon className={mobileIconClass(item.href)} />
              <span>{item.label}</span>
            </Link>
          ))}
          <Link href={JOIN_NAV.href} className={mobileNavClass(JOIN_NAV.href)}>
            <JOIN_NAV.icon className={mobileIconClass(JOIN_NAV.href)} />
            <span>{JOIN_NAV.label}</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
