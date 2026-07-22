import React from "react";

export function FormItem({
  children,
  error,
}: {
  children: React.ReactNode;
  error?: string;
}) {
  return <div className="space-y-1">{children}</div>;
}

export function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-gray-700 flex items-center gap-1.5">
      {children}
    </label>
  );
}

export function FormControl({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export function FormMessage({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-red-500">{children}</p>;
}
