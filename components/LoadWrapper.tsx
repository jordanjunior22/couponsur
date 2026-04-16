// components/AuthWrapper.tsx
"use client";

import { useAuth } from "@/context/AuthContext";
import { LoadingSpinner } from "./LoadingSpinner"; // Assume this is your UI component

export const LoadWrapper = ({ children }: { children: React.ReactNode }) => {
  const { loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  return <>{children}</>;
};