function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const cleanStr = dateStr.split("T")[0];
  const [year, month, day] = cleanStr.split("-").map(Number);
  
  if (!year || !month || !day) return dateStr;
  
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Progress } from "./components/Progress";
import {
  Footprints,
  Dumbbell,
  Award,
  TrendingUp,
  CalendarDays,
  Clock,
  Leaf,
  Users,
} from "lucide-react";

type Group = {
  id: number;
  name: string;
};

type Participant = {
  id: number;
  group_id: number;
  name: string;
  location: string;
  steps_goal: number;
  workouts_goal: number;
  workouts_achievable: number;
  steps_total: number;
  workouts_total: number;
  yoga_total: number;
  steps_pct: number;
  workouts_pct: number;
  week_steps: number;
  week_workouts: number;
};

type LeaderboardResponse = {
  rows: Participant[];
  lastUpdated: string | null;
};

const WEEK_STEPS_GOAL = 70000;
const WEEK_WORKOUTS_GOAL = 3;

const MEDALS = ["🥇", "🥈", "🥉"];
const RANK_LABELS = [
  { min: 80, label: "On Fire 🔥", color: "text-success" },
  { min: 50, label: "Crushing It 💪", color: "text-accent" },
  { min: 25, label: "In Progress 📈", color: "text-warning" },
  { min: 0, label: "Just Getting Started 🌱", color: "text-secondary" },
];

function getRankLabel(pct: number) {
  return RANK_LABELS.find((r) => pct >= r.min) ?? RANK_LABELS[3];
}

function getProgressVariant(
  pct: number,
): "success" | "warning" | "error" | "default" {
  if (pct >= 80) return "success";
  if (pct >= 40) return "default";
  if (pct >= 15) return "warning";
  return "error";
}

