import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../components/common/Modal';

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    resolver.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Modal
          title={options.title}
          onClose={() => close(false)}
          size="sm"
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
                Cancel
              </button>
              <button type="button" className={`btn ${options.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>
                {options.confirmLabel ?? 'Confirm'}
              </button>
            </>
          }
        >
          <div className="confirm-message">{options.message}</div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
