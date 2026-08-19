import { useState, useRef } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useDarkMode } from "@/hooks/useDarkMode";
import {
  User, Mail, Shield, Moon, Sun, LogOut, Camera,
  Check, Loader2, Building2, Key, Bell, ChevronRight,
} from "lucide-react";

function getInitials(name?: string | null, email?: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

function Toggle({ value, onChange, dark }: { value: boolean; onChange: () => void; dark: boolean }) {
  const BG = dark ? "#1A1A2E" : "#E8E8F2";
  const SHADOW_IN = dark
    ? "inset 3px 3px 7px #0D0D1A, inset -3px -3px 7px #272744"
    : "inset 3px 3px 7px #C4C4D4, inset -3px -3px 7px #FFFFFF";
  const SHADOW_KNOB = dark
    ? "2px 2px 5px #0D0D1A, -2px -2px 5px #272744"
    : "2px 2px 5px #C4C4D4, -2px -2px 5px #FFFFFF";
  return (
    <div onClick={onChange} style={{
      width: 44, height: 24, borderRadius: 99,
      background: value ? "linear-gradient(135deg, #7B8FE0, #5B6FD0)" : BG,
      boxShadow: value ? "none" : SHADOW_IN,
      position: "relative", cursor: "pointer", transition: "all 0.3s", flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: "50%",
        background: value ? "#fff" : BG,
        boxShadow: value ? "none" : SHADOW_KNOB,
        transition: "left 0.3s",
      }} />
    </div>
  );
}

export default function Profile() {
  const { user, profile } = useAuth();
  const { dark, toggle: toggleDark } = useDarkMode();

  const BG = dark ? "#1A1A2E" : "#E8E8F2";
  const SHADOW_OUT = dark
    ? "5px 5px 12px #0D0D1A, -5px -5px 12px #272744"
    : "5px 5px 12px #C4C4D4, -5px -5px 12px #FFFFFF";
  const SHADOW_IN = dark
    ? "inset 3px 3px 7px #0D0D1A, inset -3px -3px 7px #272744"
    : "inset 3px 3px 7px #C4C4D4, inset -3px -3px 7px #FFFFFF";
  const TEXT_MAIN = dark ? "#D0D0F0" : "#3A3A5A";
  const TEXT_MUTED = dark ? "#7070A0" : "#9090A8";
  const BORDER = dark ? "#2A2A4A" : "#D8D8E8";

  // Pre-fill from profile
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const initials = getInitials(profile?.full_name, user?.email);
  const displayEmail = user?.email ?? "—";
  const displayRole = profile?.role ?? "Member";

  const saveProfile = async () => {
    if (!user || !fullName.trim()) return;
    setSaving(true);
    try {
      await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", user.id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!user?.email) return;
    setChangingPassword(true);
    setPwMsg("");
    try {
      await supabase.auth.resetPasswordForEmail(user.email);
      setPwMsg("Password reset email sent! Check your inbox.");
    } catch {
      setPwMsg("Failed to send reset email.");
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = async () => { await supabase.auth.signOut(); };

  function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
    return (
      <div style={{ background: BG, borderRadius: 18, boxShadow: SHADOW_OUT, padding: 24, ...style }}>
        {children}
      </div>
    );
  }

  function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: TEXT_MUTED, textTransform: "uppercase", marginBottom: 16 }}>
        {children}
      </p>
    );
  }

  function Row({
    icon: Icon, label, sublabel, right, onClick, color = "#7B8FE0",
  }: {
    icon: React.ElementType; label: string; sublabel?: string;
    right?: React.ReactNode; onClick?: () => void; color?: string;
  }) {
    return (
      <div onClick={onClick} style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "12px 0", borderBottom: `1px solid ${BORDER}`,
        cursor: onClick ? "pointer" : "default",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: BG,
          boxShadow: SHADOW_OUT, display: "flex", alignItems: "center",
          justifyContent: "center", flexShrink: 0, color,
        }}>
          <Icon style={{ width: 16, height: 16 }} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN, margin: 0 }}>{label}</p>
          {sublabel && <p style={{ fontSize: 11, color: TEXT_MUTED, margin: "2px 0 0" }}>{sublabel}</p>}
        </div>
        {right ?? (onClick && <ChevronRight style={{ width: 14, height: 14, color: TEXT_MUTED }} />)}
      </div>
    );
  }

  function InputField({
    icon: Icon, value, onChange, placeholder, disabled = false,
  }: {
    icon: React.ElementType; value: string; onChange?: (v: string) => void;
    placeholder?: string; disabled?: boolean;
  }) {
    return (
      <div style={{
        background: BG, boxShadow: disabled ? "none" : SHADOW_IN, borderRadius: 12,
        padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
        opacity: disabled ? 0.5 : 1,
        border: disabled ? `1px solid ${BORDER}` : "none",
      }}>
        <Icon style={{ width: 14, height: 14, color: TEXT_MUTED, flexShrink: 0 }} />
        <input
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          onKeyDown={(e) => e.key === "Enter" && !disabled && saveProfile()}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontSize: 13, color: TEXT_MAIN, fontFamily: "inherit",
            cursor: disabled ? "not-allowed" : "text",
          }}
        />
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "8px 0 40px" }}>
        <p style={{ fontSize: 22, fontWeight: 800, color: TEXT_MAIN, marginBottom: 24 }}>My Profile</p>

        {/* Avatar card */}
        <Card style={{ marginBottom: 20, textAlign: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={{ position: "relative" }}>
              <div style={{
                width: 80, height: 80, borderRadius: 22,
                background: "linear-gradient(135deg, #7B8FE0, #5B6FD0)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, fontWeight: 800, color: "#fff",
                boxShadow: SHADOW_OUT, letterSpacing: 1,
              }}>
                {initials}
              </div>
              <button onClick={() => fileRef.current?.click()} style={{
                position: "absolute", bottom: -6, right: -6,
                width: 28, height: 28, borderRadius: "50%",
                background: BG, boxShadow: SHADOW_OUT, border: "none",
                cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", color: "#7B8FE0",
              }}>
                <Camera style={{ width: 13, height: 13 }} />
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} />
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 800, color: TEXT_MAIN, margin: 0 }}>
                {profile?.full_name || "No name set"}
              </p>
              <span style={{
                display: "inline-block", marginTop: 6, fontSize: 11, fontWeight: 700,
                color: "#7B8FE0", background: "rgba(123,143,224,0.12)",
                borderRadius: 99, padding: "3px 12px",
              }}>
                {displayRole}
              </span>
            </div>
            <p style={{ fontSize: 12, color: TEXT_MUTED, margin: 0 }}>{displayEmail}</p>
          </div>
        </Card>

        {/* Edit account info */}
        <Card style={{ marginBottom: 20 }}>
          <SectionTitle>Account Info</SectionTitle>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, display: "block", marginBottom: 6 }}>
              FULL NAME
            </label>
            <InputField
              icon={User}
              value={fullName}
              onChange={setFullName}
              placeholder="Your full name"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED, display: "block", marginBottom: 6 }}>
              EMAIL <span style={{ fontSize: 10, fontWeight: 400 }}>(cannot be changed)</span>
            </label>
            <InputField
              icon={Mail}
              value={displayEmail}
              placeholder="Email"
              disabled
            />
          </div>

          <button
            onClick={saveProfile}
            disabled={saving || !fullName.trim()}
            style={{
              width: "100%", padding: 11, borderRadius: 12, border: "none",
              background: saving || !fullName.trim() ? BG : "linear-gradient(135deg, #7B8FE0, #5B6FD0)",
              boxShadow: saving || !fullName.trim() ? SHADOW_OUT : "none",
              color: saving || !fullName.trim() ? TEXT_MUTED : "#fff",
              fontSize: 13, fontWeight: 700,
              cursor: saving || !fullName.trim() ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.2s",
            }}
          >
            {saving
              ? <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
              : saved
              ? <><Check style={{ width: 14, height: 14 }} /> Saved!</>
              : "Save Changes"}
          </button>
        </Card>

        {/* Preferences */}
        <Card style={{ marginBottom: 20 }}>
          <SectionTitle>Preferences</SectionTitle>
          <Row
            icon={dark ? Moon : Sun}
            label="Dark Mode"
            sublabel={dark ? "Currently on" : "Currently off"}
            color={dark ? "#7B8FE0" : "#E0AA5A"}
            right={<Toggle value={dark} onChange={toggleDark} dark={dark} />}
          />
          <Row
            icon={Bell}
            label="Notifications"
            sublabel={notifications ? "Enabled" : "Disabled"}
            color="#52A882"
            right={<Toggle value={notifications} onChange={() => setNotifications(n => !n)} dark={dark} />}
          />
        </Card>

        {/* Security */}
        <Card style={{ marginBottom: 20 }}>
          <SectionTitle>Security</SectionTitle>
          <Row
            icon={Key}
            label="Change Password"
            sublabel="Send a reset link to your email"
            color="#E07A5A"
            onClick={sendPasswordReset}
            right={changingPassword
              ? <Loader2 style={{ width: 14, height: 14, color: TEXT_MUTED, animation: "spin 1s linear infinite" }} />
              : <ChevronRight style={{ width: 14, height: 14, color: TEXT_MUTED }} />}
          />
          <Row
            icon={Shield}
            label="Role"
            sublabel="Contact admin to change your role"
            color="#6B7FD4"
            right={
              <span style={{ fontSize: 11, fontWeight: 700, color: "#7B8FE0", background: "rgba(123,143,224,0.12)", borderRadius: 99, padding: "3px 10px" }}>
                {displayRole}
              </span>
            }
          />
          <Row
            icon={Building2}
            label="Organisation ID"
            sublabel={profile?.org_id ?? "Not assigned"}
            color={TEXT_MUTED}
            right={<></>}
          />
        </Card>

        {pwMsg && (
          <div style={{
            background: pwMsg.includes("sent") ? "#EEFAF4" : "#FEF0F0",
            color: pwMsg.includes("sent") ? "#2E9E6B" : "#E05B5B",
            borderRadius: 12, padding: "12px 16px", fontSize: 12, fontWeight: 600, marginBottom: 20,
          }}>
            {pwMsg}
          </div>
        )}

        {/* Sign out */}
        <button onClick={handleSignOut} style={{
          width: "100%", padding: 13, borderRadius: 14, border: "none",
          background: BG, boxShadow: SHADOW_OUT, color: "#E05B5B",
          fontSize: 13, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <LogOut style={{ width: 15, height: 15 }} />
          Sign Out
        </button>
      </div>
    </DashboardLayout>
  );
}