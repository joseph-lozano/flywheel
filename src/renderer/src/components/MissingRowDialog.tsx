import { THEME } from "../../../shared/constants";

interface MissingRowDialogProps {
  branch: string;
  onCancel: () => void;
  onRemove: () => void;
}

export default function MissingRowDialog(props: MissingRowDialogProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "z-index": "1000",
      }}
    >
      <div
        style={{
          background: THEME.surface,
          "border-radius": "8px",
          padding: "24px",
          "max-width": "420px",
          "box-shadow": "0 8px 32px rgba(0,0,0,0.5)",
          border: `1px solid ${THEME.surfaceBorder}`,
        }}
      >
        <p
          style={{
            color: THEME.text,
            margin: "0 0 8px 0",
            "font-size": "14px",
            "font-weight": "bold",
          }}
        >
          Worktree not found
        </p>
        <p
          style={{
            color: THEME.muted,
            margin: "0 0 20px 0",
            "font-size": "13px",
            "line-height": "1.5",
            "font-family": THEME.font.body,
          }}
        >
          The directory for <span style={{ color: THEME.text }}>{props.branch}</span> no longer
          exists on disk.
        </p>
        <div style={{ display: "flex", gap: "12px", "justify-content": "flex-end" }}>
          <button
            onClick={() => {
              props.onCancel();
            }}
            style={{
              background: THEME.faint,
              color: THEME.muted,
              border: `1px solid ${THEME.surfaceBorder}`,
              padding: "6px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              props.onRemove();
            }}
            style={{
              background: THEME.danger,
              color: "#fff",
              border: "none",
              padding: "6px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
            }}
          >
            Remove Row
          </button>
        </div>
      </div>
    </div>
  );
}
