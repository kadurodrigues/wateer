import * as React from "react";

export const THEME_STORAGE_KEY = "yt-queue-theme";

export const themeInitScript = `(function(){try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="dark")document.documentElement.classList.add("dark")}catch(e){}})()`;

type ThemeContextValue = {
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [darkMode, setDarkModeState] = React.useState(false);

  React.useEffect(() => {
    setDarkModeState(document.documentElement.classList.contains("dark"));
  }, []);

  const setDarkMode = React.useCallback((value: boolean) => {
    setDarkModeState(value);
    document.documentElement.classList.toggle("dark", value);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, value ? "dark" : "light");
    } catch {
      // ignore quota / private-mode failures
    }
  }, []);

  const value = React.useMemo(
    () => ({ darkMode, setDarkMode }),
    [darkMode, setDarkMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
