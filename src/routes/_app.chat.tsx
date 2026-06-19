import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClub, useCanManage } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Send,
  MessageSquare,
  ArrowLeft,
  Trash2,
  Copy,
  Reply,
  Pencil,
  ShieldAlert,
  Paperclip,
  SmilePlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";

export const Route = createFileRoute("/_app/chat")({
  head: () => ({ meta: [{ title: "Chat — IRB Coaching" }] }),
  component: ChatPage,
});

type Channel = {
  id: string;
  name: string;
  type: string;
  lastMessage?: string;
  lastTime?: string;
  unread: number;
  lastReadAt?: string | null;
};

type Message = {
  id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_id?: string | null;
  senderName?: string;
  replyToBody?: string;
  replyToSender?: string;
};

type ClubMember = { id: string; name: string };

type ReactionGroup = { emoji: string; memberIds: string[]; names: string[] };

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return timeStr;
  if (isYesterday) return `Yesterday ${timeStr}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${timeStr}`;
}

// A message is "grouped" (not the first in a run) if the previous message
// has the same sender_id AND is within 2 minutes AND both are not deleted.
function isGrouped(msgs: Message[], idx: number): boolean {
  if (idx === 0) return false;
  const prev = msgs[idx - 1];
  const curr = msgs[idx];
  if (prev.sender_id !== curr.sender_id) return false;
  if (prev.deleted_at || curr.deleted_at) return false;
  return new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime() < 120000;
}
// A message is "last in group" if the next message has a different sender or is > 2 min later.
function isLastInGroup(msgs: Message[], idx: number): boolean {
  if (idx === msgs.length - 1) return true;
  return !isGrouped(msgs, idx + 1);
}

