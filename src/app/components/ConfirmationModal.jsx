import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export default function ConfirmationModal({ isOpen, onClose, onConfirm, title, details, loading = false }) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-50 transition-opacity"
        onClick={!loading ? onClose : undefined}
        aria-hidden="true"
      />
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 sm:max-w-md sm:mx-auto shadow-2xl animate-in slide-in-from-bottom duration-300 pb-safe">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-text-primary mb-4">{title}</h2>
          {details && (
            <div className="space-y-3 mb-6">
              {details.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
                  <span className="text-sm text-text-secondary">{item.label}</span>
                  <span className="text-sm font-medium text-text-primary text-right">{item.value}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 px-4 border border-border text-text-primary rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 py-3 px-4 bg-primary text-white rounded-xl hover:bg-primary-deep transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                "Confirm"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
