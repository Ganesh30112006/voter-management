import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
}

export function SearchInput({ value, onChange, placeholder, label = 'Search' }: SearchInputProps) {
  return (
    <div className="field">
      <label className="field-label">
        {label}
        <div className="input-group" style={{ marginTop: 6 }}>
          <Search size={16} className="input-icon" aria-hidden="true" />
          <input
            type="search"
            className="input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            style={{ paddingRight: value ? 40 : undefined }}
          />
          {value && (
            <span className="input-suffix">
              <button type="button" className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => onChange('')} aria-label="Clear search">
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          )}
        </div>
      </label>
    </div>
  );
}