function formatSteps(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatLastUpdated(ts: string | null): string {
  if (!ts) return "No updates logged yet";
  const date = new Date(ts);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function Leaderboard() {
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["groups"],
    queryFn: () => fetch("/app-api/groups").then((r) => r.json()),
  });

  const { data, isLoading, error } = useQuery<LeaderboardResponse | Participant[]>({
    queryKey: ["leaderboard", selectedGroupId],
    queryFn: () =>
      fetch(`/app-api/leaderboard?groupId=${selectedGroupId}`).then((r) => r.json()),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        <div className="h-8 bg-inset rounded-md animate-pulse w-48" />
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-40 bg-inset rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-error bg-error-weak p-4 text-sm text-error mt-4">
        Failed to load leaderboard. Please refresh.
      </div>
    );
  }

  const participants: Participant[] = Array.isArray(data) ? data : data?.rows || [];
  const lastUpdated: string | null = Array.isArray(data) ? null : data?.lastUpdated || null;

  // Semester schedule configuration
  const SEMESTER_START = new Date("2026-07-13T00:00:00");
  const TOTAL_WEEKS = 8;
  const TOTAL_DAYS = TOTAL_WEEKS * 7;

  const now = new Date();
  const diffInMs = Math.max(0, now.getTime() - SEMESTER_START.getTime());
  const daysElapsed = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  const weeksElapsed = Math.min(
    TOTAL_WEEKS,
    Math.max(1, Math.floor(daysElapsed / 7) + 1)
  );

  const semesterProgressPct = Math.min(
    100,
    Math.max(0, Math.round((daysElapsed / TOTAL_DAYS) * 100))
  );

  return (
    <div className="space-y-6">
      {/* Group / Cohort Filter Bar */}
      {groups.length > 0 && (
        <div className="bg-raised border border-border rounded-lg p-3.5 flex items-center justify-between gap-4">
          <label className="text-xs font-semibold text-secondary flex items-center gap-2 shrink-0">
            <Users className="size-4 text-accent" /> Select Group / Cohort:
          </label>
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="bg-inset border border-border text-primary font-medium rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent cursor-pointer max-w-xs w-full"
          >
            <option value="all">All Groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Progress Reports
          </h1>
          <p className="text-secondary text-sm mt-1">
            Week {weeksElapsed} of {TOTAL_WEEKS} — July through September 2026
          </p>
          <p className="text-xs text-secondary flex items-center gap-1.5 mt-1.5">
            <Clock className="size-3.5" />
            Last Updated: <span className="font-medium text-primary">{formatLastUpdated(lastUpdated)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-secondary">
          <TrendingUp className="size-4" />
          <span>Semester: {semesterProgressPct}% complete</span>
        </div>
      </div>

      {/* Semester progress rail */}
      <div className="space-y-1.5">
        <Progress value={semesterProgressPct} aria-label="Semester progress" />
      </div>

      {/* Player cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {participants.map((p, idx) => {
          const rank = getRankLabel(p.steps_pct);
          const medal = MEDALS[idx] ?? null;
          const stepsLeft = Math.max(0, p.steps_goal - p.steps_total);
          const workoutsLeft = Math.max(0, p.workouts_goal - p.workouts_total);

          return (
            <div
              key={p.id}
              className="bg-raised border border-border rounded-lg p-5 space-y-4"
            >
              {/* Name + rank */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    {medal && <span className="text-2xl">{medal}</span>}
                    {!medal && idx < 6 && (
                      <span className="text-lg font-bold text-secondary">
                        #{idx + 1}
                      </span>
                    )}
                    <div>
                      <h2 className="text-base font-semibold">{p.name}</h2>
                      <p className="text-xs text-secondary">{p.location}</p>
                    </div>
                  </div>
                </div>
                <span className={`text-xs font-medium ${rank.color}`}>
                  {rank.label}
                </span>
              </div>

              {/* Steps */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-secondary">
                    <Footprints className="size-3.5" />
                    Steps
                  </span>
                  <span className="font-semibold">
                    {formatSteps(p.steps_total)}
                    <span className="text-secondary font-normal text-xs">
                      /{formatSteps(p.steps_goal)}
                    </span>
                  </span>
                </div>
                <Progress
                  value={Math.min(100, p.steps_pct)}
                  variant={getProgressVariant(p.steps_pct)}
                  aria-label={`${p.name} steps progress`}
                />
                <p className="text-xs text-secondary">
                  {p.steps_pct.toFixed(1)}% complete
                  {stepsLeft > 0 && ` · ${formatSteps(stepsLeft)} to go`}
                </p>
              </div>

              {/* Workouts */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-secondary">
                    <Dumbbell className="size-3.5" />
                    Workouts
                  </span>
                  <span className="font-semibold">
                    {p.workouts_total}
                    <span className="text-secondary font-normal text-xs">
                      /{p.workouts_goal} required
                    </span>
                  </span>
                </div>
                <Progress
                  value={Math.min(100, p.workouts_pct)}
                  variant={getProgressVariant(p.workouts_pct)}
                  aria-label={`${p.name} workouts progress`}
                />
                <p className="text-xs text-secondary">
                  {p.workouts_pct.toFixed(1)}% complete
                  {workoutsLeft > 0 && ` · ${workoutsLeft} sessions to go`}
                </p>
              </div>

              {/* This week */}
              <div className="rounded-md bg-inset p-3 space-y-2">
                <p className="text-xs font-medium text-secondary flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" /> This week
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Weekly steps */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-secondary">Steps</span>
                      <span
                        className={`font-semibold ${
                          p.week_steps >= WEEK_STEPS_GOAL
                            ? "text-success"
                            : "text-primary"
                        }`}
                      >
                        {formatSteps(p.week_steps)}
                        <span className="text-secondary font-normal">
                          /{formatSteps(WEEK_STEPS_GOAL)}
                        </span>
                      </span>
                    </div>
                    <Progress
                      value={Math.min(
                        100,
                        Math.round((p.week_steps / WEEK_STEPS_GOAL) * 100),
                      )}
                      variant={
                        p.week_steps >= WEEK_STEPS_GOAL
                          ? "success"
                          : p.week_steps >= WEEK_STEPS_GOAL * 0.5
                            ? "default"
                            : "warning"
                      }
                      aria-label={`${p.name} this week steps`}
                    />
                  </div>
                  {/* Weekly workouts */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-secondary">Workouts</span>
                      <span
                        className={`font-semibold ${
                          p.week_workouts >= WEEK_WORKOUTS_GOAL
                            ? "text-success"
                            : "text-primary"
                        }`}
                      >
                        {p.week_workouts}
                        <span className="text-secondary font-normal">
                          /{WEEK_WORKOUTS_GOAL}
                        </span>
                      </span>
                    </div>
                    <Progress
                      value={Math.min(
                        100,
                        Math.round(
                          (p.week_workouts / WEEK_WORKOUTS_GOAL) * 100,
                        ),
                      )}
                      variant={
                        p.week_workouts >= WEEK_WORKOUTS_GOAL
                          ? "success"
                          : p.week_workouts >= 1
                            ? "default"
                            : "warning"
                      }
                      aria-label={`${p.name} this week workouts`}
                    />
                  </div>
                </div>
              </div>

              {/* Overall score bubble & Optional Yoga Bonus */}
              <div className="flex items-center justify-between pt-1 border-t border-border-weak">
                <span className="text-xs text-secondary flex items-center gap-1">
                  <Award className="size-3.5" />
                  Semester total
                </span>
                <div className="flex items-center gap-3">
                  {p.yoga_total > 0 && (
                    <span className="text-xs text-success flex items-center gap-1 font-medium bg-success-weak px-2 py-0.5 rounded">
                      <Leaf className="size-3" /> {p.yoga_total} Yoga
                    </span>
                  )}
                  <div>
                    <span className="text-sm font-bold text-accent">
                      {((p.steps_pct + p.workouts_pct) / 2).toFixed(1)}%
                    </span>
                    <span className="text-xs text-secondary ml-1">overall</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {participants.length === 0 && (
        <div className="text-center py-16 text-secondary bg-raised border border-border rounded-lg">
          <p className="text-base">
            No Thotties found in this group — add some or pick another group!
          </p>
        </div>
      )}
    </div>
  );
}
