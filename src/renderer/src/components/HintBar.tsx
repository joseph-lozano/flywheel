import { createSignal, For, onCleanup, onMount } from "solid-js";
import { LAYOUT, THEME } from "../../../shared/constants";

interface HintBarProps {
  viewportHeight: number;
  panelCount: number;
  hasProjects: boolean;
  sidebarWidth: number;
  rowCount?: number;
}

// On macOS use ⌘ (Command) symbol; on Linux use "Alt+" prefix.
const mod = window.api.platform === "linux" ? "Alt+" : "\u2318";
const shift = window.api.platform === "linux" ? "Shift+" : "\u21e7";

const PANEL_HINTS = [
  { key: `${mod}T`, label: "Terminal" },
  { key: `${mod}B`, label: "Browser" },
  { key: `${mod}W`, label: "Close" },
  { key: `${mod}G`, label: "Blur" },
  { key: `${mod}+/-`, label: "Zoom" },
  { key: `${mod}${shift},`, label: "Reload Config" },
];

const ROW_HINTS = [
  { key: `${mod}N`, label: "New Row" },
  { key: `${mod}\u2191\u2193`, label: "Switch Row" },
];

const NO_PROJECT_HINTS = [{ key: `${mod}${shift}N`, label: "Add Project" }];

export default function HintBar(props: HintBarProps) {
  const isEmpty = () => !props.hasProjects;
  const top = () => (isEmpty() ? 0 : props.viewportHeight - LAYOUT.HINT_BAR_HEIGHT);
  const height = () => (isEmpty() ? props.viewportHeight : LAYOUT.HINT_BAR_HEIGHT);

  const hints = () => {
    if (isEmpty()) return NO_PROJECT_HINTS;
    if (props.rowCount && props.rowCount > 1) return [...PANEL_HINTS, ...ROW_HINTS];
    return PANEL_HINTS;
  };

  const [stats, setStats] = createSignal({
    panelViewCount: 0,
    mainMemoryMB: 0,
    heapUsedMB: 0,
  });

  onMount(() => {
    async function poll() {
      try {
        setStats(await window.api.getDebugStats());
      } catch (e) {
        console.error("debug:stats failed", e);
      }
    }
    void poll();
    const id = setInterval(() => {
      void poll();
    }, 5000);
    onCleanup(() => {
      clearInterval(id);
    });
  });

  const dimStyle = { color: "#444", "font-size": "11px" } as const;
  const valStyle = {
    color: THEME.muted,
    "font-size": "11px",
    "font-family": THEME.font.body,
  } as const;

  return (
    <div
      style={{
        position: "absolute",
        left: `${props.sidebarWidth}px`,
        top: `${top()}px`,
        width: `calc(100% - ${props.sidebarWidth}px)`,
        height: `${height()}px`,
        display: "flex",
        "flex-direction": isEmpty() ? "column" : undefined,
        "align-items": "center",
        background: THEME.faint,
        "border-top": isEmpty() ? undefined : `1px solid ${THEME.surface}`,
        "user-select": "none",
        "font-size": "12px",
        "padding-left": "16px",
        "padding-right": "16px",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          "justify-content": "center",
          "align-items": isEmpty() ? "center" : undefined,
          gap: "16px",
          overflow: "hidden",
        }}
      >
        <For each={hints()}>
          {(hint) => (
            <span>
              <span
                style={{
                  color: THEME.muted,
                  "font-weight": "500",
                  background: THEME.surface,
                  padding: "2px 6px",
                  "border-radius": "3px",
                  "margin-right": "4px",
                  "font-family": THEME.font.body,
                }}
              >
                {hint.key}
              </span>
              <span style={{ color: "#555" }}>{hint.label}</span>
            </span>
          )}
        </For>
      </div>
      <div
        style={{
          display: "flex",
          gap: "12px",
          "flex-shrink": 0,
          "padding-bottom": isEmpty() ? "8px" : undefined,
          "align-self": isEmpty() ? "flex-end" : undefined,
        }}
      >
        <span>
          <span style={dimStyle}>panels </span>
          <span style={valStyle}>{props.panelCount}</span>
        </span>
        <span>
          <span style={dimStyle}>views </span>
          <span style={valStyle}>{stats().panelViewCount}</span>
        </span>
        <span>
          <span style={dimStyle}>main </span>
          <span style={valStyle}>{stats().mainMemoryMB}MB</span>
        </span>
        <span>
          <span style={dimStyle}>heap </span>
          <span style={valStyle}>{stats().heapUsedMB}MB</span>
        </span>
      </div>
    </div>
  );
}
