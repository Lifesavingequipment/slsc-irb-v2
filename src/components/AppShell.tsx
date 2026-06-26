import { Link, useLocation } from "@tanstack/react-router";
import {
  Home,
  Calendar,
  Users,
  Settings,
  ChevronDown,
  Wrench,
  LogOut,
  User as UserIcon,
  MessageSquare,
  Menu,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useClub, useCanManage, useIsGuardian } from "@/lib/club-context";
import { useAuth } from "@/lib/auth-context";
import { signOutAndRedirect } from "@/lib/sign-out";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/NotificationBell";
import { useChatUnread } from "@/hooks/useChatUnread";
import { useMemberFirstName } from "@/hooks/useMemberFirstName";
import { useNotifications } from "@/hooks/useNotifications";

function getNavItems(canManage: boolean, isGuardian: boolean) {
  if (isGuardian) {
    return [
      { to: "/dashboard", label: "Home", icon: Home },
      { to: "/sessions", label: "Sessions", icon: Calendar },
      { to: "/more", label: "More", icon: Menu },
    ] as const;
  }
  return [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/sessions", label: "Sessions", icon: Calendar },
    { to: "/chat", label: "Chat", icon: MessageSquare },
    ...(canManage ? [{ to: "/members", label: "Members", icon: Users }] : []),
    { to: "/more", label: "More", icon: Menu },
  ] as const;
}

