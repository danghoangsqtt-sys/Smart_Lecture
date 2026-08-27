import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useToastStore } from '../stores/toastStore';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-black uppercase tracking-tight text-blue-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm font-medium text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-sm border border-slate-300 bg-white ${className}`}>{children}</div>;
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BUTTON_STYLES: Record<BtnVariant, string> = {
  primary: 'bg-blue-900 hover:bg-slate-800 text-white shadow-md',
  secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200',
  danger: 'bg-red-600 hover:bg-red-700 text-white shadow-md',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-500 hover:text-blue-900',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
    />
  );
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 disabled:opacity-50 ${className}`}
    />
  );
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-900 ${className}`}
    >
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 ${className}`}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{children}</label>;
}

type BadgeTone = 'green' | 'red' | 'amber' | 'indigo' | 'slate';

const BADGE_TONES: Record<BadgeTone, string> = {
  green: 'bg-green-50 text-green-700 ring-green-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-orange-50 text-orange-700 ring-orange-200',
  indigo: 'bg-blue-50 text-blue-900 ring-blue-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function Badge({ tone = 'slate', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${BADGE_TONES[tone]}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="m-auto max-h-screen w-full max-w-none overflow-visible border-0 bg-transparent p-4 backdrop:bg-slate-900/60 backdrop:backdrop-blur-sm"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Đóng hộp thoại"
        onClick={onClose}
        className="fixed inset-0 cursor-default"
      />
      <div
        className={`relative z-10 mx-auto max-h-[90vh] w-full overflow-y-auto rounded-sm border-t-4 border-blue-900 bg-white p-6 shadow-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id={titleId} className="font-black uppercase tracking-tight text-slate-800">{title}</h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="rounded-sm px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-12 text-center text-sm text-slate-400">{message}</div>;
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-blue-900" />
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] space-y-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto block max-w-sm rounded-xl border-l-4 bg-white px-4 py-2.5 text-left text-sm font-medium text-slate-700 shadow-lg ${TOAST_TONES[t.type]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

const TOAST_TONES = { success: 'border-green-500', error: 'border-red-500', info: 'border-blue-500' } as const;
