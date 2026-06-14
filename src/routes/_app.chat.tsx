import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClub, useCanManage } from "@/lib/club-context";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Send, MessageSquare, ArrowLeft } from "lucide-react";
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
};

type Message = {
  id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  senderName?: string;
};

type ClubMember = { id: string; name: string };

function initials(name: string) {
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
      const name = m.preferred_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || "Me";
      setMyMemberName(name);
    });
  }, [activeClub]);

  const loadChannels = useCallback(async () => {
    if (!myMemberId || !activeClub) return;

    // Ensure main channel exists + self is a member
    await ensureMainChannel(activeClub.club_id, activeClub.club.name, myMemberId);

    // Load channels I'm in
    const { data: cm } = await supabase
      .from("chat_members")
      .select("channel_id, last_read_at, channel:chat_channels(id, name, type)")
      .eq("member_id", myMemberId);

    if (!cm) return;

    const channelIds = cm.map((r) => r.channel_id);
    if (channelIds.length === 0) { setChannels([]); return; }

    // Last message per channel
    const msgPromises = channelIds.map((cid) =>
      supabase
        .from("chat_messages")
        .select("body, created_at")
        .eq("channel_id", cid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    );
    const msgResults = await Promise.all(msgPromises);

    // Unread counts
    const unreadPromises = cm.map((r) =>
      supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", r.channel_id)
        .gt("created_at", r.last_read_at ?? "1970-01-01")
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
  }, [myMemberId, activeClub]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const loadMessages = useCallback(async (channelId: string) => {
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("id, sender_id, body, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (!msgs) return;

    // Fetch sender names
    const senderIds = [...new Set(msgs.map((m) => m.sender_id).filter(Boolean) as string[])];
    let nameMap: Record<string, string> = {};
    if (senderIds.length > 0) {
      const { data: senders } = await supabase
        .from("members")
        .select("id, first_name, last_name, preferred_name")
        .in("id", senderIds);
      (senders ?? []).forEach((s) => {
        nameMap[s.id] = s.preferred_name || [s.first_name, s.last_name].filter(Boolean).join(" ") || "Unknown";
      });
    }

    setMessages(msgs.map((m) => ({
      ...m,
      senderName: m.sender_id ? (nameMap[m.sender_id] ?? "Unknown") : "System",
    })));
  }, []);

  const markRead = useCallback(async (channelId: string) => {
    if (!myMemberId) return;
    const now = new Date().toISOString();
    await supabase
      .from("chat_members")
      .update({ last_read_at: now })
      .eq("channel_id", channelId)
      .eq("member_id", myMemberId);
    setChannels((prev) =>
      prev.map((c) => c.id === channelId ? { ...c, unread: 0 } : c)
    );
  }, [myMemberId]);

  const openChannel = useCallback(async (channelId: string) => {
    setActiveChannelId(channelId);
    setShowThread(true);
    await loadMessages(channelId);
    await markRead(channelId);

    // Realtime subscription
    if (realtimeRef.current) void supabase.removeChannel(realtimeRef.current);
    const ch = supabase
      .channel(`chat:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        async (payload) => {
          const msg = payload.new as { id: string; sender_id: string | null; body: string; created_at: string };
          let senderName = "Unknown";
          if (msg.sender_id) {
            const { data: s } = await supabase
              .from("members")
              .select("first_name, last_name, preferred_name")
              .eq("id", msg.sender_id)
              .maybeSingle();
            if (s) senderName = s.preferred_name || [s.first_name, s.last_name].filter(Boolean).join(" ") || "Unknown";
          }
          setMessages((prev) => [...prev, { ...msg, senderName }]);
          void markRead(channelId);
          void loadChannels();
        },
      )
      .subscribe();
    realtimeRef.current = ch;
  }, [loadMessages, markRead, loadChannels]);

  useEffect(() => {
    return () => { if (realtimeRef.current) void supabase.removeChannel(realtimeRef.current); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!body.trim() || !activeChannelId || !myMemberId) return;
    setSending(true);
    const { error } = await supabase.from("chat_messages").insert({
      channel_id: activeChannelId,
      sender_id: myMemberId,
      body: body.trim(),
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setBody("");
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
          name: m.preferred_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || "Unknown",
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
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
    const name = chatName.trim() || (chatType === "direct"
      ? (clubMembers.find((m) => m.id === selectedMembers[0])?.name ?? "Direct")
      : "Group Chat");

    const { data: chan, error: chanErr } = await supabase
      .from("chat_channels")
      .insert({ club_id: activeClub.club_id, name, type: chatType, created_by: myMemberId })
      .select("id")
      .single();
    if (chanErr || !chan) { toast.error(chanErr?.message ?? "Failed"); setCreating(false); return; }

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
    m.name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] -mx-4 md:-mx-6 -mt-4 md:-mt-6 overflow-hidden rounded-none md:rounded-xl border bg-background">
        {/* Left panel — channel list */}
        <div className={`flex flex-col w-full md:w-72 border-r shrink-0 ${showThread ? "hidden md:flex" : "flex"}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <h2 className="font-semibold text-sm">Messages</h2>
            {canManage && (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={openNewChat}>
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>

          <ScrollArea className="flex-1">
            {channels.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">Loading…</div>
            ) : (
              channels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => openChannel(ch.id)}
                  className={`w-full text-left px-4 py-3 border-b hover:bg-muted/40 transition-colors flex items-start gap-3 ${
                    activeChannelId === ch.id ? "bg-muted/60" : ""
                  }`}
                >
                  <div className="h-9 w-9 rounded-full bg-[#E63329]/10 flex items-center justify-center shrink-0 text-[#E63329]">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium truncate">{ch.name}</span>
                      {ch.lastTime && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{fmtTime(ch.lastTime)}</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">
                        {ch.lastMessage ?? "No messages yet"}
                      </span>
                      {ch.unread > 0 && (
                        <Badge className="shrink-0 h-4 min-w-4 text-[10px] px-1 bg-[#E63329] text-white">
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
                  onClick={() => { setShowThread(false); setActiveChannelId(null); }}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="font-semibold text-sm truncate">{activeChannel?.name ?? ""}</div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-3">
                <div className="space-y-3">
                  {messages.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-8">No messages yet. Say hello!</div>
                  )}
                  {messages.map((msg) => {
                    const isMe = msg.sender_id === myMemberId;
                    return (
                      <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                        {!isMe && (
                          <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                            <AvatarFallback className="text-[10px]">{initials(msg.senderName ?? "?")}</AvatarFallback>
                          </Avatar>
                        )}
                        <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                          {!isMe && (
                            <span className="text-[10px] text-muted-foreground mb-0.5 px-1">{msg.senderName}</span>
                          )}
                          <div
                            className={`rounded-2xl px-3 py-2 text-sm break-words ${
                              isMe
                                ? "bg-[#E63329] text-white rounded-tr-sm"
                                : "bg-muted text-foreground rounded-tl-sm"
                            }`}
                          >
                            {msg.body}
                          </div>
                          <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                            {fmtTime(msg.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="px-4 py-3 border-t shrink-0 flex gap-2">
                <Input
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1 h-10"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
                />
                <Button
                  size="icon"
                  className="h-10 w-10 bg-[#E63329] hover:bg-[#c42b22] shrink-0"
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
                onClick={() => { setChatType("direct"); setSelectedMembers([]); }}
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
                        prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                      );
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left border-b hover:bg-muted/40 transition-colors ${selected ? "bg-muted/60" : ""} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback className="text-[10px]">{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate">{m.name}</span>
                    {selected && <span className="text-[#E63329] text-xs font-medium">✓</span>}
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
            <Button variant="outline" onClick={() => setNewChatOpen(false)}>Cancel</Button>
            <Button
              onClick={() => void createChat()}
              disabled={creating || selectedMembers.length === 0}
              className="bg-[#E63329] hover:bg-[#c42b22]"
            >
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
