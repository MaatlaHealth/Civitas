"use client";

import { Loader2, MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { MAP_CONFIG } from "@/components/map/map-config";

export interface AddressChoice {
  label: string;
  latitude: number;
  longitude: number;
}

interface AddressSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the reporter picks a suggestion. */
  onChoose: (choice: AddressChoice) => void;
  /** Suggestions are biased towards this point (the marker, or the map's default centre). */
  near: { latitude: number; longitude: number } | null;
}

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

/**
 * Address field with suggestions as the reporter types. Choosing one fills
 * the address and moves the map marker there; the reporter can then drag the
 * marker to the exact spot. Typing an address without choosing a suggestion
 * is still allowed. Follows the WAI-ARIA combobox pattern for keyboard use.
 */
export function AddressSearch({ value, onChange, onChoose, near }: AddressSearchProps) {
  const id = useId();
  const [suggestions, setSuggestions] = useState<AddressChoice[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  // Set when the text was filled in by choosing a suggestion, so it is not searched again.
  const chosenLabel = useRef<string | null>(null);
  const nearRef = useRef(near);

  useEffect(() => {
    nearRef.current = near;
  }, [near]);

  useEffect(() => {
    const query = value.trim();
    if (query.length < MIN_QUERY_LENGTH || query === chosenLabel.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, ...(nearRef.current ?? MAP_CONFIG.center) }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("unavailable");
        const body = (await response.json()) as { suggestions: AddressChoice[] };
        setSuggestions(body.suggestions);
        setActiveIndex(-1);
        setOpen(true);
        setUnavailable(false);
      } catch {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setOpen(false);
        setUnavailable(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const choose = (choice: AddressChoice) => {
    chosenLabel.current = choice.label;
    onChange(choice.label);
    onChoose(choice);
    setOpen(false);
    setSuggestions([]);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]!);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && value.trim().length >= MIN_QUERY_LENGTH;
  return (
    <div className="relative">
      <label htmlFor={`${id}-input`} className="label">
        Street address or place name
      </label>
      <div className="relative">
        <input
          id={`${id}-input`}
          name="address"
          className="input pr-9"
          maxLength={200}
          autoComplete="off"
          placeholder="Start typing, for example: 12 Main Street"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          aria-describedby={`${id}-hint`}
          value={value}
          onChange={(event) => {
            chosenLabel.current = null;
            onChange(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
        />
        {loading ? <Loader2 aria-hidden className="absolute top-2.5 right-2.5 size-4 animate-spin text-ink-muted" /> : null}
      </div>
      <ul
        id={`${id}-list`}
        role="listbox"
        aria-label="Address suggestions"
        hidden={!showList}
        className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-line bg-white py-1 shadow-lg"
      >
        {suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.label}-${suggestion.latitude}`}
            id={`${id}-option-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            // Mouse down, not click, so the choice registers before the input loses focus.
            onMouseDown={(event) => {
              event.preventDefault();
              choose(suggestion);
            }}
            onMouseEnter={() => setActiveIndex(index)}
            className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${index === activeIndex ? "bg-navy-50" : ""}`}
          >
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-teal-700" />
            <span>{suggestion.label}</span>
          </li>
        ))}
        {suggestions.length === 0 && !loading ? (
          <li className="px-3 py-2 text-sm text-ink-muted">No matching places found. Place the marker on the map instead.</li>
        ) : null}
      </ul>
      <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted" role="status">
        {unavailable
          ? "Suggestions are unavailable right now. You can still type the address and place the marker on the map."
          : "Pick a suggestion to move the marker there, then drag the marker to the exact spot. Optional."}
      </p>
    </div>
  );
}
