import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type Theme = "dark" | "light" | "system";

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeProviderContext = createContext<ThemeProviderState | null>(null);

function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

function readStoredTheme(key: string, fallback: Theme): Theme {
  const stored = localStorage.getItem(key);
  return isTheme(stored) ? stored : fallback;
}

function applyTheme(root: HTMLElement, theme: Theme): void {
  root.classList.remove("light", "dark");
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    root.classList.add(prefersDark.matches ? "dark" : "light");
    return;
  }
  root.classList.add(theme);
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "plumix-admin-theme",
}: ThemeProviderProps): ReactNode {
  const [theme, setTheme] = useState<Theme>(() =>
    readStoredTheme(storageKey, defaultTheme),
  );

  useEffect(() => {
    const root = window.document.documentElement;
    applyTheme(root, theme);
    // Only "system" needs to react to OS-level theme flips — explicit dark/light
    // selections are already pinned by the class we just set.
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(root, "system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setAndPersist = useCallback(
    (next: Theme) => {
      localStorage.setItem(storageKey, next);
      setTheme(next);
    },
    [storageKey],
  );

  const value = useMemo<ThemeProviderState>(
    () => ({ theme, setTheme: setAndPersist }),
    [theme, setAndPersist],
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

/** @public */
export function useTheme(): ThemeProviderState {
  const context = useContext(ThemeProviderContext);
  if (context === null) {
    // eslint-disable-next-line no-restricted-syntax -- React hook-misuse guard; convention exception per umbrella #232
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
