import { THEME } from "../../../shared/constants";

interface RemoveProjectDialogProps {
  onRemoveFromFlywheel: () => void;
  onDeleteWorktrees: () => void;
  onCancel: () => void;
}

export default function RemoveProjectDialog(props: RemoveProjectDialogProps) {
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
          "max-width": "400px",
          "box-shadow": "0 8px 32px rgba(0,0,0,0.5)",
          border: `1px solid ${THEME.surfaceBorder}`,
        }}
      >
        <p
          style={{
            color: THEME.text,
            margin: "0 0 20px 0",
            "font-size": "14px",
            "line-height": "1.5",
          }}
        >
          This project has worktree rows. Delete them from disk?
        </p>
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
          <button
            onClick={() => {
              props.onRemoveFromFlywheel();
            }}
            style={{
              background: THEME.faint,
              color: THEME.text,
              border: `1px solid ${THEME.surfaceBorder}`,
              padding: "8px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
              width: "100%",
            }}
          >
            Remove from Flywheel
          </button>
          <button
            onClick={() => {
              props.onDeleteWorktrees();
            }}
            style={{
              background: THEME.danger,
              color: "#fff",
              border: "none",
              padding: "8px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
              width: "100%",
            }}
          >
            Remove and delete worktrees
          </button>
          <button
            onClick={() => {
              props.onCancel();
            }}
            style={{
              background: "transparent",
              color: THEME.muted,
              border: "none",
              padding: "6px 16px",
              cursor: "pointer",
              "font-size": "12px",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
