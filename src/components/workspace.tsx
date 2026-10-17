"use client";
import {
  createContext,
  useContext,
  useCallback,
  useState,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Plus,
  History,
  ChartNoAxesCombined,
  Sparkles,
  Settings,
  ArrowUpRight,
  ShieldCheck,
  BookOpen,
  Menu,
  X,
  Waves,
} from "lucide-react";
import type { State } from "@/lib/types";
const empty: State = {
  subjects: [],
  exams: [],
  tests: [],
  attempts: [],
  predictions: [],
  grades: [],
  answers: [],
};
type Connection = "loading" | "ready" | "error";
type Workspace = {
  state: State;
  connection: Connection;
  aiReady: boolean;
  error: string;
  refresh: () => Promise<void>;
};
const Context = createContext<Workspace | null>(null);
const MotionContext = createContext(false);
export function useMotion() {
  return useContext(MotionContext);
}
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function motionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace provider missing");
  return value;
}
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(empty);
  const [connection, setConnection] = useState<Connection>("loading");
  const [aiReady, setAiReady] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Unable to load your workspace.");
      setAiReady(data.aiReady);
      setError("");
      setState(data.state);
      setConnection("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load workspace.");
      setConnection("error");
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);
  return (
    <Context.Provider value={{ state, connection, aiReady, error, refresh }}>
      {children}
    </Context.Provider>
  );
}
const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/create", label: "Create practice test", icon: Plus },
  { href: "/history", label: "Tests & history", icon: History },
  {
    href: "/analytics",
    label: "Prediction analytics",
    icon: ChartNoAxesCombined,
  },
  { href: "/settings", label: "Settings", icon: Settings },
];
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { connection, aiReady } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [motion, setMotion] = useState(true);
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    motionSnapshot,
    () => true,
  );
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        setMotion(localStorage.getItem("study-motion") !== "off");
      } catch {
        /* Preferences are optional. */
      }
    });
  }, []);
  function toggleMotion() {
    const next = !motion;
    setMotion(next);
    try {
      localStorage.setItem("study-motion", next ? "on" : "off");
    } catch {
      /* Preferences are optional. */
    }
  }
  const animate =
    motion && !reducedMotion && !pathname.startsWith("/attempts/");
  return (
    <MotionContext.Provider value={animate}>
      <div className="app-shell" data-motion={animate ? "on" : "off"}>
        <div className="ambient-field" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <button
          className="mobile-menu icon-button"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close navigation" : "Open navigation"}
        >
          {open ? <X /> : <Menu />}
        </button>
        {open && (
          <button
            className="nav-overlay"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          />
        )}
        <aside className={`sidebar ${open ? "open" : ""}`}>
          <Link href="/" className="brand" onClick={() => setOpen(false)}>
            <span className="brand-icon">
              <Sparkles size={22} />
            </span>
            <span>
              StudyPredict<span className="brand-ai">AI</span>
            </span>
          </Link>
          <div className="workspace-label">EXPLORE YOUR POTENTIAL</div>
          <nav aria-label="Main navigation">
            {navigation.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`nav-link ${pathname === href ? "active" : ""}`}
                aria-current={pathname === href ? "page" : undefined}
              >
                <Icon size={19} />
                {label}
              </Link>
            ))}
          </nav>
          <div className="sidebar-tip">
            <span className="tiny-label">
              <Sparkles size={14} /> A LITTLE PRACTICE, EVERY DAY
            </span>
            <h3>Know where you stand.</h3>
            <p>
              Turn your study notes into practice. Turn your results into a
              clearer next step.
            </p>
            <Link href="/create" onClick={() => setOpen(false)}>
              Start practicing <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="sidebar-bottom">
            <ShieldCheck size={18} />
            <div>
              <strong>Personal workspace</strong>
              <span>Stored on this PC</span>
            </div>
          </div>
        </aside>
        <div className="main-area">
          <header className="topbar">
            <span>
              <BookOpen size={16} /> Your learning, connected.
            </span>
            <div className="topbar-right">
              <button
                className="motion-toggle"
                onClick={toggleMotion}
                aria-pressed={motion}
                aria-label="Ambient animations"
                title={
                  reducedMotion
                    ? "System reduced-motion preference is active"
                    : "Toggle ambient animations"
                }
              >
                <Waves size={15} />
                <span>Motion {animate ? "on" : "off"}</span>
              </button>
              <span
                className={`status-dot ${connection === "ready" && aiReady ? "green" : ""}`}
              />
              {connection === "ready"
                ? "Local workspace"
                : "Your personal study companion"}
              <span className="avatar">S</span>
            </div>
          </header>
          <main key={pathname}>
            {pathname !== "/settings" && <ConnectionNotice />}
            {children}
          </main>
          <footer>
            Study with intention. Predict with evidence.
            <span>StudyPredict AI</span>
          </footer>
        </div>
      </div>
    </MotionContext.Provider>
  );
}
export function ConnectionNotice() {
  const { connection, aiReady, error, refresh } = useWorkspace();
  if (connection === "loading")
    return (
      <div className="notice" role="status">
        Loading your workspace…
      </div>
    );
  if (connection === "error")
    return (
      <div className="notice error" role="alert">
        <span>{error}</span>
        <button
          className="button small secondary"
          onClick={() => void refresh()}
        >
          Retry
        </button>
      </div>
    );
  if (!aiReady)
    return (
      <div className="notice">
        <span>
          Add your Anthropic API key to generate tests and grade written
          answers.
        </span>
        <Link href="/settings" className="text-link">
          Open Settings →
        </Link>
      </div>
    );
  return null;
}
