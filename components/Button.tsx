import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  isLoading?: boolean;
};

export function Button({
  children,
  variant = "primary",
  isLoading,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const base = "px-4 py-2 rounded-md font-medium text-sm transition-colors";
  const styles =
    variant === "primary"
      ? "bg-black text-white hover:bg-gray-800 disabled:opacity-50"
      : "bg-gray-100 text-gray-900 hover:bg-gray-200 disabled:opacity-50";

  return (
    <button
      disabled={disabled || isLoading}
      className={`${base} ${styles} ${className}`}
      {...props}
    >
      {isLoading ? "Saving..." : children}
    </button>
  );
}
