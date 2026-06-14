import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useClub, useCanManage } from "@/lib/club-context";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hash, MessageSquare, Plus, Send, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Channel = {
  id: string;
  name: string;
  type: string;
  description: string | null;
};

type Message = {
  id: string;
  channel_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender_name?: string;
};

export const Route = createFileRoute("/_app/chat")({
  head: () => ({ meta: [{ title: "Chat — IRB Coaching" }] }),
  component: ChatPage,
});

function ChatPage() {
  const { activeClub } = useClub();
  const { user } = useAuth();
  const canManage = useCanManage();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const clubId = activeClub?.club_id ?? null;
  const userId = user?.id ?? null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadChannels = useCallback(async () => {
    if (!clubId || !userId) return;

    // Find or create the main channel for this club
    let { data: mainChannel } = await supabase
      .from("chat_channels")
      .select("id, name, type, description")
      .eq("club_id", clubId)
      .eq("type", "main")
      .maybeSingle();

    if (!mainChannel) {
      const clubName = activeClub?.club?.name ?? "General";
      const { data: created, error } = await supabase
        .from("chat_channels")
        .insert({ club_id: clubId, name: clubName, type: "main", created_by: userId })
        .select("id, name, type, description")
        .single();
      if (error) { toast.error(error.message); return; }
      mainChannel = created;
    }

    // Auto-join main channel if not already a member
    if (mainChannel) {
      const { data: existing } = await supabase
        .from("chat_members")
        .select("id")
        .eq("channel_id", mainChannel.id)
        .eq("member_id", userId)
        .maybeSingle();
      if (!existing) {
        await supabase.from("chat_members").insert({
          channel_id: mainChannel.id,
          member_id: userId,
        });
      }
    }

    // Load all channels this user belongs to for this club
    const { data: memberRows } = await supabase
      .from("chat_members")
      .select("channel_id")
      .eq("member_id", userId);

    const channelIds = (memberRows ?? []).map((r) => r.channel_id as string);
    if (channelIds.length === 0) { setChannels([]); return; }

    const { data: ch } = await supabase
      .from("chat_channels")
      .select("id, name, type, description")
      .in("id", channelIds)
      .eq("club_id", clubId)
      .order("name");

    const list = (ch ?? []) as Channel[];
    // Main channel first
    list.sort((a, b) => {
      if (a.type === "main") return -1;
      if (b.type === "main") return 1;
      return a.name.localeCompare(b.name);
    });

    setChannels(list);

    setSelectedChannel((prev) => {
      if (prev) return prev;
      return list.find((c) => c.type === "main") ?? list[0] ?? null;
    });
  }, [clubId, userId, activeClub?.club?.name]);

  useEffect(() => { loadChannels(); }, [loadChannels]);

  const loadMessages = useCallback(async () => {
    if (!selectedChannel) return;

    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, channel_id, sender_id, body, created_at")
      .eq("channel_id", selectedChannel.id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) { toast.error(error.message); return; }

    const msgs = (data ?? []) as Message[];

    const senderIds = [...new Set(msgs.map((m) => m.sender_id))];
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", senderIds);
      const nameMap = new Map((profiles ?? []).map((p) => [p.id, (p.full_name as string) ?? "Unknown"]));
      msgs.forEach((m) => { m.sender_name = nameMap.get(m.sender_id) ?? "Unknown"; });
    }

    setMessages(msgs);
  }, [selectedChannel?.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Real-time subscription
  useEffect(() => {
    if (!selectedChannel) return;

    const sub = supabase
      .channel(`chat-messages-${selectedChannel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `channel_id=eq.${selectedChannel.id}`,
        },
        async (payload) => {
          const msg = payload.new as Message;
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", msg.sender_id)
            .maybeSingle();
          msg.sender_name = (profile?.full_name as string) ?? "Unknown";
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(sub); };
  }, [selectedChannel?.id]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsg.trim() || !selectedChannel || !userId) return;
    setSending(true);
    const { error } = await supabase.from("chat_messages").insert({
      channel_id: selectedChannel.id,
      sender_id: userId,
      body: newMsg.trim(),
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setNewMsg("");
  };

  const createChannel = async () => {
    if (!newChannelName.trim() || !clubId || !userId) return;
    const { data, error } = await supabase
      .from("chat_channels")
      .insert({
        club_id: clubId,
        name: newChannelName.trim(),
        type: "group",
        created_by: userId,
      })
      .select("id, name, type, description")
      .single();
    if (error) { toast.error(error.message); return; }
    await supabase.from("chat_members").insert({
      channel_id: data.id,
      member_id: userId,
    });
    const newCh = data as Channel;
    setChannels((prev) => [...prev, newCh]);
    setNewChannelName("");
    setShowNewChannel(false);
    selectChannel(newCh);
    toast.success("Channel created");
  };

  const selectChannel = (ch: Channel) => {
    setSelectedChannel(ch);
    setMobileShowThread(true);
  };

  if (!activeClub) return null;

  return (
    <AppShell>
      <h1 className="text-2xl font-bold mb-4 md:hidden">Chat</h1>
      <div className="flex border rounded-lg overflow-hidden bg-background" style={{ height: "calc(100vh - 180px)", minHeight: 400 }}>

        {/* Channel list — hidden on mobile when thread is open */}
        <div className={cn(
          "w-full md:w-52 shrink-0 border-r flex flex-col bg-muted/30",
          mobileShowThread ? "hidden md:flex" : "flex",
        )}>
          <div className="p-3 border-b flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Channels</span>
            {canManage && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setShowNewChannel((s) => !s)}
                aria-label="New channel"
              >
                {showNewChannel ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>

          {showNewChannel && (
            <div className="p-2 border-b flex gap-1 shrink-0">
              <Input
                placeholder="Channel name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                className="h-7 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void createChannel(); }
                }}
                autoFocus
              />
              <Button size="sm" className="h-7 px-2 text-xs shrink-0" onClick={() => void createChannel()}>
                Add
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto py-1">
            {channels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => selectChannel(ch)}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors",
                  selectedChannel?.id === ch.id
                    ? "bg-accent/20 text-accent font-semibold"
                    : "hover:bg-muted/60 text-foreground/70",
                )}
              >
                <Hash className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="truncate">{ch.name}</span>
              </button>
            ))}
            {channels.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground">No channels yet.</p>
            )}
          </div>
        </div>

        {/* Message thread — hidden on mobile when channel list is shown */}
        <div className={cn(
          "flex-1 flex flex-col min-w-0",
          !mobileShowThread ? "hidden md:flex" : "flex",
        )}>
          {selectedChannel ? (
            <>
              <div className="p-3 border-b flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="md:hidden text-muted-foreground mr-1"
                  onClick={() => setMobileShowThread(false)}
                  aria-label="Back to channels"
                >
                  ←
                </button>
                <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-semibold text-sm truncate">{selectedChannel.name}</span>
                {selectedChannel.description && (
                  <span className="text-xs text-muted-foreground hidden md:block truncate">
                    · {selectedChannel.description}
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center py-12 text-xs text-muted-foreground">
                    <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-30" />
                    No messages yet. Say hello!
                  </div>
                )}
                {messages.map((msg) => {
                  const isMe = msg.sender_id === userId;
                  return (
                    <div key={msg.id} className={cn("flex gap-2 items-end", isMe && "flex-row-reverse")}>
                      <div className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                        isMe ? "bg-[#E63329] text-white" : "bg-muted text-muted-foreground",
                      )}>
                        {(msg.sender_name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <div className={cn("max-w-[70%] flex flex-col", isMe && "items-end")}>
                        <div className={cn(
                          "text-[10px] text-muted-foreground mb-0.5",
                          isMe ? "text-right" : "text-left",
                        )}>
                          {isMe ? "You" : (msg.sender_name ?? "Unknown")}
                          {" · "}
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div className={cn(
                          "rounded-2xl px-3 py-2 text-sm break-words",
                          isMe
                            ? "bg-[#E63329] text-white rounded-tr-sm"
                            : "bg-muted text-foreground rounded-tl-sm",
                        )}>
                          {msg.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={(e) => void sendMessage(e)} className="p-3 border-t flex gap-2 shrink-0">
                <Input
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                  placeholder="Type a message…"
                  className="flex-1"
                  disabled={sending}
                />
                <Button type="submit" size="icon" disabled={!newMsg.trim() || sending}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-sm text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Select a channel to start chatting
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
