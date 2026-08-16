import { useIsDesktop } from "@/hooks/useIsDesktop";
import { Navigate } from "react-router-dom";

export function DesktopOnly({ children }: { children: React.ReactNode }) {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return <Navigate to="/chat" replace />;
  return <>{children}</>;
}
