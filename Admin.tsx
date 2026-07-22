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

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ""));
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ""));
  return result;
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
  Trash2,
  UserPlus,
  UserX,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Users,
  Lock,
  Key,
} from "lucide-react";

type Group = {
  id: number;
  name: string;
};

type Participant = {
  id: number;
  group_id: number | null;
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
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  
  // Single mode state
  const [date, setDate] = useState(today);
  const [steps, setSteps] = useState("");
  const [workout, setWorkout] = useState(0);
  const [yoga, setYoga] = useState(0);

  // Management accordions
  const [showManageGroups, setShowManageGroups] = useState(false);
  const [showManageThotties, setShowManageThotties] = useState(false);
  const [showManageSecurity, setShowManageSecurity] = useState(false);

  // Group creation state
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);

  // Thottie creation state
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [assignGroupId, setAssignGroupId] = useState<string>("");
  const [addingParticipant, setAddingParticipant] = useState(false);

  // Security / Passcode reset state
  const [newAdminPasscode, setNewAdminPasscode] = useState("");
  const [updatingPasscode, setUpdatingPasscode] = useState(false);

  // CSV File upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Passcode Auth State
  const [passcode, setPasscode] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passError, setPassError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode) {
      setPassError("Please enter a passcode.");
      return;
    }

    try {
      const res = await fetch("/app-api/verify-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, groupId: selectedGroupId }),
      });

      if (res.ok) {
        setIsAuthenticated(true);
        setPassError("");
      } else {
        setPassError("Incorrect passcode. Try again.");
      }
    } catch {
      setPassError("Error verifying passcode.");
    }
  }

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["groups"],
    queryFn: () => fetch("/app-api/groups").then((r) => r.json()),
  });

  const { data: participants = [], isLoading } = useQuery<Participant[]>({
    queryKey: ["participants", selectedGroupId],
    queryFn: () =>
      fetch(`/app-api/participants?groupId=${selectedGroupId}`).then((r) =>
        r.json()
      ),
  });

  const { data: logs = [] } = useQuery<LogEntry[]>({
    queryKey: ["logs", selectedId],
    queryFn: () => fetch(`/app-api/logs/${selectedId}`).then((r) => r.json()),
    enabled: !!selectedId,
  });

  async function handleUpdatePasscode(e: React.FormEvent) {
    e.preventDefault();
    if (!newAdminPasscode.trim() || newAdminPasscode.trim().length < 4) {
      toast.error("Passcode must be at least 4 characters long");
      return;
    }

    setUpdatingPasscode(true);
    try {
      const res = await fetch("/app-api/update-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: selectedGroupId,
          newPasscode: newAdminPasscode.trim(),
        }),
      });

      if (!res.ok) throw new Error("Failed to update passcode");

      toast.success("Passcode updated successfully!");
      setNewAdminPasscode("");
    } catch {
      toast.error("Error updating passcode");
    } finally {
      setUpdatingPasscode(false);
    }
  }

  async function handleAddGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) {
      toast.error("Please enter a group name");
      return;
    }

    setAddingGroup(true);
    try {
      const res = await fetch("/app-api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });

      if (!res.ok) throw new Error("Failed to add group");

      toast.success(`Group "${newGroupName}" created!`);
      setNewGroupName("");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
    } catch {
      toast.error("Error creating group");
    } finally {
      setAddingGroup(false);
    }
  }

  async function handleDeleteGroup(g: Group) {
    if (
      !window.confirm(
        `Are you sure you want to delete group "${g.name}"? Thotties in this group will not be deleted, but will become unassigned.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/app-api/groups/${g.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete group");

      toast.success(`Group "${g.name}" deleted`);
      if (selectedGroupId === String(g.id)) setSelectedGroupId("all");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["participants"] });
    } catch {
      toast.error("Error deleting group");
    }
  }

  async function handleAddParticipant(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error("Please enter a name");
      return;
    }

    setAddingParticipant(true);
    try {
      const res = await fetch("/app-api/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          location: newLocation.trim(),
          group_id: assignGroupId ? Number(assignGroupId) : null,
          steps_goal: 560000,
          workouts_goal: 24,
        }),
      });

      if (!res.ok) throw new Error("Failed to add participant");

      toast.success(`${newName} added!`);
      setNewName("");
      setNewLocation("");
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch {
      toast.error("Error adding Thottie");
    } finally {
      setAddingParticipant(false);
    }
  }

  async function handleDeleteParticipant(p: Participant) {
    if (
      !window.confirm(
        `Are you sure you want to remove ${p.name}? This will also delete all their logged entries!`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/app-api/participants/${p.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");

      toast.success(`${p.name} removed`);
      if (selectedId === p.id) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["participants"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch {
      toast.error("Error removing Thottie");
    }
  }

  async function handleSingleSave() {
    const errs: Record<string, string> = {};
    if (!selectedId) errs.participant = "Select a Thottie";
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

        const rawLines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
        if (rawLines.length < 2) throw new Error("CSV file too short");

        const headerCols = parseCsvLine(rawLines[0]);
        
        const dateColIndices: { idx: number; isoDate: string }[] = [];
        headerCols.forEach((col, idx) => {
          const match = col.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (match) {
            const m = match[1].padStart(2, "0");
            const d = match[2].padStart(2, "0");
            const y = match[3];
            dateColIndices.push({ idx, isoDate: `${y}-${m}-${d}` });
          }
        });

        const isMatrixSheet = dateColIndices.length > 0;

        if (isMatrixSheet) {
          let currentParticipantId: number | null = null;
          let rowTypes: Record<string, string[]> = {};
          const bulkPayloads: { participant_id: number; logs: any[] }[] = [];

          for (let i = 1; i < rawLines.length; i++) {
            const parts = parseCsvLine(rawLines[i]);
            const firstCol = parts[0];

            if (!firstCol) continue;

            if (["Steps", "Workout", "Yoga"].includes(firstCol)) {
              if (currentParticipantId) {
                rowTypes[firstCol] = parts;
              }
            } else {
              if (currentParticipantId && Object.keys(rowTypes).length > 0) {
                const pLogs = extractMatrixLogs(rowTypes, dateColIndices);
                if (pLogs.length > 0) bulkPayloads.push({ participant_id: currentParticipantId, logs: pLogs });
              }

              const firstName = firstCol.split(" ")[0].toLowerCase();
              const matchP = participants.find((p) =>
                p.name.toLowerCase().startsWith(firstName)
              );
              currentParticipantId = matchP ? matchP.id : null;
              rowTypes = {};
            }
          }

          if (currentParticipantId && Object.keys(rowTypes).length > 0) {
            const pLogs = extractMatrixLogs(rowTypes, dateColIndices);
            if (pLogs.length > 0) bulkPayloads.push({ participant_id: currentParticipantId, logs: pLogs });
          }

          if (bulkPayloads.length === 0) {
            toast.error("No matching participant entries found in spreadsheet.");
            setSaving(false);
            return;
          }

          let totalCount = 0;
          for (const payload of bulkPayloads) {
            const res = await fetch("/app-api/logs/bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (res.ok) {
              totalCount += payload.logs.length;
            }
          }

          toast.success(`Successfully uploaded ${totalCount} entries across all Thotties!`);
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
          if (selectedId) queryClient.invalidateQueries({ queryKey: ["logs", selectedId] });
          setCsvFile(null);

        } else {
          if (!selectedId) {
            setErrors({ participant: "Select a Thottie first for single-person CSV" });
            setSaving(false);
            return;
          }

          const parsedLogs = [];
          for (let i = 0; i < rawLines.length; i++) {
            const parts = parseCsvLine(rawLines[i]);
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
        }
      } catch {
        toast.error("Error processing CSV file");
      } finally {
        setSaving(false);
      }
    };

    reader.readAsText(csvFile);
  }

  function extractMatrixLogs(
    rowTypes: Record<string, string[]>,
    dateColIndices: { idx: number; isoDate: string }[]
  ) {
    const stepsRow = rowTypes["Steps"] || [];
    const workoutRow = rowTypes["Workout"] || [];
    const yogaRow = rowTypes["Yoga"] || [];
    const logs = [];

    for (const { idx, isoDate } of dateColIndices) {
      const sRaw = (stepsRow[idx] || "0").replace(/,/g, "");
      const wRaw = (workoutRow[idx] || "0").trim();
      const yRaw = (yogaRow[idx] || "0").trim();

      const steps = parseInt(sRaw, 10) || 0;
      const workout = wRaw === "1" || wRaw.toLowerCase() === "y" || wRaw.toLowerCase() === "true" ? 1 : 0;
      const yoga = yRaw === "1" || yRaw.toLowerCase() === "y" || yRaw.toLowerCase() === "true" ? 1 : 0;

      if (steps > 0 || workout > 0 || yoga > 0) {
        logs.push({ log_date: isoDate, steps, workout, yoga });
      }
    }
    return logs;
  }

  async function handleDeleteEntry(id: number) {
    if (!window.confirm("Are you sure you want to delete this log entry?")) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/app-api/logs/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");

      toast.success("Entry deleted");
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["logs", selectedId] });
    } catch {
      toast.error("Error deleting entry");
    } finally {
      setDeletingId(null);
    }
  }

  const selected = participants.find((p) => p.id === selectedId);

  if (!isAuthenticated) {
    return (
      <div className="max-w-sm mx-auto my-12 bg-raised border border-border rounded-lg p-6 space-y-4 shadow-sm">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
            <Lock className="size-4" /> Admin Access Required
          </h2>
          <p className="text-xs text-secondary">
            Enter passcode to manage entries & groups.
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
            Unlock Admin Panel
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Log Entries & Admin</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Box: Forms */}
        <div className="space-y-6">
          
          {/* Manage Security & Passcode Accordion */}
          <div className="bg-raised border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowManageSecurity(!showManageSecurity)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-sm font-semibold text-primary hover:bg-inset/50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Key className="size-4 text-accent" /> Change Admin Passcode
              </span>
              {showManageSecurity ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>

            {showManageSecurity && (
              <div className="p-5 border-t border-border space-y-3 bg-inset/30">
                <form onSubmit={handleUpdatePasscode} className="space-y-3">
                  <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider">
                    Set New Passcode
                  </h3>
                  <Input
                    type="password"
                    placeholder="Enter New Passcode (min 4 chars)"
                    value={newAdminPasscode}
                    onChange={(e) => setNewAdminPasscode(e.target.value)}
                  />
                  <Button
                    variant="primary"
                    className="w-full text-xs"
                    type="submit"
                    isLoading={updatingPasscode}
                  >
                    Update Passcode
                  </Button>
                </form>
              </div>
            )}
          </div>

          {/* Manage Groups Accordion */}
          <div className="bg-raised border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowManageGroups(!showManageGroups)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-sm font-semibold text-primary hover:bg-inset/50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <FolderPlus className="size-4" /> Manage Groups / Cohorts
              </span>
              {showManageGroups ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>

            {showManageGroups && (
              <div className="p-5 border-t border-border space-y-5 bg-inset/30">
                {/* Add New Group Form */}
                <form onSubmit={handleAddGroup} className="space-y-3">
                  <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider">
                    Create New Group
                  </h3>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Group Name (e.g. Morning Squad)"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                    />
                    <Button
                      variant="primary"
                      className="text-xs shrink-0"
                      type="submit"
                      isLoading={addingGroup}
                    >
                      Add Group
                    </Button>
                  </div>
                </form>

                {/* List Existing Groups */}
                <div className="space-y-2 pt-2 border-t border-border-weak">
                  <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider">
                    Existing Groups
                  </h3>
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {groups.map((g) => (
                      <div
                        key={g.id}
                        className="flex items-center justify-between text-xs py-1.5 px-2 bg-inset rounded border border-border-weak"
                      >
                        <span className="font-medium">{g.name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteGroup(g)}
                          className="text-secondary hover:text-error transition-colors p-1"
                          title="Delete Group"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Manage Thotties Accordion */}
          <div className="bg-raised border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowManageThotties(!showManageThotties)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-sm font-semibold text-primary hover:bg-inset/50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <UserPlus className="size-4" /> Manage Thotties (Add / Remove)
              </span>
              {showManageThotties ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>

            {showManageThotties && (
              <div className="p-5 border-t border-border space-y-5 bg-inset/30">
                {/* Add New Thottie Form */}
                <form onSubmit={handleAddParticipant} className="space-y-3">
                  <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider">
                    Add New Thottie
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Name (e.g. Sarah)"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                    <Input
                      placeholder="State (e.g. CA)"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                    />
                  </div>
                  {groups.length > 0 && (
                    <select
                      value={assignGroupId}
                      onChange={(e) => setAssignGroupId(e.target.value)}
                      className="w-full bg-inset border border-border text-primary rounded-md p-2 text-xs focus:outline-none focus:border-accent"
                    >
                      <option value="">Assign to Group (Optional)</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button
                    variant="primary"
                    className="w-full text-xs"
                    type="submit"
                    isLoading={addingParticipant}
                  >
                    Add Thottie
                  </Button>
                </form>

                {/* List Existing Thotties */}
                <div className="space-y-2 pt-2 border-t border-border-weak">
                  <h3 className="text-xs font-semibold text-secondary uppercase tracking-wider">
                    Existing Thotties
                  </h3>
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {participants.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-xs py-1.5 px-2 bg-inset rounded border border-border-weak"
                      >
                        <span className="font-medium">
                          {p.name} {p.location && `(${p.location})`}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteParticipant(p)}
                          className="text-secondary hover:text-error transition-colors p-1"
                          title="Remove Thottie"
                        >
                          <UserX className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step 1: Choose Thottie */}
          <div className="bg-raised border border-border rounded-lg p-5 space-y-4">
            {/* Group Filter for Logging */}
            {groups.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-secondary flex items-center gap-1.5">
                  <Users className="size-3.5 text-accent" /> Filter Thotties by Group:
                </label>
                <select
                  value={selectedGroupId}
                  onChange={(e) => {
                    setSelectedGroupId(e.target.value);
                    setSelectedId(null);
                  }}
                  className="w-full bg-inset border border-border text-primary rounded-md p-2 text-xs focus:outline-none focus:border-accent"
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

            <FormItem error={errors.participant}>
              <FormLabel>Step 1: Choose Thottie (For Single Entry)</FormLabel>
              <FormControl>
                {participants.length === 0 && !isLoading ? (
                  <p className="text-xs text-secondary py-3 text-center border border-dashed rounded-md">
                    No Thotties found in this group yet. Add one above!
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {isLoading
                      ? [...Array(4)].map((_, i) => (
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
                )}
              FormControl>
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

          {/* Option B: Upload Tracking Sheet (CSV) */}
          <div className="bg-raised border border-border rounded-lg p-5 space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Upload className="size-4" /> Option B: Upload Spreadsheet (CSV)
            </h2>
            <p className="text-xs text-secondary">
              Upload full Tracking Sheet or single-person CSV.
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
              disabled={!csvFile}
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
              : "Select a Thottie"}
          </h2>

          {!selected && (
            <p className="text-sm text-secondary py-8 text-center">
              Choose a Thottie on the left to see their recent entries.
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
                    <th className="text-right pb-2 text-secondary font-medium text-xs">Action</th>
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
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(log.id)}
                          disabled={deletingId === log.id}
                          className="text-secondary hover:text-error transition-colors p-1 rounded cursor-pointer"
                          title="Delete entry"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
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
