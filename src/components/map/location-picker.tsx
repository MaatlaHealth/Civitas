"use client";

import { Crosshair, Loader2 } from "lucide-react";
import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/layout";
import { isValidCoordinate } from "@/lib/geo/haversine";
import { MAP_CONFIG } from "./map-config";
import { useMap } from "./use-map";

export interface PickedLocation {
  latitude: number;
  longitude: number;
}

interface LocationPickerProps {
  value: PickedLocation | null;
  onChange: (location: PickedLocation) => void;
  /** Id of the element describing a validation error, if any. */
  errorId?: string;
}

const MARKER_COLOR = "#f59a13";
const COORDINATE_PRECISION = 6;

const GEOLOCATION_ERRORS: Record<number, string> = {
  1: "Location permission was denied. Select the location on the map or enter coordinates instead.",
  2: "Your device could not determine its location. Select the location on the map instead.",
  3: "Finding your location took too long. Select the location on the map instead.",
};

const roundCoordinate = (value: number): number => Number(value.toFixed(COORDINATE_PRECISION));

/**
 * Lets the user choose a point by clicking the map, dragging the marker,
 * using the device location (only when they ask for it) or typing
 * coordinates. The typed fields are the keyboard and screen-reader
 * alternative to the map and remain usable if the map fails to load.
 */
export function LocationPicker({ value, onChange, errorId }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const { map, status } = useMap(containerRef);
  const [locating, setLocating] = useState(false);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const [latitudeText, setLatitudeText] = useState(value ? String(value.latitude) : "");
  const [longitudeText, setLongitudeText] = useState(value ? String(value.longitude) : "");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // True when the latest change came from the map itself, so the view should not jump.
  const changedOnMap = useRef(false);

  // Keep the typed fields in step when the location is set from outside (an address suggestion).
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (value && (Number(latitudeText) !== value.latitude || Number(longitudeText) !== value.longitude)) {
      setLatitudeText(String(value.latitude));
      setLongitudeText(String(value.longitude));
    }
  }

  const choose = (latitude: number, longitude: number) => {
    changedOnMap.current = true;
    const location = { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) };
    setLatitudeText(String(location.latitude));
    setLongitudeText(String(location.longitude));
    onChangeRef.current(location);
  };
  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });

  useEffect(() => {
    if (!map) return;
    const handleClick = (event: maplibregl.MapMouseEvent) => chooseRef.current(event.lngLat.lat, event.lngLat.lng);
    map.on("click", handleClick);
    map.getCanvas().style.cursor = "crosshair";
    return () => {
      map.off("click", handleClick);
    };
  }, [map]);

  // Keep the marker in step with the selected value.
  useEffect(() => {
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ color: MARKER_COLOR, draggable: true });
      marker.on("dragend", () => {
        const position = marker.getLngLat();
        chooseRef.current(position.lat, position.lng);
      });
      marker.setLngLat([value.longitude, value.latitude]).addTo(map);
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([value.longitude, value.latitude]);
    }
    // Typed coordinates and address suggestions move the view; clicks and drags on the map do not.
    if (!changedOnMap.current || !map.getBounds().contains([value.longitude, value.latitude])) {
      map.easeTo({ center: [value.longitude, value.latitude], zoom: Math.max(map.getZoom(), MAP_CONFIG.detailZoom) });
    }
    changedOnMap.current = false;
  }, [map, value]);

  const useDeviceLocation = () => {
    setGeolocationError(null);
    if (!("geolocation" in navigator)) {
      setGeolocationError("This browser does not support location. Select the location on the map instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        choose(position.coords.latitude, position.coords.longitude);
        map?.easeTo({ center: [position.coords.longitude, position.coords.latitude], zoom: MAP_CONFIG.detailZoom });
      },
      (error) => {
        setLocating(false);
        setGeolocationError(GEOLOCATION_ERRORS[error.code] ?? "Your location could not be determined.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const applyTypedCoordinates = (latitudeInput: string, longitudeInput: string) => {
    const latitude = Number(latitudeInput);
    const longitude = Number(longitudeInput);
    if (latitudeInput.trim() === "" || longitudeInput.trim() === "" || !isValidCoordinate(latitude, longitude)) return;
    onChangeRef.current({ latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) });
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-md border border-line bg-navy-50">
        <div
          ref={containerRef}
          className="h-72 w-full sm:h-96"
          role="application"
          aria-label="Map for selecting the incident location. Click or tap to place the marker. Coordinates can also be typed in the fields below."
        />
        {status === "loading" ? (
          <p className="absolute inset-0 flex items-center justify-center gap-2 bg-navy-50 text-sm text-ink-muted" role="status">
            <Loader2 aria-hidden className="size-4 animate-spin" /> Loading map
          </p>
        ) : null}
        {status === "error" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-navy-50 p-4">
            <Notice tone="warning" title="The map could not be loaded">
              You can still report the location by entering its coordinates below or describing it in the address field.
            </Notice>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Button variant="secondary" size="sm" onClick={useDeviceLocation} disabled={locating}>
          {locating ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Crosshair aria-hidden className="size-4" />}
          Use my current location
        </Button>
        <div>
          <label htmlFor="location-latitude" className="label">
            Latitude
          </label>
          <input
            id="location-latitude"
            className="input w-36"
            inputMode="decimal"
            autoComplete="off"
            value={latitudeText}
            aria-describedby={errorId}
            onChange={(event) => {
              setLatitudeText(event.target.value);
              applyTypedCoordinates(event.target.value, longitudeText);
            }}
          />
        </div>
        <div>
          <label htmlFor="location-longitude" className="label">
            Longitude
          </label>
          <input
            id="location-longitude"
            className="input w-36"
            inputMode="decimal"
            autoComplete="off"
            value={longitudeText}
            aria-describedby={errorId}
            onChange={(event) => {
              setLongitudeText(event.target.value);
              applyTypedCoordinates(latitudeText, event.target.value);
            }}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted" aria-live="polite">
        {value
          ? `Selected location: ${value.latitude}, ${value.longitude}. Drag the marker or click elsewhere to adjust it.`
          : "No location selected yet. Your location is only read if you choose “Use my current location”."}
      </p>
      {geolocationError ? (
        <Notice tone="warning" live className="mt-2">
          {geolocationError}
        </Notice>
      ) : null}
    </div>
  );
}
