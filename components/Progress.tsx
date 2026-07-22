import React from "react";

type ProgressProps = {
  value: number;
  variant?: "success" | "warning" | "error" | "default";
  "aria-label"?: string;
};

export function Progress({ value, variant = "default" }: ProgressProps) {
  let bgColor = "bg-blue-600";
  if (variant === "success") bgColor = "bg-green-500";
  if (variant === "warning") bgColor = "bg-yellow-500";
  if (variant === "error") bgColor = "bg-red-500";

  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 overflow-hidden">
      <div
        className={`h-2.5 rounded-full ${bgColor}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      ></div>
    </div>
  );
}
