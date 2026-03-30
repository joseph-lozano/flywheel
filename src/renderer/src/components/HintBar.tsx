import { createSignal, For, onCleanup, onMount } from "solid-js";
import { LAYOUT, THEME } from "../../../shared/constants";

interface HintBarProps {
  viewportHeight: number;
  panelCount: number;
  hasProjects: boolean;
  sidebarWidth: number;
  rowCount?: number;
}

const PANEL_HINTS = [
  { key: "\u2318T", label: "Terminal" },
  { key: "\u2318B", label: "Browser" },
  { key: "\u2318W", label: "Close" },
  { key: "\u2318G", label: "Blur" },
  { key: "\u2318+/-", label: "Zoom" },
  { key: "\u2318\u21e7,", label: "Reload Config" },
];

const ROW_HINTS = [
  { key: "\u2318N", label: "New Row" },
  { key: "\u2318\u2191\u2193", label: "Switch Row" },
];

const NO_PROJECT_HINTS = [{ key: "\u2318\u21e7N", label: "Add Project" }];

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
