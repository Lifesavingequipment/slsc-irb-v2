import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ClipboardList, ChevronDown, ChevronUp, BookmarkPlus, FolderOpen } from "lucide-react";
import { toast } from "sonner";

type QType = "yes_no" | "text" | "single_choice";

export type SurveyQuestion = {
  id?: string;
  position: number;
  question_text: string;
  question_type: QType;
  options: string[];
  required: boolean;
};

export type SurveyResponse = {
  question_id: string;
  answer_text: string | null;
  answer_bool: boolean | null;
  answer_choice: string | null;
};

export const TYPE_LABEL: Record<QType, string> = {
  yes_no: "Yes / No",
  text: "Short answer",
  single_choice: "Choose one",
};

export function emptyQuestion(position: number): SurveyQuestion {
  return { position, question_text: "", question_type: "yes_no", options: [], required: true };
}

/** Coach/admin: build the list of questions for this session, with template save/apply. */
export function SurveyEditor({
  sessionId, clubId, canManageTemplates,
}: { sessionId: string; clubId: string; canManageTemplates: boolean }) {
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; questions: SurveyQuestion[] }[]>([]);
  const [pickTpl, setPickTpl] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("session_survey_questions")
      .select("id, position, question_text, question_type, options, required")
      .eq("session_id", sessionId)
      .order("position");
    setQuestions(
      ((data ?? []) as any[]).map((q) => ({
        id: q.id,
        position: q.position,
        question_text: q.question_text,
        question_type: q.question_type,
        options: Array.isArray(q.options) ? q.options : [],
        required: q.required,
      })),
    );
    const { data: tpls } = await supabase
      .from("survey_templates").select("id, name, questions").eq("club_id", clubId).order("name");
    setTemplates(((tpls ?? []) as any[]).map((t) => ({ id: t.id, name: t.name, questions: t.questions ?? [] })));
    setLoading(false);
  }, [sessionId, clubId]);

  useEffect(() => { load(); }, [load]);

  const update = (i: number, patch: Partial<SurveyQuestion>) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));

  const add = () => setQuestions((qs) => [...qs, emptyQuestion(qs.length)]);
  const remove = (i: number) =>
    setQuestions((qs) => qs.filter((_, idx) => idx !== i).map((q, idx) => ({ ...q, position: idx })));
  const move = (i: number, dir: -1 | 1) => {
    setQuestions((qs) => {
      const j = i + dir;
      if (j < 0 || j >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((q, idx) => ({ ...q, position: idx }));
    });
  };

  const save = async () => {
    setBusy(true);
    // Replace strategy: delete then insert. Simple and consistent.
    const { error: delErr } = await supabase.from("session_survey_questions").delete().eq("session_id", sessionId);
    if (delErr) { setBusy(false); toast.error(delErr.message); return; }
    const rows = questions
      .filter((q) => q.question_text.trim().length > 0)
      .map((q, idx) => ({
        session_id: sessionId, club_id: clubId, position: idx,
        question_text: q.question_text.trim(),
        question_type: q.question_type,
        options: q.question_type === "single_choice" ? q.options.filter((o) => o.trim()) : null,
        required: q.required,
      }));
    if (rows.length > 0) {
      const { error } = await supabase.from("session_survey_questions").insert(rows);
      if (error) { setBusy(false); toast.error(error.message); return; }
    }
    setBusy(false);
    toast.success("Survey questions saved");
    load();
  };

  const applyTemplate = (tplId: string) => {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setQuestions(
      tpl.questions.map((q, idx) => ({
        position: idx,
        question_text: q.question_text ?? "",
        question_type: (q.question_type ?? "yes_no") as QType,
        options: q.options ?? [],
        required: q.required ?? true,
      })),
    );
    setPickTpl("");
    toast.success(`Loaded "${tpl.name}"`);
  };

  const saveAsTemplate = async () => {
    const name = prompt("Template name?")?.trim();
    if (!name) return;
    const payload = questions
      .filter((q) => q.question_text.trim().length > 0)
      .map((q, idx) => ({
        position: idx,
        question_text: q.question_text.trim(),
        question_type: q.question_type,
        options: q.question_type === "single_choice" ? q.options.filter((o) => o.trim()) : [],
        required: q.required,
      }));
    const { error } = await supabase.from("survey_templates").insert({
      club_id: clubId, name, questions: payload,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Template saved");
    load();
  };

  if (loading) return <Card className="p-4 text-sm text-muted-foreground">Loading…</Card>;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <div className="font-semibold">Pre-training survey questions</div>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Members must answer the required questions before they can RSVP.
      </p>

      {templates.length > 0 && (
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <Select value={pickTpl} onValueChange={applyTemplate}>
            <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Apply a template…" /></SelectTrigger>
            <SelectContent>
              {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-3">
        {questions.length === 0 && (
          <p className="text-sm text-muted-foreground py-3 text-center">No questions yet.</p>
        )}
        {questions.map((q, i) => (
          <div key={i} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Q{i + 1}</Badge>
              <div className="ml-auto flex gap-1">
                <Button type="button" size="icon" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" onClick={() => move(i, 1)} disabled={i === questions.length - 1}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
            <Input
              value={q.question_text}
              onChange={(e) => update(i, { question_text: e.target.value })}
              placeholder="e.g. Attending team BBQ after training?"
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={q.question_type} onValueChange={(v) => update(i, { question_type: v as QType })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABEL) as QType[]).map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex items-center justify-end gap-2 text-xs">
                <span className="text-muted-foreground">Required</span>
                <Switch checked={q.required} onCheckedChange={(v) => update(i, { required: v })} />
              </label>
            </div>
            {q.question_type === "single_choice" && (
              <div className="space-y-2">
                <Label className="text-xs">Options</Label>
                {(q.options.length === 0 ? [""] : q.options).map((opt, oi) => (
                  <div key={oi} className="flex gap-2">
                    <Input
                      value={opt}
                      onChange={(e) => {
                        const next = [...q.options]; next[oi] = e.target.value;
                        update(i, { options: next });
                      }}
                      placeholder={`Option ${oi + 1}`}
                    />
                    <Button type="button" size="icon" variant="ghost" onClick={() => {
                      const next = q.options.filter((_, x) => x !== oi);
                      update(i, { options: next });
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => update(i, { options: [...q.options, ""] })}>
                  <Plus className="h-4 w-4 mr-1" /> Add option
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={add}>
          <Plus className="h-4 w-4 mr-2" /> Add question
        </Button>
        {canManageTemplates && questions.length > 0 && (
          <Button type="button" variant="ghost" onClick={saveAsTemplate}>
            <BookmarkPlus className="h-4 w-4 mr-2" /> Save as template
          </Button>
        )}
        <Button type="button" className="ml-auto" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save questions"}
        </Button>
      </div>
    </Card>
  );
}

/** Member: answer the pre-training survey before RSVPing. */
export function SurveyRunner({
  sessionId, clubId, userId, onComplete,
}: { sessionId: string; clubId: string; userId: string; onComplete?: () => void }) {
  const [questions, setQuestions] = useState<(SurveyQuestion & { id: string })[]>([]);
  const [answers, setAnswers] = useState<Record<string, SurveyResponse>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: qs } = await supabase
      .from("session_survey_questions")
      .select("id, position, question_text, question_type, options, required")
      .eq("session_id", sessionId)
      .order("position");
    const list = ((qs ?? []) as any[]).map((q) => ({
      id: q.id, position: q.position, question_text: q.question_text,
      question_type: q.question_type as QType,
      options: Array.isArray(q.options) ? q.options : [],
      required: q.required,
    }));
    setQuestions(list);
    if (list.length > 0) {
      const { data: rs } = await supabase
        .from("session_survey_responses")
        .select("question_id, answer_text, answer_bool, answer_choice, updated_at, created_at")
        .eq("session_id", sessionId)
        .eq("user_id", userId);
      const map: Record<string, SurveyResponse> = {};
      let latest: string | null = null;
      for (const r of (rs ?? []) as (SurveyResponse & { updated_at?: string; created_at?: string })[]) {
        map[r.question_id] = r;
        const ts = r.updated_at ?? r.created_at ?? null;
        if (ts && (!latest || ts > latest)) latest = ts;
      }
      setAnswers(map);
      // Treat as submitted if every required question has a saved answer.
      const requiredIds = list.filter((q) => q.required).map((q) => q.id);
      const allRequiredAnswered = requiredIds.every((id) => {
        const a = map[id];
        return a && (a.answer_text !== null || a.answer_bool !== null || a.answer_choice !== null);
      });
      const anyAnswered = Object.values(map).some(
        (a) => a.answer_text !== null || a.answer_bool !== null || a.answer_choice !== null,
      );
      setSubmitted(requiredIds.length > 0 ? allRequiredAnswered : anyAnswered);
      setSubmittedAt(latest);
    } else {
      setSubmitted(false);
    }
    setLoading(false);
  }, [sessionId, userId]);

  useEffect(() => { load(); }, [load]);

  const setAns = (qid: string, patch: Partial<SurveyResponse>) =>
    setAnswers((m) => {
      const prev = m[qid] ?? { question_id: qid, answer_text: null, answer_bool: null, answer_choice: null };
      return { ...m, [qid]: { ...prev, ...patch, question_id: qid } };
    });

  const submit = async () => {
    setBusy(true);
    const rows = questions.map((q) => {
      const a = answers[q.id] ?? { question_id: q.id, answer_text: null, answer_bool: null, answer_choice: null };
      return {
        session_id: sessionId, club_id: clubId, question_id: q.id, user_id: userId,
        answer_text: a.answer_text, answer_bool: a.answer_bool, answer_choice: a.answer_choice,
      };
    }).filter((r) => r.answer_text !== null || r.answer_bool !== null || r.answer_choice !== null);
    if (rows.length === 0) { setBusy(false); toast.error("Please answer the questions first."); return; }
    const { error } = await supabase.from("session_survey_responses").upsert(rows, { onConflict: "question_id,user_id" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Survey submitted");
    setEditing(false);
    onComplete?.();
    load();
  };

  if (loading) return <Card className="p-4 text-sm text-muted-foreground">Loading survey…</Card>;
  if (questions.length === 0) return null;

  const missingRequired = questions.some((q) => {
    if (!q.required) return false;
    const a = answers[q.id];
    if (!a) return true;
    return a.answer_text === null && a.answer_bool === null && a.answer_choice === null;
  });

  // Submitted state: show confirmation + Edit button
  if (submitted && !editing) {
    return (
      <Card className="p-4 space-y-3 border-success/40 bg-success/5">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-success" />
          <div className="font-semibold">Pre-training survey submitted</div>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Thanks — your answers have been recorded
          {submittedAt && (
            <> on {new Date(submittedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} at {new Date(submittedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</>
          )}.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
          Edit survey
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <div className="font-semibold">Pre-training survey</div>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        {submitted ? "Update your answers below and save when you're done." : "Please answer before you RSVP."}
      </p>
      <div className="space-y-3">
        {questions.map((q, i) => {
          const a = answers[q.id];
          return (
            <div key={q.id} className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">
                Q{i + 1}. {q.question_text}
                {q.required && <span className="text-destructive ml-1">*</span>}
              </div>
              {q.question_type === "yes_no" && (
                <div className="flex gap-2">
                  {[true, false].map((v) => (
                    <Button
                      key={String(v)}
                      type="button"
                      variant={a?.answer_bool === v ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAns(q.id, { answer_bool: v, answer_text: null, answer_choice: null })}
                    >
                      {v ? "Yes" : "No"}
                    </Button>
                  ))}
                </div>
              )}
              {q.question_type === "text" && (
                <Textarea
                  rows={2}
                  value={a?.answer_text ?? ""}
                  onChange={(e) => setAns(q.id, { answer_text: e.target.value || null, answer_bool: null, answer_choice: null })}
                />
              )}
              {q.question_type === "single_choice" && (
                <div className="flex flex-wrap gap-2">
                  {q.options.map((opt) => (
                    <Button
                      key={opt}
                      type="button"
                      variant={a?.answer_choice === opt ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAns(q.id, { answer_choice: opt, answer_bool: null, answer_text: null })}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        {submitted && editing && (
          <Button type="button" variant="ghost" onClick={() => { setEditing(false); load(); }} className="flex-1">
            Cancel
          </Button>
        )}
        <Button type="button" className="flex-1" disabled={busy || missingRequired} onClick={submit}>
          {busy ? "Saving…" : missingRequired ? "Answer required questions" : submitted ? "Save changes" : "Submit answers"}
        </Button>
      </div>
    </Card>
  );
}

/** Hook: are required questions answered by this user? */
export function usePretrainingSurveyStatus(sessionId: string, userId: string | null | undefined) {
  const [state, setState] = useState<{ loading: boolean; required: boolean; complete: boolean }>({
    loading: true, required: false, complete: true,
  });
  const refresh = useCallback(async () => {
    if (!userId) { setState({ loading: false, required: false, complete: true }); return; }
    const { data: qs } = await supabase
      .from("session_survey_questions")
      .select("id, required")
      .eq("session_id", sessionId);
    const required = ((qs ?? []) as { id: string; required: boolean }[]).filter((q) => q.required);
    if (required.length === 0) { setState({ loading: false, required: false, complete: true }); return; }
    const { data: rs } = await supabase
      .from("session_survey_responses")
      .select("question_id, answer_text, answer_bool, answer_choice")
      .eq("session_id", sessionId)
      .eq("user_id", userId);
    const answered = new Set(
      ((rs ?? []) as SurveyResponse[])
        .filter((r) => r.answer_text !== null || r.answer_bool !== null || r.answer_choice !== null)
        .map((r) => r.question_id),
    );
    const complete = required.every((q) => answered.has(q.id));
    setState({ loading: false, required: true, complete });
  }, [sessionId, userId]);
  useEffect(() => { refresh(); }, [refresh]);
  return { ...state, refresh };
}

/** Coach view: tabulated responses for all members. */
export function SurveyResults({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<{ name: string; q: string; a: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: qs } = await supabase
        .from("session_survey_questions")
        .select("id, question_text, position")
        .eq("session_id", sessionId).order("position");
      const qMap = new Map<string, string>(((qs ?? []) as any[]).map((q) => [q.id, q.question_text]));
      const { data: rs } = await supabase
        .from("session_survey_responses")
        .select("question_id, user_id, answer_text, answer_bool, answer_choice")
        .eq("session_id", sessionId);
      const userIds = Array.from(new Set(((rs ?? []) as any[]).map((r) => r.user_id)));
      const profMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        for (const p of (profs ?? []) as { id: string; full_name: string | null }[]) {
          profMap.set(p.id, p.full_name || "Member");
        }
      }
      const result = ((rs ?? []) as any[]).map((r) => ({
        name: profMap.get(r.user_id) ?? "Member",
        q: qMap.get(r.question_id) ?? "Question",
        a: r.answer_bool !== null ? (r.answer_bool ? "Yes" : "No")
          : r.answer_choice !== null ? r.answer_choice
          : r.answer_text ?? "",
      }));
      result.sort((a, b) => a.name.localeCompare(b.name) || a.q.localeCompare(b.q));
      setRows(result);
      setLoading(false);
    })();
  }, [sessionId]);

  if (loading) return <Card className="p-4 text-sm text-muted-foreground">Loading responses…</Card>;
  if (rows.length === 0) return <Card className="p-4 text-sm text-muted-foreground">No responses yet.</Card>;

  return (
    <Card className="p-4 space-y-2">
      <div className="font-semibold text-sm">Member responses</div>
      <div className="divide-y rounded-md border text-sm">
        {rows.map((r, i) => (
          <div key={i} className="p-2.5">
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.q}</div>
            <div className="text-sm">{r.a}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