export function AppShell({
  title,
  action,
  children,
  hideBottomNav,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  hideBottomNav?: boolean;
}) {
  const { activeClub, memberships, setActiveClubId } = useClub();
  const { user } = useAuth();
  const canManage = useCanManage();
  const isGuardian = useIsGuardian();
  const navItems = getNavItems(canManage, isGuardian);
  const chatUnread = useChatUnread();
  const { unreadCount: notifUnread } = useNotifications();
  const location = useLocation();
  const firstName = useMemberFirstName();
  const approvedClubs = memberships.filter((m) => m.status === "approved");
  const multiClub = approvedClubs.length > 1;
  const userInitial = firstName
    ? firstName[0].toUpperCase()
    : (user?.email ?? "?").trim().charAt(0).toUpperCase();
  const [clubSwitcherOpen, setClubSwitcherOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f9fafb] flex">
      {/* ── Desktop sidebar (≥768px) ── */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 left-0 w-60 bg-[#1e293b] z-30">
        {/* Logo row */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10 shrink-0">
          <div className="h-9 w-9 rounded-lg overflow-hidden shrink-0">
            <img src="/irb-logo.png" alt="Logo" className="h-9 w-9 rounded-lg object-cover" />
          </div>
          <div className="min-w-0">
            <div className="text-white font-bold text-sm">IRB Training</div>
            <div className="text-white/50 text-xs truncate">
              {activeClub ? activeClub.club.name : "Select club"}
            </div>
          </div>
        </div>

        {/* Club switcher (multi-club only) */}
        {multiClub && activeClub && (
          <div className="px-3 pt-3 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left">
                <div className="flex-1 min-w-0">
                  <div className="text-white/50 text-[10px] uppercase tracking-wider">Club</div>
                  <div className="text-white text-sm font-medium truncate">
                    {activeClub.club.name}
                  </div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-white/50 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel>Switch club</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {approvedClubs.map((m) => (
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
            const badge =
              item.to === "/chat" && chatUnread > 0 ? chatUnread :
              item.to === "/more" && notifUnread > 0 ? notifUnread : 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#FF6600] text-white"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span className="h-5 min-w-5 rounded-full bg-white text-[#FF6600] text-[10px] font-bold flex items-center justify-center px-1">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User + sign out */}
        <div className="shrink-0 px-3 pb-4 pt-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="h-8 w-8 rounded-full bg-[#FF6600] flex items-center justify-center text-white text-sm font-semibold shrink-0">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-medium truncate">
                {user?.email ?? "Account"}
              </div>
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
        <header className="safe-top sticky top-0 z-20 bg-[#FF6600] text-white shadow-md shrink-0">
          <div className="px-4 pt-3 pb-3 flex items-center gap-3">
            {/* Mobile: waves + club name/switcher */}
            <div className="flex items-center gap-3 flex-1 min-w-0 md:hidden">
              <div className="h-9 w-9 rounded-lg overflow-hidden shrink-0">
                <img src="/irb-logo.png" alt="Logo" className="h-9 w-9 rounded-lg object-cover" />
              </div>
              <div className="min-w-0">
                {multiClub ? (
                  <button
                    onClick={() => setClubSwitcherOpen(true)}
                    className="flex items-center gap-1 text-left min-w-0"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium text-white/70 uppercase tracking-wide">
                        CLUB
                      </p>
                      <p className="text-white font-bold text-base truncate leading-tight">
                        {activeClub?.club.name}
                      </p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-white/70 shrink-0 mt-1" />
                  </button>
                ) : (
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium text-white/70 uppercase tracking-wide">
                      CLUB
                    </p>
                    <p className="text-white font-bold text-base truncate leading-tight">
                      {activeClub?.club.name}
                    </p>
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

            <NotificationBell />

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
                  onSelect={(e) => {
                    e.preventDefault();
                    void signOutAndRedirect();
                  }}
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
        <main className={cn(
          "flex-1 overflow-x-hidden px-4 pt-4 md:px-6 md:pt-6 max-w-4xl mx-auto w-full md:pb-8",
          hideBottomNav ? "pb-0 overflow-hidden" : "pb-24",
        )}>
          {children}
        </main>

        {/* ── Mobile bottom tab bar (hidden on md+, or when hideBottomNav is set) ── */}
        <nav className={cn("md:hidden fixed bottom-0 inset-x-0 z-30 bg-[#1e293b] safe-bottom", hideBottomNav && "hidden")}>
          <div
            className={`grid ${navItems.length === 5 ? "grid-cols-5" : navItems.length === 3 ? "grid-cols-3" : "grid-cols-4"}`}
          >
            {navItems.map((item) => {
              const active = location.pathname.startsWith(item.to);
              const Icon = item.icon;
              const badge =
                item.to === "/chat" && chatUnread > 0 ? chatUnread :
                item.to === "/more" && notifUnread > 0 ? notifUnread : 0;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors min-h-[56px] justify-center relative ${
                    active ? "text-white" : "text-white/60"
                  }`}
                >
                  <div className="relative">
                    <Icon className={`h-5 w-5 ${active ? "stroke-[2.3]" : ""}`} />
                    {badge > 0 && (
                      <span className="absolute -top-1.5 -right-2 h-4 min-w-4 rounded-full bg-[#FF6600] text-white text-[9px] font-bold flex items-center justify-center px-1">
                        {badge}
                      </span>
                    )}
                  </div>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>

      {clubSwitcherOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setClubSwitcherOpen(false)}
          />
          {/* Sheet */}
          <div className="fixed bottom-0 left-0 right-0 bg-background rounded-t-2xl shadow-xl z-50 p-4 pb-8">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />
            <h3 className="font-semibold text-base mb-3">Switch club</h3>
            <div className="space-y-2">
              {approvedClubs.map((club) => {
                const isActive = club.club_id === activeClub?.club_id;
                const role = club.roles[0] ?? "member";
                const roleLabel =
                  role === "owner" || role === "club_admin"
                    ? "Admin"
                    : role === "coach"
                      ? "Coach"
                      : role === "guardian"
                        ? "Guardian"
                        : "Member";
                return (
                  <button
                    key={club.club_id}
                    onClick={() => {
                      setActiveClubId(club.club_id);
                      setClubSwitcherOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors",
                      isActive ? "border-[#FF6600] bg-[#FF6600]/5" : "border-border hover:bg-muted",
                    )}
                  >
                    <div
                      className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold",
                        isActive ? "bg-[#FF6600] text-white" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {club.club.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("font-medium truncate", isActive && "text-[#FF6600]")}>
                        {club.club.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{roleLabel}</p>
                    </div>
                    {isActive && <div className="h-2 w-2 rounded-full bg-[#FF6600] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