function ChatPage() {
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const [myMemberId, setMyMemberId] = useState<string | null>(null);
  const [myMemberName, setMyMemberName] = useState<string>("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [showThread, setShowThread] = useState(false); // mobile: show right panel
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [clubMembers, setClubMembers] = useState<ClubMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [chatName, setChatName] = useState("");
  const [chatType, setChatType] = useState<"group" | "direct">("group");
  const [memberSearch, setMemberSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visibleTimestamp, setVisibleTimestamp] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<Message | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState({ x: 0, y: 0 });
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [firstUnreadId, setFirstUnreadId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, ReactionGroup[]>>({});
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [lastReadBy, setLastReadBy] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const unreadDividerRef = useRef<HTMLDivElement>(null);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  const messageIdsRef = useRef<string[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

  // Load self
  useEffect(() => {
    if (!activeClub) return;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: m } = await supabase
        .from("members")
        .select("id, first_name, last_name, preferred_name")
        .eq("auth_user_id", data.user.id)
        .eq("club_id", activeClub.club_id)
        .maybeSingle();
      if (!m) return;
      setMyMemberId(m.id);
      const name =
        m.preferred_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || "Me";
      setMyMemberName(name);
    });
  }, [activeClub]);

  const loadChannels = useCallback(async () => {
    if (!myMemberId || !activeClub) return;
    setLoading(true);
    try {
      // Ensure main channel exists + self is a member (non-blocking — don't let errors stop the fetch)
      try {
        await ensureMainChannel(activeClub.club_id, activeClub.club.name, myMemberId);
      } catch (e) {
        console.error("ensureMainChannel failed (non-fatal):", e);
      }

      // Load channels I'm in
      const { data: cm, error: cmErr } = await supabase
        .from("chat_members")
        .select("channel_id, last_read_at, channel:chat_channels(id, name, type)")
        .eq("member_id", myMemberId);

      if (cmErr) {
        console.error("chat_members fetch error:", cmErr);
        return;
      }
      if (!cm) return;

      const channelIds = cm.map((r) => r.channel_id);
      if (channelIds.length === 0) {
        setChannels([]);
        return;
      }

      // Last message per channel
      const msgPromises = channelIds.map((cid) =>
        supabase
          .from("chat_messages")
          .select("body, created_at")
          .eq("channel_id", cid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      );
      const msgResults = await Promise.all(msgPromises);

      // Unread counts
      const unreadPromises = cm.map((r) =>
        supabase
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("channel_id", r.channel_id)
          .gt("created_at", r.last_read_at ?? "1970-01-01"),
      );
      const unreadResults = await Promise.all(unreadPromises);

      const built: Channel[] = cm.map((r, i) => {
        const ch = r.channel as unknown as { id: string; name: string; type: string };
        return {
          id: ch.id,
          name: ch.name,
          type: ch.type,
          lastMessage: msgResults[i].data?.body ?? undefined,
          lastTime: msgResults[i].data?.created_at ?? undefined,
          unread: unreadResults[i].count ?? 0,
          lastReadAt: r.last_read_at,
        };
      });

      // Sort: main first, then by last message time desc
      built.sort((a, b) => {
        if (a.type === "main") return -1;
        if (b.type === "main") return 1;
        const ta = a.lastTime ?? "";
        const tb = b.lastTime ?? "";
        return tb.localeCompare(ta);
      });

      setChannels(built);
    } catch (e) {
      console.error("loadChannels error:", e);
    } finally {
      setLoading(false);
    }
  }, [myMemberId, activeClub]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const loadReactionsForMessages = useCallback(async (msgIds: string[]) => {
    if (!msgIds.length) return;
    const { data } = await supabase
      .from("message_reactions")
      .select("message_id, emoji, member_id, member:members(first_name, last_name, preferred_name)")
      .in("message_id", msgIds);
    if (!data) return;
    const grouped: Record<string, ReactionGroup[]> = {};
    for (const r of data) {
      if (!grouped[r.message_id]) grouped[r.message_id] = [];
      const existing = grouped[r.message_id].find((g) => g.emoji === r.emoji);
      const member = r.member as {
        preferred_name?: string;
        first_name?: string;
        last_name?: string;
      } | null;
      const name =
        member?.preferred_name ||
        [member?.first_name, member?.last_name].filter(Boolean).join(" ") ||
        "Unknown";
      if (existing) {
        existing.memberIds.push(r.member_id);
        existing.names.push(name);
      } else {
        grouped[r.message_id].push({ emoji: r.emoji, memberIds: [r.member_id], names: [name] });
      }
    }
    setReactions(grouped);
  }, []);

  const loadMessages = useCallback(
    async (channelId: string, lastReadAt?: string | null) => {
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("id, sender_id, body, created_at, edited_at, deleted_at, reply_to_id")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (!msgs) return [];

      // Fetch sender names
      const senderIds = [...new Set(msgs.map((m) => m.sender_id).filter(Boolean) as string[])];
      const nameMap: Record<string, string> = {};
      if (senderIds.length > 0) {
        const { data: senders } = await supabase
          .from("members")
          .select("id, first_name, last_name, preferred_name")
          .in("id", senderIds);
        (senders ?? []).forEach((s) => {
          nameMap[s.id] =
            s.preferred_name || [s.first_name, s.last_name].filter(Boolean).join(" ") || "Unknown";
        });
      }

      const byId = new Map(msgs.map((m) => [m.id, m]));
      const built: Message[] = msgs.map((m) => {
        const replyTo = m.reply_to_id ? byId.get(m.reply_to_id) : undefined;
        return {
          ...m,
          senderName: m.sender_id ? (nameMap[m.sender_id] ?? "Unknown") : "System",
          replyToBody: replyTo?.body,
          replyToSender: replyTo
            ? replyTo.sender_id
              ? (nameMap[replyTo.sender_id] ?? "Unknown")
              : "System"
            : undefined,
        };
      });

      const firstUnread = lastReadAt
        ? built.find((m) => new Date(m.created_at).getTime() > new Date(lastReadAt).getTime())
        : undefined;
      setFirstUnreadId(firstUnread?.id ?? null);
      setMessages(built);
      void loadReactionsForMessages(built.map((m) => m.id));
      return built;
    },
    [loadReactionsForMessages],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!myMemberId) return;
      const myReaction = reactions[messageId]?.find(
        (r) => r.emoji === emoji && r.memberIds.includes(myMemberId),
      );
      if (myReaction) {
        await supabase
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("member_id", myMemberId)
          .eq("emoji", emoji);
      } else {
        await supabase
          .from("message_reactions")
          .insert({ message_id: messageId, member_id: myMemberId, emoji });
      }
    },
    [myMemberId, reactions],
  );

  const loadReadReceipts = useCallback(
    async (msgId: string) => {
      const { data } = await supabase
        .from("message_reads")
        .select("member_id, member:members(first_name, preferred_name)")
        .eq("message_id", msgId)
        .neq("member_id", myMemberId ?? "");
      setLastReadBy(
        (data ?? []).map((r) => {
          const m = r.member as { preferred_name?: string; first_name?: string } | null;
          return m?.preferred_name || m?.first_name || "Someone";
        }),
      );
    },
    [myMemberId],
  );

  const markRead = useCallback(
    async (channelId: string) => {
      if (!myMemberId) return;
      const now = new Date().toISOString();
      await supabase
        .from("chat_members")
        .update({ last_read_at: now })
        .eq("channel_id", channelId)
        .eq("member_id", myMemberId);
      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, unread: 0 } : c)));
      if (messages.length > 0) {
        const latestId = messages[messages.length - 1].id;
        await supabase
          .from("message_reads")
          .upsert(
            { message_id: latestId, member_id: myMemberId, read_at: now },
            { onConflict: "message_id,member_id" },
          );
      }
    },
    [myMemberId, messages],
  );

  // Subscribe to realtime changes for a channel. Uses a wildcard event ('*') so
  // INSERT/UPDATE/DELETE are all captured, a unique channel name per chat channel
  // to avoid websocket conflicts, and logs the subscription status to the console.
  const subscribeToChannel = useCallback(
    (channelId: string) => {
      if (realtimeRef.current) {
        void supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }

      const ch = supabase
        .channel(`chat-${channelId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chat_messages",
            filter: `channel_id=eq.${channelId}`,
          },
          async (payload) => {
            if (payload.eventType === "INSERT") {
              const msg = payload.new as {
                id: string;
                sender_id: string | null;
                body: string;
                created_at: string;
                edited_at: string | null;
                deleted_at: string | null;
                reply_to_id: string | null;
              };
              let senderName = "Unknown";
              if (msg.sender_id) {
                const { data: s } = await supabase
                  .from("members")
                  .select("first_name, last_name, preferred_name")
                  .eq("id", msg.sender_id)
                  .maybeSingle();
                if (s)
                  senderName =
                    s.preferred_name ||
                    [s.first_name, s.last_name].filter(Boolean).join(" ") ||
                    "Unknown";
              }
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev;
                const replyTo = msg.reply_to_id
                  ? prev.find((m) => m.id === msg.reply_to_id)
                  : undefined;
                return [
                  ...prev,
                  {
                    ...msg,
                    senderName,
                    replyToBody: replyTo?.body,
                    replyToSender: replyTo?.senderName,
                  },
                ];
              });
              void markRead(channelId);
              void loadChannels();
            } else if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string }).id;
              if (!oldId) return;
              setMessages((prev) => prev.filter((m) => m.id !== oldId));
              void loadChannels();
            } else if (payload.eventType === "UPDATE") {
              const msg = payload.new as {
                id: string;
                body: string;
                edited_at: string | null;
                deleted_at: string | null;
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === msg.id
                    ? { ...m, body: msg.body, edited_at: msg.edited_at, deleted_at: msg.deleted_at }
                    : m,
                ),
              );
            }
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "message_reactions" },
          () => {
            void loadReactionsForMessages(messageIdsRef.current);
          },
        )
        .on("presence", { event: "sync" }, () => {
          const state = ch.presenceState<{ name: string; typing: boolean }>();
          const typing = Object.values(state)
            .flat()
            .filter((p) => p.typing && p.name !== myMemberName)
            .map((p) => p.name);
          setTypingNames(typing);
        })
        .subscribe((status, err) => {
          console.log(`[chat] realtime status for chat-${channelId}:`, status, err ?? "");
        });

      realtimeRef.current = ch;
    },
    [markRead, loadChannels, loadReactionsForMessages, myMemberName],
  );

  const openChannel = useCallback(
    async (channelId: string) => {
      setActiveChannelId(channelId);
      setShowThread(true);
      initialScrollDoneRef.current = false;
      const ch = channels.find((c) => c.id === channelId);
      await loadMessages(channelId, ch?.lastReadAt);
      await markRead(channelId);
      // Subscription is (re)established by the effect keyed on activeChannelId below.
    },
    [loadMessages, markRead, channels],
  );

  // (Re)subscribe to realtime whenever the selected channel changes.
  useEffect(() => {
    if (!activeChannelId) return;
    subscribeToChannel(activeChannelId);
    return () => {
      if (realtimeRef.current) {
        void supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }
    };
  }, [activeChannelId, subscribeToChannel]);

  // When the tab becomes visible again, the websocket may have dropped while
  // backgrounded. Refetch messages and resubscribe so PCs that were in the
  // background still pick up messages sent from other devices.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !activeChannelId) return;
      console.log("[chat] tab visible — refetching messages and resubscribing");
      void loadMessages(activeChannelId);
      void markRead(activeChannelId);
      void loadChannels();
      subscribeToChannel(activeChannelId);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [activeChannelId, loadMessages, markRead, loadChannels, subscribeToChannel]);

  useEffect(() => {
    return () => {
      if (realtimeRef.current) void supabase.removeChannel(realtimeRef.current);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const startLongPress = useCallback((e: React.PointerEvent, msg: Message) => {
    longPressFiredRef.current = false;
    const x = e.clientX;
    const y = e.clientY;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFiredRef.current = true;
      setActionMsg(msg);
      setActionMenuPos({ x, y });
    }, 500);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleBubbleClick = useCallback((msg: Message) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    setVisibleTimestamp((prev) => (prev === msg.id ? null : msg.id));
  }, []);

  const softDeleteMessage = useCallback(
    async (id: string) => {
      setActionMsg(null);
      const now = new Date().toISOString();
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleted_at: now } : m)));
      const { error } = await supabase
        .from("chat_messages")
        .update({ deleted_at: now })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        if (activeChannelId) void loadMessages(activeChannelId);
        return;
      }
      void loadChannels();
    },
    [activeChannelId, loadMessages, loadChannels],
  );

  const copyMessage = useCallback((msg: Message) => {
    setActionMsg(null);
    void navigator.clipboard.writeText(msg.body);
    toast.success("Copied to clipboard");
  }, []);

  const startReply = useCallback((msg: Message) => {
    setReplyingTo(msg);
    setActionMsg(null);
  }, []);

  const startEdit = useCallback((msg: Message) => {
    setEditingId(msg.id);
    setEditBody(msg.body);
    setActionMsg(null);
  }, []);

  const saveEdit = useCallback(
    async (id: string) => {
      const trimmed = editBody.trim();
      if (!trimmed) return;
      const now = new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, body: trimmed, edited_at: now } : m)),
      );
      setEditingId(null);
      const { error } = await supabase
        .from("chat_messages")
        .update({ body: trimmed, edited_at: now })
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        if (activeChannelId) void loadMessages(activeChannelId);
      }
    },
    [editBody, activeChannelId, loadMessages],
  );

  useEffect(() => {
    if (messages.length === 0) return;
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      if (firstUnreadId) {
        unreadDividerRef.current?.scrollIntoView({ block: "center" });
      } else {
        bottomRef.current?.scrollIntoView();
      }
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, firstUnreadId]);

  useEffect(() => {
    messageIdsRef.current = messages.map((m) => m.id);
  }, [messages]);

  useEffect(() => {
    if (!myMemberId || messages.length === 0) return;
    const lastMine = [...messages].reverse().find((m) => m.sender_id === myMemberId);
    if (!lastMine) {
      setLastReadBy([]);
      return;
    }
    void loadReadReceipts(lastMine.id);
  }, [messages, myMemberId, loadReadReceipts]);

  const sendMessage = async () => {
    if (!body.trim() || !activeChannelId || !myMemberId) return;
    setSending(true);
    const trimmed = body.trim();
    const replyTo = replyingTo;
    setBody("");
    setReplyingTo(null);
    const { data: inserted, error } = await supabase
      .from("chat_messages")
      .insert({
        channel_id: activeChannelId,
        sender_id: myMemberId,
        body: trimmed,
        reply_to_id: replyTo?.id ?? null,
      })
      .select("id, sender_id, body, created_at, edited_at, deleted_at, reply_to_id")
      .single();
    setSending(false);
    if (error) {
      toast.error(error.message);
      setBody(trimmed);
      setReplyingTo(replyTo);
      return;
    }
    if (inserted) {
      setMessages((prev) =>
        prev.some((m) => m.id === inserted.id)
          ? prev
          : [
              ...prev,
              {
                ...inserted,
                senderName: myMemberName,
                replyToBody: replyTo?.body,
                replyToSender: replyTo?.senderName,
              },
            ],
      );
    }
  };

  const openNewChat = async () => {
    if (!activeClub) return;
    const { data } = await supabase
      .from("members")
      .select("id, first_name, last_name, preferred_name")
      .eq("club_id", activeClub.club_id);
    setClubMembers(
      (data ?? [])
        .filter((m) => m.id !== myMemberId)
        .map((m) => ({
          id: m.id,
          name:
            m.preferred_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || "Unknown",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setSelectedMembers([]);
    setChatName("");
    setChatType("group");
    setMemberSearch("");
    setNewChatOpen(true);
  };

  const createChat = async () => {
    if (!activeClub || !myMemberId || selectedMembers.length === 0) return;
    setCreating(true);
    const name =
      chatName.trim() ||
      (chatType === "direct"
        ? (clubMembers.find((m) => m.id === selectedMembers[0])?.name ?? "Direct")
        : "Group Chat");

    const { data: chan, error: chanErr } = await supabase
      .from("chat_channels")
      .insert({ club_id: activeClub.club_id, name, type: chatType, created_by: myMemberId })
      .select("id")
      .single();
    if (chanErr || !chan) {
      toast.error(chanErr?.message ?? "Failed");
      setCreating(false);
      return;
    }

    const memberRows = [myMemberId, ...selectedMembers].map((mid) => ({
      channel_id: chan.id,
      member_id: mid,
    }));
    await supabase.from("chat_members").insert(memberRows);

    setCreating(false);
    setNewChatOpen(false);
    await loadChannels();
    void openChannel(chan.id);
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const filteredMembers = clubMembers.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  const renderActionRows = (msg: Message, compact: boolean) => {
    const isMe = msg.sender_id === myMemberId;
    const rowClass = compact
      ? "w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent/60 transition-colors"
      : "w-full flex items-center gap-3 h-12 px-2 text-base text-left rounded-lg hover:bg-accent/60 transition-colors";
    const iconClass = compact ? "h-4 w-4" : "h-5 w-5";
    return (
      <>
        <div className="flex justify-around mb-3 pb-3 border-b">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                void toggleReaction(msg.id, emoji);
                setActionMsg(null);
              }}
              className="text-2xl hover:scale-125 transition-transform active:scale-110 p-1"
            >
              {emoji}
            </button>
          ))}
        </div>
        <button type="button" className={rowClass} onClick={() => copyMessage(msg)}>
          <Copy className={iconClass} /> Copy
        </button>
        <button type="button" className={rowClass} onClick={() => startReply(msg)}>
          <Reply className={iconClass} /> Reply
        </button>
        {isMe && !msg.deleted_at && (
          <button type="button" className={rowClass} onClick={() => startEdit(msg)}>
            <Pencil className={iconClass} /> Edit
          </button>
        )}
        {isMe && !msg.deleted_at && (
          <button
            type="button"
            className={`${rowClass} text-destructive`}
            onClick={() => void softDeleteMessage(msg.id)}
          >
            <Trash2 className={iconClass} /> Delete
          </button>
        )}
        {canManage && !isMe && !msg.deleted_at && (
          <button
            type="button"
            className={`${rowClass} text-destructive`}
            onClick={() => void softDeleteMessage(msg.id)}
          >
            <ShieldAlert className={iconClass} /> Admin delete
          </button>
        )}
      </>
    );
  };

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] -mx-4 md:-mx-6 -mt-4 md:-mt-6 overflow-hidden rounded-none md:rounded-xl border bg-background">
        {/* Left panel — channel list */}
        <div
          className={`flex flex-col w-full md:w-72 border-r shrink-0 ${showThread ? "hidden md:flex" : "flex"}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <h2 className="font-semibold text-sm">Messages</h2>
            {canManage && (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={openNewChat}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Loading…</div>
            ) : channels.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No conversations yet
              </div>
            ) : (
              channels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => openChannel(ch.id)}
                  className={`w-full text-left px-4 py-4 border-b hover:bg-muted/40 transition-colors flex items-start gap-3 ${
                    activeChannelId === ch.id ? "bg-muted/60" : ""
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-[#FF6600]/10 flex items-center justify-center shrink-0 text-[#FF6600]">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-semibold truncate">{ch.name}</span>
                      {ch.lastTime && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {fmtTime(ch.lastTime)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">
                        {ch.lastMessage ?? "No messages yet"}
                      </span>
                      {ch.unread > 0 && (
                        <Badge className="shrink-0 h-5 min-w-5 rounded-full text-[10px] px-2 bg-[#FF6600] text-white">
                          {ch.unread}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Right panel — message thread */}
        <div className={`flex flex-col flex-1 min-w-0 ${showThread ? "flex" : "hidden md:flex"}`}>
          {!activeChannelId ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={<MessageSquare className="h-5 w-5" />}
                title="Select a conversation"
                description="Choose a channel from the list to start chatting"
              />
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30 shrink-0">
                <button
                  type="button"
                  className="md:hidden h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted"
                  onClick={() => {
                    setShowThread(false);
                    setActiveChannelId(null);
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="font-semibold text-sm truncate">{activeChannel?.name ?? ""}</div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-3">
                <div>
                  {messages.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-8">
                      No messages yet. Say hello!
                    </div>
                  )}
                  {messages.map((msg, idx, arr) => {
                    const isMe = msg.sender_id === myMemberId;
                    const isLastMine =
                      isMe && !arr.slice(idx + 1).some((m) => m.sender_id === myMemberId);
                    const grouped = isGrouped(messages, idx);
                    const lastInGroup = isLastInGroup(messages, idx);
                    const isDeleted = !!msg.deleted_at;
                    const isEditing = editingId === msg.id;

                    return (
                      <div key={msg.id}>
                        {msg.id === firstUnreadId && (
                          <div ref={unreadDividerRef} className="flex items-center gap-2 my-3">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-xs text-muted-foreground shrink-0">
                              Unread messages
                            </span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                        )}
                        <div
                          className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3"}`}
                        >
                          {!isMe &&
                            (lastInGroup ? (
                              <Avatar className="h-7 w-7 shrink-0">
                                <AvatarFallback className="text-[10px]">
                                  {initials(msg.senderName ?? "?")}
                                </AvatarFallback>
                              </Avatar>
                            ) : (
                              <div className="h-7 w-7 shrink-0" />
                            ))}
                          <div
                            className={`max-w-[75%] flex flex-col ${isMe ? "items-end" : "items-start"}`}
                          >
                            {!isMe && !grouped && (
                              <span className="text-[10px] text-muted-foreground mb-0.5 px-1">
                                {msg.senderName}
                              </span>
                            )}
                            {visibleTimestamp === msg.id && (
                              <div className="text-xs text-muted-foreground text-center w-full mb-1">
                                {fmtTime(msg.created_at)}
                              </div>
                            )}
                            {isDeleted ? (
                              <div className="text-sm italic text-muted-foreground px-1 py-1">
                                Message deleted
                              </div>
                            ) : isEditing ? (
                              <div className="flex flex-col gap-1 w-full min-w-[200px]">
                                <Textarea
                                  value={editBody}
                                  onChange={(e) => setEditBody(e.target.value)}
                                  className="min-h-[60px] text-sm"
                                  autoFocus
                                />
                                <div className="flex gap-2 justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingId(null)}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="bg-[#FF6600] hover:bg-[#E65C00]"
                                    onClick={() => void saveEdit(msg.id)}
                                  >
                                    Save
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div
                                onPointerDown={(e) => startLongPress(e, msg)}
                                onPointerUp={cancelLongPress}
                                onPointerLeave={cancelLongPress}
                                onPointerMove={cancelLongPress}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  longPressFiredRef.current = true;
                                  setActionMsg(msg);
                                  setActionMenuPos({ x: e.clientX, y: e.clientY });
                                }}
                                onClick={() => handleBubbleClick(msg)}
                                className={`px-3 py-2 text-sm break-words select-none cursor-pointer rounded-[20px] ${
                                  isMe
                                    ? "bg-[#FF6600] text-white rounded-br-[4px]"
                                    : "bg-[#F0F0F0] dark:bg-[#2C2C2E] text-foreground rounded-bl-[4px]"
                                }`}
                              >
                                {msg.replyToBody && (
                                  <div
                                    className={`text-xs mb-1 pl-2 border-l-2 truncate opacity-80 ${isMe ? "border-white/60" : "border-foreground/30"}`}
                                  >
                                    <div className="font-medium">{msg.replyToSender}</div>
                                    <div className="truncate">{msg.replyToBody}</div>
                                  </div>
                                )}
                                {msg.body}
                                {msg.edited_at && !msg.deleted_at && (
                                  <span className="text-xs opacity-70 ml-1">(edited)</span>
                                )}
                              </div>
                            )}
                            {!isDeleted && reactions[msg.id]?.length > 0 && (
                              <div
                                className={`flex flex-wrap gap-1 mt-1 ${isMe ? "justify-end" : "justify-start"}`}
                              >
                                {reactions[msg.id].map((r) => {
                                  const iMine = r.memberIds.includes(myMemberId ?? "");
                                  return (
                                    <button
                                      key={r.emoji}
                                      onClick={() => void toggleReaction(msg.id, r.emoji)}
                                      title={r.names.join(", ")}
                                      className={`flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
                                        iMine
                                          ? "bg-[#FF6600]/10 border-[#FF6600] text-[#FF6600]"
                                          : "bg-muted border-border text-foreground"
                                      }`}
                                    >
                                      <span>{r.emoji}</span>
                                      <span>{r.memberIds.length}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {isLastMine && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 text-right">
                                {lastReadBy.length === 0
                                  ? "Delivered"
                                  : `Read by ${lastReadBy.slice(0, 2).join(", ")}${
                                      lastReadBy.length > 2 ? ` +${lastReadBy.length - 2}` : ""
                                    }`}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              {/* Reply preview */}
              {replyingTo && (
                <div className="flex items-start justify-between gap-2 bg-muted rounded-lg px-3 py-2 mx-4 mb-1 border-l-4 border-[#FF6600]">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#FF6600] flex items-center gap-1">
                      <Reply className="h-3 w-3" /> Replying to{" "}
                      {replyingTo.sender_id === myMemberId ? "yourself" : replyingTo.senderName}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {replyingTo.deleted_at ? "Message deleted" : replyingTo.body}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full hover:bg-background/60"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Typing indicator */}
              {typingNames.length > 0 && (
                <div className="px-4 pb-1 text-xs text-muted-foreground flex items-center gap-1">
                  <span className="flex gap-0.5">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>
                      •
                    </span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>
                      •
                    </span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>
                      •
                    </span>
                  </span>
                  <span>
                    {typingNames.length === 1
                      ? `${typingNames[0]} is typing...`
                      : typingNames.length === 2
                        ? `${typingNames[0]} and ${typingNames[1]} are typing...`
                        : "Several people are typing..."}
                  </span>
                </div>
              )}

              {/* Input */}
              <div
                className="px-4 py-3 border-t bg-background shrink-0 flex gap-2 items-end"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
              >
                <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" disabled>
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Textarea
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    if (!activeChannelId) return;
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                    void realtimeRef.current?.track({ name: myMemberName, typing: true });
                    typingTimeoutRef.current = setTimeout(() => {
                      void realtimeRef.current?.track({ name: myMemberName, typing: false });
                    }, 2000);
                  }}
                  placeholder="Type a message…"
                  className="flex-1 min-h-[44px] max-h-[120px] overflow-y-auto resize-none"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                />
                <Button size="icon" variant="ghost" className="h-10 w-10 shrink-0" disabled>
                  <SmilePlus className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  className="h-10 w-10 bg-[#FF6600] hover:bg-[#E65C00] shrink-0"
                  onClick={() => void sendMessage()}
                  disabled={sending || !body.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* New chat dialog */}
      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New conversation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={chatType === "group" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setChatType("group")}
              >
                Group
              </Button>
              <Button
                size="sm"
                variant={chatType === "direct" ? "default" : "outline"}
                className="flex-1"
                onClick={() => {
                  setChatType("direct");
                  setSelectedMembers([]);
                }}
              >
                Direct
              </Button>
            </div>
            {chatType === "group" && (
              <Input
                value={chatName}
                onChange={(e) => setChatName(e.target.value)}
                placeholder="Chat name (optional)"
                className="h-9"
              />
            )}
            <Input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search members…"
              className="h-9"
            />
            <ScrollArea className="h-48 border rounded-md">
              {filteredMembers.map((m) => {
                const selected = selectedMembers.includes(m.id);
                const disabled = chatType === "direct" && selectedMembers.length >= 1 && !selected;
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setSelectedMembers((prev) =>
                        prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                      );
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left border-b hover:bg-muted/40 transition-colors ${selected ? "bg-muted/60" : ""} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback className="text-[10px]">{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate">{m.name}</span>
                    {selected && <span className="text-[#FF6600] text-xs font-medium">✓</span>}
                  </button>
                );
              })}
            </ScrollArea>
            {selectedMembers.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {selectedMembers.length} member{selectedMembers.length !== 1 ? "s" : ""} selected
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewChatOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void createChat()}
              disabled={creating || selectedMembers.length === 0}
              className="bg-[#FF6600] hover:bg-[#E65C00]"
            >
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message action menu — bottom sheet on mobile, popover on desktop */}
      {actionMsg && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setActionMsg(null)} />
          <div
            className="fixed bottom-0 left-0 w-full rounded-t-2xl bg-background shadow-xl p-4 z-50 sm:hidden"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            {renderActionRows(actionMsg, false)}
          </div>
          <div
            className="fixed z-50 hidden sm:block min-w-[200px] rounded-lg border bg-popover text-popover-foreground shadow-md py-1 animate-in fade-in-0 zoom-in-95"
            style={{
              left: Math.max(8, Math.min(actionMenuPos.x, window.innerWidth - 216)),
              top: Math.max(8, Math.min(actionMenuPos.y, window.innerHeight - 280)),
            }}
          >
            {renderActionRows(actionMsg, true)}
          </div>
        </>
      )}
    </AppShell>
  );
}

async function ensureMainChannel(clubId: string, clubName: string, memberId: string) {
  // Find or create main channel
  const { data: existing } = await supabase
    .from("chat_channels")
    .select("id")
    .eq("club_id", clubId)
    .eq("type", "main")
    .maybeSingle();

  let channelId: string;
  if (existing) {
    channelId = existing.id;
  } else {
    const { data: created } = await supabase
      .from("chat_channels")
      .insert({ club_id: clubId, name: clubName, type: "main" })
      .select("id")
      .single();
    if (!created) return;
    channelId = created.id;
  }

  // Check if already a member
  const { data: membership } = await supabase
    .from("chat_members")
    .select("id")
    .eq("channel_id", channelId)
    .eq("member_id", memberId)
    .maybeSingle();

  if (!membership) {
    await supabase.from("chat_members").insert({ channel_id: channelId, member_id: memberId });
  }
}
