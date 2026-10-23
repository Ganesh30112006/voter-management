import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Prevents closing via backdrop/Escape, e.g. while a request is in flight. */
  locked?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open modals, innermost last. Only the top one reacts to Escape and Tab. */
const openModals: string[] = [];

export function Modal({ title, onClose, children, footer, size = 'md', locked = false }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  // Captured on first render, before any child autoFocus moves focus into the dialog.
  const restoreFocusRef = useRef(document.activeElement as HTMLElement | null);

  useEffect(() => {
    const previouslyFocused = restoreFocusRef.current;
    const dialog = dialogRef.current;
    // React's autoFocus has already focused a child if one asked for it; otherwise focus the first field.
    if (dialog && !dialog.contains(document.activeElement)) {
      const inBody = FOCUSABLE.split(', ').map((s) => `.modal-body ${s}`).join(', ');
      (dialog.querySelector<HTMLElement>(inBody) ?? dialog).focus();
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    openModals.push(titleId);

    const onKey = (e: KeyboardEvent) => {
      if (openModals[openModals.length - 1] !== titleId) return;
      if (e.key === 'Escape' && !lockedRef.current) {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && dialog) {
        const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      const idx = openModals.lastIndexOf(titleId);
      if (idx !== -1) openModals.splice(idx, 1);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) onClose();
      }}
    >
      <div ref={dialogRef} className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} disabled={locked} aria-label="Close dialog">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
