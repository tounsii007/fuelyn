// ============================================================
// Autocomplete — Generic dropdown autocomplete input
// ============================================================

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface AutocompleteProps<T> {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: T) => void;
  search: (query: string) => T[];
  renderItem: (item: T, isHighlighted: boolean) => React.ReactNode;
  getItemKey: (item: T) => string;
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
}

export function Autocomplete<T>({
  value,
  onChange,
  onSelect,
  search,
  renderItem,
  getItemKey,
  placeholder,
  label,
  id,
  className = '',
}: AutocompleteProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<T[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateResults = useCallback(
    (query: string) => {
      const items = search(query);
      setResults(items);
      setIsOpen(items.length > 0 && query.length > 0);
      setHighlightIndex(-1);
    },
    [search],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    updateResults(val);
  };

  const handleSelect = (item: T) => {
    onSelect(item);
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && results[highlightIndex]) {
          handleSelect(results[highlightIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightIndex(-1);
        break;
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => value.length > 0 && updateResults(value)}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600
                   bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                   text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500
                   focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                   transition-colors"
      />

      {/* Dropdown */}
      {isOpen && results.length > 0 && (
        <div
          className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200
                     dark:border-gray-700 rounded-xl shadow-lg overflow-hidden animate-scale-in"
          role="listbox"
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {results.map((item, idx) => (
              <button
                key={getItemKey(item)}
                type="button"
                role="option"
                aria-selected={idx === highlightIndex}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setHighlightIndex(idx)}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                  ${
                    idx === highlightIndex
                      ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                      : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
              >
                {renderItem(item, idx === highlightIndex)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
