function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const cleanStr = String(dateStr).split("T")[0];
  const [year, month, day] = cleanStr.split("-").map(Number);
  
  if (!year || !month || !day) return dateStr;
  
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./components/Button";
import { Input } from "./components/Input";
import {
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "./components/Form";
import { toast } from "./components/Toast";
import {
  Footprints,
  Dumbbell,
  Leaf,
  CheckCircle2,
  Calendar,
  Upload,
} from "lucide-react";

type Participant = {
  id: number;
  name: string;
  location: string;
};

type LogEntry = {
  id: number;
  participant_id: number;
  log_date: string;
  steps: number;
  workout: number;
  yoga: number;
};

const today = new Date().toISOString().split("T")[0];

export default function Admin() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  
  // Single mode state
  const [date, setDate] = useState(today);
  const [steps, setSteps] = useState("");
  const [workout, setWorkout] = useState(0);
  const [yoga, setYoga] = useState(0);

  // CSV File upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Passcode Auth State
  const [passcode, setPasscode] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passError, setPassError] = useState("");

  const ADMIN_PIN = "2026";

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (passcode === ADMIN_PIN) {
      setIsAuthenticated(true);
      setPassError("");
    } else {
      setPassError("Incorrect passcode. Try again.");
    }
  }

  const { data: participants = [], isLoading } = useQuery<Participant[]>({
    queryKey: ["participants"],
    queryFn: () => fetch("/app-api/participants").then((r) => r.json()),
  });

  const { data: logs = [] } = useQuery<LogEntry[]>({
    queryKey: ["logs", selectedId],
    queryFn: () => fetch(`/app-api/logs/${selectedId}`).then((r) => r.json()),
    enabled: !!selectedId,
  });

  async function handleSingleSave() {
    const errs: Record<string, string> = {};
    if (!selectedId) errs.participant = "Select a participant";
    if (!date) errs.date = "Date is required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSaving(true);
    try {
      const res = await fetch("/app-api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participant_id: selectedId,
          log_date: date,
          steps: steps === "" ? 0 : Number(steps),
          workout,
          yoga,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Entry saved!");
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["logs", selectedId] });
      setSteps("");
      setWorkout(0);
      setYoga(0);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload() {
    if (!selectedId) {
      setErrors({ participant: "Select a participant first" });
      return;
    }
    if (!csvFile) {
      toast.error("Please choose a CSV file to upload");
      return;
    }

    setSaving(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) throw new Error("File is empty");

        const lines = text.trim().split("\n");
        const parsedLogs = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const parts = line.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
          
          // Skip header row if present
          if (i === 0 && isNaN(Number(parts[1]))) continue;

          if (parts.length >= 2) {
            const log_date = parts[0];
            const stepsNum = Number(parts[1]) || 0;
            const wNum = parts[2] === "1" || parts[2]?.toLowerCase() === "y" || parts[2]?.toLowerCase() === "true" ? 1 : 0;
            const yNum = parts[3] === "1" || parts[3]?.toLowerCase() === "y" || parts[3]?.toLowerCase() === "true" ? 1 : 0;
            
            parsedLogs.push({ log_date, steps: stepsNum, workout: wNum, yoga: yNum });
          }
        }

        if (parsedLogs.length === 0) {
          toast.error("No valid entries found in file.");
          setSaving(false);
          return;
        }

        const res = await fetch("/app-api/logs/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            participant_id: selectedId,
            logs: parsedLogs,
          }),
        });

        if (!res.ok) throw new Error("Bulk upload failed");

        toast.success(`Successfully uploaded ${parsedLogs.length} rows!`);
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
        queryClient.invalidateQueries({ queryKey: ["logs", selectedId] });
        setCsvFile(null);
      } catch {
        toast.error("Error processing CSV file");
      } finally {
        setSaving(false);
      }
    };

    reader.readAsText(csvFile);
  }

  const selected = participants.find((p) => p.id === selectedId);

  if (!isAuthenticated) {
    return (
      <div className="max-w-sm mx-auto my-12 bg-raised border border-border rounded-lg p-6 space-y-4 shadow-sm">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold">Admin Access Required</h2>
          <p className="text-xs text-secondary">
            Enter passcode to log entries.
          </p>
        </div>
        <form onSubmit={handleLogin} className="space-y-3">
          <Input
            type="password"
            placeholder="Enter Passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="text-center tracking-widest text-lg"
          />
          {passError && (
            <p className="text-xs text-error text-center font-medium">
              {passError}
            </p>
          )}
          <Button variant="primary" className="w-full" type="submit">
            Unlock Log Entry
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Log Entries</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Box: Forms */}
        <div className="space-y-6">
          {/* Participant Selector */}
          <div className="bg-raised border border-border rounded-lg p-5 space-y-3">
            <FormItem error={errors.participant}>
              <FormLabel>Step 1: Choose Participant</FormLabel>
              <FormControl>
                <div className="grid grid-cols-2 gap-2">
                  {isLoading
                    ? [...Array(6)].map((_, i) => (
                        <div
                          key={i}
                          className="h-9 bg-inset rounded-md animate-pulse"
                        />
                      ))
                    : participants.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedId(p.id);
                            setErrors({});
                          }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
                            selectedId === p.id
                              ? "bg-accent text-accent-fg border-accent font-bold"
                              : "bg-inset text-primary border-border hover:bg-inset"
                          }`}
                        >
                          <span className="truncate">{p.name}</span>
                        </button>
                      ))}
                </div>
              </FormControl>
              {errors.participant && (
                <FormMessage>{errors.participant}</FormMessage>
              )}
            </FormItem>
          </div>

          {/* Option A: Single Day Entry */}
          <div className="bg-raised border border-border rounded-lg p-5 space-y-4">
            <h2 className="text-base font-semibold">Option A: Single Day Entry</h2>

            <FormItem error={errors.date}>
              <FormLabel>
                <Calendar className="size-4" /> Date
              </FormLabel>
              <FormControl>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  max={today}
                />
              </FormControl>
              {errors.date && <FormMessage>{errors.date}</FormMessage>}
            </FormItem>

            <FormItem error={errors.steps}>
              <FormLabel>
                <Footprints className="size-4" /> Steps
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="e.g. 8432"
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  min={0}
                />
              </FormControl>
              {errors.steps && <FormMessage>{errors.steps}</FormMessage>}
            </FormItem>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-primary">
                <Dumbbell className="size-4" /> Workout completed?
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setWorkout(1)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
                    workout === 1
                      ? "bg-success-weak text-success border-success"
                      : "bg-inset text-secondary border-border hover:bg-inset"
                  }`}
                >
                  <CheckCircle2 className="size-4" /> Yes
                </button>
                <button
                  type="button"
                  onClick={() => setWorkout(0)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
                    workout === 0
                      ? "bg-inset text-primary border-border-strong"
                      : "bg-inset text-secondary border-border"
                  }`}
                >
                  No
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-primary">
                <Leaf className="size-4" /> Yoga completed?
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setYoga(1)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
                    yoga === 1
                      ? "bg-success-weak text-success border-success"
                      : "bg-inset text-secondary border-border hover:bg-inset"
                  }`}
                >
                  <CheckCircle2 className="size-4" /> Yes
                </button>
                <button
                  type="button"
                  onClick={() => setYoga(0)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
                    yoga === 0
                      ? "bg-inset text-primary border-border-strong"
                      : "bg-inset text-secondary border-border"
                  }`}
                >
                  No
                </button>
              </div>
            </div>

            <Button
              variant="primary"
              className="w-full"
              onClick={handleSingleSave}
              isLoading={saving}
              disabled={!selectedId}
            >
              Save Single Entry
            </Button>
          </div>

          {/* Option B: CSV Spreadsheet Upload */}
          <div className="bg-raised border border-border rounded-lg p-5 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Upload className="size-4" /> Option B: Upload Spreadsheet (CSV)
            </h2>
            <p className="text-xs text-secondary">
              Upload a .csv spreadsheet formatted as: <br />
              <code className="bg-inset px-1 py-0.5 rounded font-mono text-xs">Date, Steps, Workout, Yoga</code>
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-secondary file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-inset file:text-primary hover:file:bg-border cursor-pointer"
            />
            <Button
              variant="primary"
              className="w-full"
              onClick={handleFileUpload}
              isLoading={saving}
              disabled={!csvFile || !selectedId}
            >
              Upload Spreadsheet
            </Button>
          </div>
        </div>

        {/* Right Box: Recent Logs */}
        <div className="bg-raised border border-border rounded-lg p-5 space-y-3 h-fit">
          <h2 className="text-base font-semibold">
            {selected
              ? `${selected.name}'s Recent Logs`
              : "Select a participant"}
          </h2>

          {!selected && (
            <p className="text-sm text-secondary py-8 text-center">
              Choose a participant on the left to see their recent entries.
            </p>
          )}

          {selected && logs.length === 0 && (
            <p className="text-sm text-secondary py-8 text-center">
              No entries logged yet for {selected.name}.
            </p>
          )}

          {logs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-weak">
                    <th className="text-left pb-2 text-secondary font-medium text-xs">Date</th>
                    <th className="text-right pb-2 text-secondary font-medium text-xs">Steps</th>
                    <th className="text-center pb-2 text-secondary font-medium text-xs">
                      <Dumbbell className="size-3 inline" />
                    </th>
                    <th className="text-center pb-2 text-secondary font-medium text-xs">
                      <Leaf className="size-3 inline" />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-weak">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 text-secondary text-xs">{formatDate(log.log_date)}</td>
                      <td className="py-2 text-right font-medium">
                        {log.steps > 0 ? log.steps.toLocaleString() : "—"}
                      </td>
                      <td className="py-2 text-center">
                        {log.workout === 1 ? (
                          <span className="text-success text-xs">✓</span>
                        ) : (
                          <span className="text-secondary text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {log.yoga === 1 ? (
                          <span className="text-success text-xs">✓</span>
                        ) : (
                          <span className="text-secondary text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
