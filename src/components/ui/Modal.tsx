import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose(): void;
  title: string;
  subtitle?: string;
  width?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ open, onClose, title, subtitle, width = 'max-w-2xl', children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <div
        className={`glass-strong relative flex max-h-[86vh] w-full ${width} animate-fade-in-up flex-col overflow-hidden`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <footer className="flex items-center justify-end gap-3 border-t border-white/10 bg-black/20 px-6 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
