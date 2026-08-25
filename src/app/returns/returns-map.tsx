"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type ReturnPoint = {
  id: string;
  name: string;
  town: string | null;
  postcode: string | null;
  address_line_1: string | null;
  latitude: number;
  longitude: number;
  returnable_count: number;
  oldest_days: number | null;
  package_breakdown: Record<string, number>;
};

type UserLocation = { latitude: number; longitude: number } | null;
type LatLng = [number, number];
type LeafletMap = { setView:(point:LatLng,zoom:number)=>LeafletMap; fitBounds:(bounds:LatLng[],options?:Record<string,unknown>)=>LeafletMap; invalidateSize:()=>void };
type LeafletLayerGroup = { addTo:(map:LeafletMap)=>LeafletLayerGroup; clearLayers:()=>void };
type LeafletMarker = { bindPopup:(html:string)=>LeafletMarker; addTo:(target:LeafletMap|LeafletLayerGroup)=>LeafletMarker; remove:()=>void };
type ReturnsLeafletNamespace = {
  map:(element:HTMLElement,options?:Record<string,unknown>)=>LeafletMap;
  tileLayer:(url:string,options?:Record<string,unknown>)=>{addTo:(map:LeafletMap)=>unknown};
  layerGroup:()=>LeafletLayerGroup;
  circleMarker:(point:LatLng,options?:Record<string,unknown>)=>LeafletMarker;
  divIcon:(options?:Record<string,unknown>)=>unknown;
  marker:(point:LatLng,options?:Record<string,unknown>)=>LeafletMarker;
};

function leaflet() { return (window as unknown as { L?: ReturnsLeafletNamespace }).L; }

