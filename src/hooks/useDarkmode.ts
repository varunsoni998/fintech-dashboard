import { createContext, useContext, useEffect, useState } from "react";

interface DarkModeContextType {
  dark: boolean;
  toggle: () => void;
}

export const DarkModeContext = createContext<DarkModeContextType>({
  dark: false,
  toggle: () => {},
});

export function useDarkMode() {
  return useContext(DarkModeContext);
}

export function useDarkModeState() {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem("bos_dark") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem("bos_dark", String(dark));
    } catch {}
  }, [dark]);

  const toggle = () => setDark((d) => !d);

  return { dark, toggle };
}