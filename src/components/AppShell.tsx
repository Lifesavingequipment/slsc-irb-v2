import { Link, useLocation } from "@tanstack/react-router";
import {
  Home, Calendar, Users, Settings, Waves,
  ChevronDown, Wrench, LogOut, User as UserIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useClub } from "@/lib/club-context";
import { useAuth } from "@/lib/auth-context";
import { signOutAndRedirect } from "@/lib/sign-out";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/sessions", label: "Sessions", icon: Calendar },
  { to: "/equipment/lists", label: "Gear", icon: Wrench },
  { to: "/members", label: "Members", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ title, action, children }: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { activeClub, memberships, setActiveClubId } = useClub();
  const { user } = useAuth();
  const location = useLocation();
  const approved = memberships.filter((m) => m.status === "approved");
  const userInitial = (user?.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#f9fafb] flex">
      {/* ── Desktop sidebar (≥768px) ── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-60 bg-[#1e293b] z-30">
        {/* Logo row */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10 shrink-0">
          <div className="h-9 w-9 rounded-lg bg-[#E63329] flex items-center justify-center shrink-0">
            <Waves className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-white font-bold text-sm">IRB Training</div>
            <div className="text-white/50 text-xs truncate">
              {activeClub ? activeClub.club.name : "Select club"}
            </div>
          </div>
        </div>

        {/* Club switcher (multi-club only) */}
        {approved.length > 1 && activeClub && (
          <div className="px-3 pt-3 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left">
                <div className="flex-1 min-w-0">
                  <div className="text-white/50 text-[10px] uppercase tracking-wider">Club</div>
                  <div className="text-white text-sm font-medium truncate">{activeClub.club.name}</div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-white/50 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel>Switch club</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {approved.map((m) => (
                  <DropdownMenuItem key={m.club_id} onSelect={() => setActiveClubId(m.club_id)}>
                    {m.club.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#E63329] text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User + sign out */}
        <div className="shrink-0 px-3 pb-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="h-8 w-8 rounded-full bg-[#E63329] flex items-center justify-center text-white text-sm font-semibold shrink-0">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-medium truncate">{user?.email ?? "Account"}</div>
            </div>
          </div>
          <button
            onClick={() => void signOutAndRedirect()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Content column ── */}
      <div className="flex flex-col flex-1 md:ml-60 min-h-screen w-0">
        {/* Top header */}
        <header className="safe-top sticky top-0 z-20 bg-[#E63329] text-white shadow-md shrink-0">
          <div className="px-4 pt-3 pb-3 flex items-center gap-3">
            {/* Mobile: waves + club name/switcher */}
            <div className="flex items-center gap-3 flex-1 min-w-0 md:hidden">
              <div className="h-9 w-9 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                <Waves className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                {activeClub && approved.length > 1 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center gap-1 text-left max-w-full">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider opacity-70">Club</div>
                        <div className="font-semibold truncate flex items-center gap-1">
                          {activeClub.club.name}
                          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                        </div>
                      </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel>Switch club</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {approved.map((m) => (
                        <DropdownMenuItem key={m.club_id} onSelect={() => setActiveClubId(m.club_id)}>
                          {m.club.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider opacity-70">Club</div>
                    <div className="font-semibold truncate">{activeClub?.club.name ?? "IRB Coaching"}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Desktop: centred club name */}
            <div className="hidden md:flex flex-1 justify-center">
              <span className="text-base font-semibold">
                {activeClub?.club.name ?? "IRB Coaching"}
              </span>
            </div>

            {action && <div className="shrink-0">{action}</div>}

            {/* Avatar / account dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account menu"
                className="h-10 w-10 rounded-full bg-white/15 hover:bg-white/25 transition-colors flex items-center justify-center text-sm font-semibold shrink-0"
              >
                {userInitial}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuLabel className="truncate">
                  {user?.email ?? "Account"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="cursor-pointer">
                    <UserIcon className="h-4 w-4 mr-2" /> Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="cursor-pointer">
                    <Settings className="h-4 w-4 mr-2" /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(e) => { e.preventDefault(); void signOutAndRedirect(); }}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4 mr-2" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {title && (
            <div className="px-4 pb-3">
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 pb-24 md:pb-8 px-4 pt-4 md:px-6 md:pt-6 max-w-4xl mx-auto w-full">
          {children}
        </main>

        {/* ── Mobile bottom tab bar (hidden on md+) ── */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-[#1e293b] safe-bottom">
          <div className="grid grid-cols-5">
            {navItems.map((item) => {
              const active = location.pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors min-h-[56px] justify-center ${
                    active ? "text-[#FFD700]" : "text-white/60"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? "stroke-[2.3]" : ""}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
