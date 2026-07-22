import React, { useState } from "react";
import { Toaster } from "./components/Toast";
import Leaderboard from "./Leaderboard";
import Admin from "./Admin";
import { Trophy, Settings } from "lucide-react";

type Tab = "leaderboard" | "admin";

export default function App() {
  const [tab, setTab] = useState<Tab>("leaderboard");

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto max-w-[1200px] px-4 h-14 flex items-center justify-between gap-4">
          <span className="font-semibold text-sm tracking-tight">
            SOT Tracker ✨
          </span>
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setTab("leaderboard")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                tab === "leaderboard"
                  ? "bg-accent text-accent-fg"
                  : "text-secondary hover:text-primary hover:bg-inset"
              }`}
            >
              <Trophy className="size-4" /> Progress
            </button>
            <button
              onClick={() => setTab("admin")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                tab === "admin"
                  ? "bg-accent text-accent-fg"
                  : "text-secondary hover:text-primary hover:bg-inset"
              }`}
            >
              <Settings className="size-4" /> Log Entry
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-4 py-6">
        {tab === "leaderboard" ? <Leaderboard /> : <Admin />}
      </main>
      <Toaster />
    </div>
  );
}
