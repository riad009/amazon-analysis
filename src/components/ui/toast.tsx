"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

interface Toast {
    id: string;
    message: string;
    type: "success" | "error";
}

interface ToastContextValue {
    showToast: (message: string, type: "success" | "error") => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => { } });

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: "success" | "error") => {
        const id = crypto.randomUUID();
        setToasts((prev) => [...prev, { id, message, type }]);
    }, []);

    const dismiss = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast container */}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
                {toasts.map((t) => (
                    <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
    useEffect(() => {
        const timer = setTimeout(() => onDismiss(toast.id), 3500);
        return () => clearTimeout(timer);
    }, [toast.id, onDismiss]);

    const isSuccess = toast.type === "success";

    return (
        <div
            className={`pointer-events-auto flex items-center gap-2.5 rounded-lg border px-4 py-3 shadow-lg text-sm animate-in slide-in-from-bottom-2 fade-in duration-200 min-w-[280px] max-w-[420px] ${isSuccess
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-red-50 border-red-200 text-red-800"
                }`}
        >
            {isSuccess ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
                <XCircle className="w-4 h-4 shrink-0 text-red-600" />
            )}
            <span className="flex-1 text-xs">{toast.message}</span>
            <button
                onClick={() => onDismiss(toast.id)}
                className="shrink-0 hover:opacity-70 transition-opacity"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}
