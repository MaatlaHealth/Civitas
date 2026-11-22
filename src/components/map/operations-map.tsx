"use client";

import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import { useEffect, useRef } from "react";
import { PRIORITY_COLORS } from "@/components/ui/badges";
import { PRIORITY_BANDS, PRIORITY_LABELS, type PriorityBand } from "@/lib/domain/types";
import { MAP_CONFIG } from "./map-config";
import { useMap } from "./use-map";

export interface MapIncident {
  id: string;
  reference: string;
  title: string;
  priorityBand: PriorityBand;
  latitude: number;
  longitude: number;
}

export interface MapPoint {
  id: string;
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
}

interface OperationsMapProps {
  incidents: MapIncident[];
  crews: MapPoint[];
  assets: MapPoint[];
  selectedId: string | null;
  onSelect: (incidentId: string) => void;
}

const SOURCE = { incidents: "incidents", crews: "crews", assets: "assets" } as const;
const LAYER = {
  clusters: "incident-clusters",
  clusterCount: "incident-cluster-count",
  incidents: "incident-points",
  selected: "incident-selected",
  crews: "crew-points",
  assets: "asset-points",
} as const;
const CREW_COLOR = "#082d52";
const ASSET_COLOR = "#7c3aed";
const CLUSTER_RADIUS_PIXELS = 45;
const CLUSTER_MAX_ZOOM = 14;

type PointCollection = GeoJSON.FeatureCollection<GeoJSON.Point>;

const toCollection = <T extends { latitude: number; longitude: number }>(
  items: T[],
  properties: (item: T) => Record<string, string>,
): PointCollection => ({
  type: "FeatureCollection",
  features: items.map((item) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [item.longitude, item.latitude] },
    properties: properties(item),
  })),
});

const priorityColorExpression = [
  "match",
  ["get", "priorityBand"],
  ...PRIORITY_BANDS.flatMap((band) => [band, PRIORITY_COLORS[band]]),
  PRIORITY_COLORS.awaiting_review,
] as unknown as maplibregl.ExpressionSpecification;

/**
 * Operations map. Every marker is built from the records passed in, which
 * the page loads from the database; nothing is drawn that is not a stored
 * incident, crew base or registered asset.
 */
