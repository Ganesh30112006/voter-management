import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  /** A single input/select/textarea; it receives id and aria attributes. */
  children: ReactElement;
}

export function FormField({ label, error, hint, required, className, children }: FormFieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })
    : children;
  return (
    <div className={`field ${className ?? ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
        {required && (
          <span className="req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
