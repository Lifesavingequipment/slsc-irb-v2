import { useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { useNotifications } from "@/hooks/useNotifications";

/** Derive the in-app destination for a notification from its type + related entity id. */
function linkFor(type: string, relatedId: string | null): string | null {
  if (!relatedId) return null;
  switch (type) {
    case "new_session":
    case "session_updated":
      return `/sessions/${relatedId}`;
    case "carpool_update":
      return `/sessions/${relatedId}/carpool`;
    case "wave_draw_published":
      return `/sessions/${relatedId}?tab=waves`;
    case "member_approved":
    case "member_request":
    case "partner_assigned":
      return `/members/${relatedId}`;
    default:
      return null;
  }
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  const handleNotificationClick = async (id: string, link: string | null) => {
    await markRead(id);
    setOpen(false);
    if (link) void navigate({ to: link as "/" });
  };

  return (
    <div className="relative shrink-0">
      <button
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="h-10 w-10 rounded-full bg-white/15 hover:bg-white/25 transition-colors flex items-center justify-center relative"
      >
        <Bell className="h-5 w-5 text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-[#FF6600] text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            ref={panelRef}
            className="absolute right-0 top-12 z-50 w-[min(400px,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-background shadow-xl"
          >
            <div className="sticky top-0 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                  Mark all as read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() =>
                        handleNotificationClick(n.id, linkFor(n.notification_type, n.related_id))
                      }
                      className="w-full text-left px-4 py-3 flex gap-3 hover:bg-accent/60 transition-colors border-b border-border/50 last:border-b-0"
                    >
                      <div className="mt-1.5 shrink-0">
                        {!n.is_read ? (
                          <span className="block h-2 w-2 rounded-full bg-blue-500" />
                        ) : (
                          <span className="block h-2 w-2" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm leading-snug">{n.message}</div>
                        <div className="text-[10px] text-muted-foreground/70 mt-1">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
