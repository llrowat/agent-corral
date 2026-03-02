import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  detail?: string;
  duration: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, options?: { detail?: string; duration?: number }) => void;
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
  warn: (message: string, detail?: string) => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, options?: { detail?: string; duration?: number }) => {
      const id = nextId++;
      const duration = options?.duration ?? (type === "error" ? 8000 : 4000);
      const toast: Toast = { id, type, message, detail: options?.detail, duration };
      setToasts((prev) => [...prev, toast]);

      if (duration > 0) {
        const timer = setTimeout(() => removeToast(id), duration);
        timersRef.current.set(id, timer);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string, detail?: string) => addToast("success", message, { detail }),
    [addToast]
  );
  const error = useCallback(
    (message: string, detail?: string) => addToast("error", message, { detail }),
    [addToast]
  );
  const info = useCallback(
    (message: string, detail?: string) => addToast("info", message, { detail }),
    [addToast]
  );
  const warn = useCallback(
    (message: string, detail?: string) => addToast("warning", message, { detail }),
    [addToast]
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, success, error, info, warn, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" data-testid="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const icon = {
    success: "\u2713",
    error: "\u2717",
    info: "\u2139",
    warning: "\u26A0",
  }[toast.type];

  return (
    <div className={`toast toast-${toast.type}`} role="alert" data-testid="toast">
      <div className="toast-main">
        <span className="toast-icon">{icon}</span>
        <span className="toast-message">{toast.message}</span>
        {toast.detail && (
          <button
            className="toast-detail-toggle"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Hide" : "Details"}
          </button>
        )}
        <button className="toast-dismiss" onClick={onDismiss} aria-label="Dismiss">
          &times;
        </button>
      </div>
      {expanded && toast.detail && (
        <div className="toast-detail">{toast.detail}</div>
      )}
    </div>
  );
}
