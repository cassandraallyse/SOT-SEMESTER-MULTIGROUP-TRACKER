import React from "react";

export const toast = {
  success: (msg: string) => alert(`Success: ${msg}`),
  error: (msg: string) => alert(`Error: ${msg}`),
};

export function Toaster() {
  return null;
}