export function OperationsMap({ incidents, crews, assets, selectedId, onSelect }: OperationsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, status } = useMap(containerRef);
  const onSelectRef = useRef(onSelect);
  const fittedRef = useRef(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create sources, layers and interactions once the basemap is ready.
  useEffect(() => {
    if (!map) return;
    const empty: PointCollection = { type: "FeatureCollection", features: [] };
    map.addSource(SOURCE.assets, { type: "geojson", data: empty });
    map.addSource(SOURCE.crews, { type: "geojson", data: empty });
    map.addSource(SOURCE.incidents, {
      type: "geojson",
      data: empty,
      cluster: true,
      clusterRadius: CLUSTER_RADIUS_PIXELS,
      clusterMaxZoom: CLUSTER_MAX_ZOOM,
    });

    map.addLayer({
      id: LAYER.assets,
      type: "circle",
      source: SOURCE.assets,
      paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": ASSET_COLOR, "circle-stroke-width": 3 },
    });
    map.addLayer({
      id: LAYER.crews,
      type: "circle",
      source: SOURCE.crews,
      paint: { "circle-radius": 7, "circle-color": CREW_COLOR, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
    });
    map.addLayer({
      id: LAYER.clusters,
      type: "circle",
      source: SOURCE.incidents,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#168f95",
        "circle-opacity": 0.9,
        "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: LAYER.clusterCount,
      type: "symbol",
      source: SOURCE.incidents,
      filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": MAP_CONFIG.labelFont },
      paint: { "text-color": "#ffffff" },
    });
    map.addLayer({
      id: LAYER.incidents,
      type: "circle",
      source: SOURCE.incidents,
      filter: ["!", ["has", "point_count"]],
      paint: { "circle-radius": 8, "circle-color": priorityColorExpression, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 },
    });
    map.addLayer({
      id: LAYER.selected,
      type: "circle",
      source: SOURCE.incidents,
      filter: ["==", ["get", "id"], ""],
      paint: { "circle-radius": 14, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#061d36", "circle-stroke-width": 3 },
    });

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    const showPopup = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const [longitude, latitude] = feature.geometry.coordinates as [number, number];
      const container = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = String(feature.properties.name ?? "");
      const detail = document.createElement("div");
      detail.textContent = String(feature.properties.detail ?? "");
      container.append(title, detail);
      popup.setLngLat([longitude, latitude]).setDOMContent(container).addTo(map);
      map.getCanvas().style.cursor = "pointer";
    };
    const hidePopup = () => {
      popup.remove();
      map.getCanvas().style.cursor = "";
    };
    for (const layer of [LAYER.incidents, LAYER.crews, LAYER.assets]) {
      map.on("mouseenter", layer, showPopup);
      map.on("mouseleave", layer, hidePopup);
    }

    map.on("click", LAYER.incidents, (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties.id;
      if (typeof id === "string") onSelectRef.current(id);
    });
    map.on("click", LAYER.clusters, async (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const source = map.getSource<GeoJSONSource>(SOURCE.incidents);
      const zoom = await source?.getClusterExpansionZoom(Number(feature.properties.cluster_id));
      map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom: zoom ?? map.getZoom() + 2 });
    });
    map.on("mouseenter", LAYER.clusters, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", LAYER.clusters, () => {
      map.getCanvas().style.cursor = "";
    });
  }, [map]);

  // Push the current records into the map whenever they change.
  useEffect(() => {
    if (!map) return;
    map.getSource<GeoJSONSource>(SOURCE.incidents)?.setData(
      toCollection(incidents, (incident) => ({
        id: incident.id,
        priorityBand: incident.priorityBand,
        name: incident.reference,
        detail: `${incident.title} (${PRIORITY_LABELS[incident.priorityBand]})`,
      })),
    );
    map.getSource<GeoJSONSource>(SOURCE.crews)?.setData(toCollection(crews, (crew) => ({ name: crew.name, detail: crew.detail })));
    map.getSource<GeoJSONSource>(SOURCE.assets)?.setData(toCollection(assets, (asset) => ({ name: asset.name, detail: asset.detail })));

    if (!fittedRef.current && incidents.length > 0) {
      fittedRef.current = true;
      const bounds = new maplibregl.LngLatBounds();
      for (const incident of incidents) bounds.extend([incident.longitude, incident.latitude]);
      map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 0 });
    }
  }, [map, incidents, crews, assets]);

  useEffect(() => {
    if (!map) return;
    map.setFilter(LAYER.selected, ["==", ["get", "id"], selectedId ?? ""]);
    const selected = incidents.find((incident) => incident.id === selectedId);
    if (selected) map.easeTo({ center: [selected.longitude, selected.latitude], zoom: Math.max(map.getZoom(), 15) });
    // Only re-centre when the selection itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-navy-50">
      <div
        ref={containerRef}
        className="h-[420px] w-full lg:h-[620px]"
        role="application"
        aria-label="Operations map of incidents, crew bases and registered assets. The same incidents are listed beside the map."
      />
      {status === "loading" ? (
        <p className="absolute inset-0 flex items-center justify-center bg-navy-50 text-sm text-ink-muted" role="status">Loading map</p>
      ) : null}
      {status === "error" ? (
        <p className="absolute inset-0 flex items-center justify-center bg-navy-50 p-6 text-center text-sm text-navy-900" role="alert">
          The map could not be loaded (the map tile service may be unreachable). All incidents remain available in the list.
        </p>
      ) : null}
      <div className="absolute bottom-8 left-2 rounded-md border border-line bg-white/95 p-2.5 text-xs shadow-sm" aria-label="Map legend">
        <p className="mb-1 font-semibold text-navy-900">Legend</p>
        <ul className="space-y-1">
          {PRIORITY_BANDS.map((band) => (
            <li key={band} className="flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-full border border-white" style={{ backgroundColor: PRIORITY_COLORS[band] }} />
              {PRIORITY_LABELS[band]} incident
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-full bg-teal-600" /> Cluster of incidents
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: CREW_COLOR }} /> Crew base
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3 rounded-full border-2 bg-white" style={{ borderColor: ASSET_COLOR }} /> Registered asset
          </li>
        </ul>
      </div>
    </div>
  );
}
