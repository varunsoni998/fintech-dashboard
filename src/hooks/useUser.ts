import { useAuth } from "./useAuth";

export function useUser(): string {
  const { user, profile } = useAuth();
  if (profile?.full_name) return profile.full_name;
  if (user?.email) return user.email.split("@")[0];
  return "Team Member";
}