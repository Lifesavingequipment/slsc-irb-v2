/**
 * Page-level loading skeletons.
 * Replace every "Loading…" text placeholder with the right skeleton shape.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ── Generic card skeleton ────────────────────────────────────────────────────

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("p-4 space-y-3", className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </Card>
  );
}

// ── Session list skeleton ────────────────────────────────────────────────────

export function SessionListSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2 pt-0.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Session detail skeleton ──────────────────────────────────────────────────

export function SessionDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-6 w-3/4" />
        <div className="space-y-2 pt-1">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3.5 w-2/5" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </Card>
      {/* Tabs */}
      <Skeleton className="h-10 w-full rounded-xl" />
      {/* RSVP cards */}
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}

// ── Member list skeleton ─────────────────────────────────────────────────────

export function MemberListSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ── Equipment list skeleton ──────────────────────────────────────────────────

export function EquipmentListSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-xl border bg-card">
          <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// ── Settings / form skeleton ─────────────────────────────────────────────────

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {[...Array(fields)].map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-10 w-32 rounded-lg mt-2" />
    </div>
  );
}

// ── Training plan skeleton ───────────────────────────────────────────────────

export function TrainingPlanSkeleton() {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-28" />
      </div>
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-5 w-14 rounded-full ml-auto" />
          </div>
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </Card>
  );
}

// ── Gear checklist skeleton ──────────────────────────────────────────────────

export function GearChecklistSkeleton() {
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-1">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-16 ml-auto" />
        </div>
      ))}
    </Card>
  );
}

// ── Attendance skeleton ──────────────────────────────────────────────────────

export function AttendanceSkeleton() {
  return (
    <div className="space-y-3">
      <Card className="p-4">
        <Skeleton className="h-4 w-20 mb-3" />
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-4 w-20" />)}
        </div>
      </Card>
      {[...Array(3)].map((_, i) => (
        <Card key={i} className="p-3 space-y-3">
          <Skeleton className="h-4 w-1/3" />
          <div className="grid grid-cols-2 gap-2">
            {[...Array(4)].map((_, j) => <Skeleton key={j} className="h-9 rounded-lg" />)}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Dashboard skeleton ───────────────────────────────────────────────────────

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      {/* Stats */}
      <Card className="p-4 space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-1 text-center">
              <Skeleton className="h-6 w-8 mx-auto" />
              <Skeleton className="h-3 w-14 mx-auto" />
            </div>
          ))}
        </div>
      </Card>
      {/* Upcoming session */}
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
