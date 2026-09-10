import React, { useState } from "react";
import { Toaster } from "./components/Toast";
import Leaderboard from "./Leaderboard";
import Admin from "./Admin";
import { Trophy, Settings } from "lucide-react";

type Tab = "leaderboard" | "admin";

export default function App() {
  const [tab, setTab] = useState<Tab>("leaderboard");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1200px] px-4 h-14 flex items-center justify-between gap-4">
          <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
            SOT Tracker ✨
          </span>
          <nav className="flex items-center gap-1.5">
            <button
              onClick={() => setTab("leaderboard")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === "leaderboard"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Trophy className="size-3.5" /> Progress
            </button>
            <button
              onClick={() => setTab("admin")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                tab === "admin"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Settings className="size-3.5" /> Log Entry
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