export function ReturnsMap({ points, totalReturnables, unmappedAccounts }: { points: ReturnPoint[]; totalReturnables: number; unmappedAccounts: number }) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LeafletLayerGroup | null>(null);
  const userMarkerRef = useRef<LeafletMarker | null>(null);
  const [ready, setReady] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [minimumCount, setMinimumCount] = useState(1);

  const filtered = useMemo(() => points.filter((point) => point.returnable_count >= minimumCount), [points, minimumCount]);
  const nearby = useMemo(() => {
    if (!userLocation) return [];
    return filtered
      .map((point) => ({ ...point, distance_km: haversineKm(userLocation.latitude, userLocation.longitude, point.latitude, point.longitude) }))
      .sort((a, b) => {
        if (Math.abs(a.distance_km - b.distance_km) < 2) return b.returnable_count - a.returnable_count;
        return a.distance_km - b.distance_km;
      })
      .slice(0, 20);
  }, [filtered, userLocation]);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(() => {
      const L = leaflet();
      if (cancelled || !mapEl.current || !L || mapRef.current) return;
      const map = L.map(mapEl.current, { zoomControl: true, tap: true }).setView([53.2, -2.2], 8);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
      window.setTimeout(() => map.invalidateSize(), 0);
    }).catch(() => setLocationError("Map tiles could not be loaded."));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const L = leaflet();
    if (!ready || !mapRef.current || !layerRef.current || !L) return;
    layerRef.current.clearLayers();
    const bounds: LatLng[] = [];

    for (const point of filtered) {
      const size = point.returnable_count >= 20 ? 44 : point.returnable_count >= 10 ? 40 : 36;
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:#0f172a;color:white;border:3px solid white;box-shadow:0 2px 8px rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px">${point.returnable_count}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker([point.latitude, point.longitude], { icon });
      marker.bindPopup(popupHtml(point));
      marker.addTo(layerRef.current);
      bounds.push([point.latitude, point.longitude]);
    }

    if (!userLocation && bounds.length) {
      if (bounds.length === 1) mapRef.current.setView(bounds[0], 11);
      else mapRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 10 });
    }
  }, [ready, filtered, userLocation]);

  useEffect(() => {
    const L = leaflet();
    if (!ready || !mapRef.current || !L || !userLocation) return;
    if (userMarkerRef.current) userMarkerRef.current.remove();
    userMarkerRef.current = L.circleMarker([userLocation.latitude, userLocation.longitude], {
      radius: 9, color: "#0f172a", fillColor: "#ffffff", fillOpacity: 1, weight: 4,
    }).addTo(mapRef.current).bindPopup("You are here");
  }, [ready, userLocation]);

  function locateMe() {
    setLocationError(null);
    if (!navigator.geolocation) { setLocationError("Location is not available on this device."); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setUserLocation(next);
        mapRef.current?.setView([next.latitude, next.longitude], 11);
      },
      () => setLocationError("Couldn’t get your location. Check browser location permission."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-3 gap-3">
        <Metric label="Collectible" value={String(totalReturnables)} />
        <Metric label="Locations" value={String(points.length)} />
        <Metric label="Showing" value={String(filtered.reduce((sum, p) => sum + p.returnable_count, 0))} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold">Collection map</p><p className="text-sm text-slate-500">Numbers on pins are collectible returnable containers.</p></div>
          <button type="button" onClick={locateMe} className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white">Use my location</button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Minimum at stop:</span>
          {[1, 3, 5, 10].map((count) => <button key={count} type="button" onClick={() => setMinimumCount(count)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${minimumCount === count ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{count}+</button>)}
        </div>
        {locationError && <p className="mt-3 text-sm text-rose-700">{locationError}</p>}
        {unmappedAccounts > 0 && <p className="mt-3 text-xs text-amber-700">{unmappedAccounts} return location{unmappedAccounts === 1 ? " is" : "s are"} not mapped yet and therefore cannot appear on the map.</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div ref={mapEl} className="h-[62vh] min-h-[440px] w-full" aria-label="Map of nearby returnable container collections" /></div>
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Nearby collections</h2>
          {!userLocation ? <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Tap <strong>Use my location</strong> to rank collections by distance.</div> : nearby.length ? <div className="mt-3 divide-y divide-slate-100">{nearby.map((point) => <div key={point.id} className="py-3 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/accounts/${point.id}`} className="font-semibold text-slate-900 hover:underline">{point.name}</Link><p className="mt-1 text-xs text-slate-500">{[point.town, point.postcode].filter(Boolean).join(" · ")}</p><p className="mt-1 text-sm font-semibold text-slate-700">{point.returnable_count} returnable{point.returnable_count === 1 ? "" : "s"}{point.oldest_days != null ? ` · oldest ${point.oldest_days}d` : ""}</p><p className="mt-1 text-xs text-slate-500">{breakdownText(point.package_breakdown)}</p></div><div className="shrink-0 text-right"><p className="text-sm font-semibold text-slate-700">{distanceLabel(point.distance_km)}</p><a href={navigationUrl(point)} target="_blank" rel="noreferrer" className="mt-2 inline-flex rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white">Navigate</a></div></div></div>)}</div> : <p className="mt-3 text-sm text-slate-500">No return locations match the current minimum.</p>}
        </aside>
      </div>
      <p className="text-xs text-slate-400">Distance is straight-line distance from your current position; navigation opens Google Maps for road routing.</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold tracking-tight">{value}</p></div>; }
function popupHtml(point: ReturnPoint) { const breakdown = breakdownText(point.package_breakdown); const age = point.oldest_days == null ? "" : `<br><span>Oldest: <strong>${point.oldest_days} days</strong></span>`; return `<div style="min-width:220px;padding:2px"><strong style="font-size:14px">${escapeHtml(point.name)}</strong><br><span>${escapeHtml([point.town, point.postcode].filter(Boolean).join(" · "))}</span><br><strong>${point.returnable_count} returnable${point.returnable_count === 1 ? "" : "s"}</strong>${age}<br><span>${escapeHtml(breakdown)}</span><br><a style="display:inline-block;margin-top:8px;margin-right:10px;font-weight:700" href="${navigationUrl(point)}" target="_blank" rel="noreferrer">Navigate →</a><a style="display:inline-block;margin-top:8px;font-weight:700" href="/accounts/${point.id}">Account →</a></div>`; }
function breakdownText(breakdown: Record<string, number>) { const entries = Object.entries(breakdown).filter(([, qty]) => Number(qty) > 0).sort((a, b) => Number(b[1]) - Number(a[1])); return entries.length ? entries.map(([type, qty]) => `${qty} × ${type}`).join(" · ") : "No package breakdown"; }
function navigationUrl(point: ReturnPoint) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`; }
function distanceLabel(km: number) { return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`; }
function haversineKm(lat1:number,lon1:number,lat2:number,lon2:number){const r=6371;const dLat=toRad(lat2-lat1);const dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 2*r*Math.asin(Math.sqrt(a));}
function toRad(value:number){return value*Math.PI/180;}
function escapeHtml(value:string){return value.replace(/[&<>'\"]/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[char]||char));}
async function loadLeaflet(){if(leaflet())return;if(!document.querySelector('link[data-fieldops-leaflet]')){const link=document.createElement("link");link.rel="stylesheet";link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";link.dataset.fieldopsLeaflet="true";document.head.appendChild(link);}await new Promise<void>((resolve,reject)=>{const existing=document.querySelector('script[data-fieldops-leaflet]') as HTMLScriptElement|null;if(existing){if(leaflet()){resolve();return;}existing.addEventListener("load",()=>resolve(),{once:true});existing.addEventListener("error",()=>reject(),{once:true});return;}const script=document.createElement("script");script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";script.async=true;script.dataset.fieldopsLeaflet="true";script.onload=()=>resolve();script.onerror=()=>reject(new Error("Leaflet failed to load"));document.head.appendChild(script);});}
