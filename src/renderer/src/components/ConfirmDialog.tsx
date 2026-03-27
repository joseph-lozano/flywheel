interface ConfirmDialogProps {
  processName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog(props: ConfirmDialogProps) {
  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      props.onConfirm();
    } else if (e.key === "Escape" || (e.metaKey && e.key === ".")) {
      e.preventDefault();
      props.onCancel();
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "z-index": "1000",
      }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
      ref={(el) => {
        el.focus();
      }}
    >
      <div
        style={{
          background: "#252540",
          "border-radius": "8px",
          padding: "24px",
          "max-width": "400px",
          "box-shadow": "0 8px 32px rgba(0, 0, 0, 0.5)",
          border: "1px solid #3a3a5c",
        }}
      >
        <p
          style={{
            color: "#e0e0e0",
            margin: "0 0 20px 0",
            "font-size": "14px",
            "line-height": "1.5",
          }}
        >
          Process{" "}
          <code
            style={{
              background: "#1a1a2e",
              padding: "2px 6px",
              "border-radius": "3px",
              color: "#f59e0b",
            }}
          >
            {props.processName}
          </code>{" "}
          is running. Close anyway?
        </p>
        <div style={{ display: "flex", gap: "12px", "justify-content": "flex-end" }}>
          <button
            onClick={() => {
              props.onCancel();
            }}
            style={{
              background: "#1a1a2e",
              color: "#888",
              border: "1px solid #3a3a5c",
              padding: "6px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
            }}
          >
            Cancel <span style={{ color: "#555", "font-size": "11px" }}>Esc</span>
          </button>
          <button
            onClick={() => {
              props.onConfirm();
            }}
            style={{
              background: "#f43f5e",
              color: "#fff",
              border: "none",
              padding: "6px 16px",
              "border-radius": "4px",
              cursor: "pointer",
              "font-size": "13px",
            }}
          >
            Close <span style={{ color: "rgba(255,255,255,0.6)", "font-size": "11px" }}>Enter</span>
          </button>
        </div>
      </div>
    </div>
  );
}
