import { useState, useCallback, useRef } from 'react';
import type { ActivityItem } from '../hooks/useActivityFeed.js';
import { ActivityFeed } from './ActivityFeed.js';

type TypeFilter = '' | 'tool_calls' | 'decisions' | 'wallet' | 'planning';

interface FilterBtn {
  label: string;
  value: TypeFilter;
}

const FILTER_BTNS: FilterBtn[] = [
  { label: 'All', value: '' },
  { label: 'Tool Calls', value: 'tool_calls' },
  { label: 'Decisions', value: 'decisions' },
  { label: 'Wallet', value: 'wallet' },
  { label: 'Planning', value: 'planning' },
];

interface ActivityTabProps {
  liveEntries: ActivityItem[];
}

/**
 * DASH-02: Activity tab with type filters, text search (debounced), and live feed.
 */
export function ActivityTab({ liveEntries }: ActivityTabProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val);
    }, 300);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    setSearch('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <div className="activity-tab">
      {/* Filter bar */}
      <div className="activity-filters">
        <div className="activity-type-filters">
          {FILTER_BTNS.map((btn) => (
            <button
              key={btn.value}
              className={`filter-pill ${typeFilter === btn.value ? 'active' : ''}`}
              onClick={() => setTypeFilter(btn.value)}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="activity-search-wrap">
          {/* Magnifying glass icon */}
          <svg
            className="search-icon"
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <input
            type="text"
            className="activity-search-input"
            placeholder="Search activity..."
            value={searchInput}
            onChange={handleSearchChange}
            aria-label="Search activity"
          />
          {searchInput && (
            <button
              className="search-clear-btn"
              onClick={handleClearSearch}
              aria-label="Clear search"
            >
              {/* X icon */}
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M1 1l10 10M11 1L1 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Feed */}
      <ActivityFeed
        type={typeFilter || undefined}
        search={search || undefined}
        liveEntries={liveEntries}
      />
    </div>
  );
}
