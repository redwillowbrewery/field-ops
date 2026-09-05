"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type AccountPoint = {
  id: string;
  name: string;
  town: string | null;
  postcode: string | null;
  classification: string | null;
  relationship_status: string | null;
  latitude: number;
  longitude: number;
  last_visit_at: string | null;
  overdue_follow_up: boolean;
};

type AppointmentPoint = {
  id: string;
  starts_at: string;
  purpose: string | null;
  account: {
    id: string;
    name: string;
    town: string | null;
    postcode: string | null;
    latitude: number;
    longitude: number;
  };
};

type UserLocation = { latitude: number; longitude: number } | null;
type LatLng = [number, number];
type LeafletMap = { setView:(point:LatLng,zoom:number)=>LeafletMap; fitBounds:(bounds:LatLng[],options?:Record<string,unknown>)=>LeafletMap; invalidateSize:()=>void };
type LeafletLayerGroup = { addTo:(map:LeafletMap)=>LeafletLayerGroup; clearLayers:()=>void };
type LeafletMarker = { bindPopup:(html:string)=>LeafletMarker; bindTooltip:(text:string,options?:Record<string,unknown>)=>LeafletMarker; addTo:(target:LeafletMap|LeafletLayerGroup)=>LeafletMarker; remove:()=>void };
type LeafletNamespace = {
  map:(element:HTMLElement,options?:Record<string,unknown>)=>LeafletMap;
  tileLayer:(url:string,options?:Record<string,unknown>)=>{addTo:(map:LeafletMap)=>unknown};
  layerGroup:()=>LeafletLayerGroup;
  circleMarker:(point:LatLng,options?:Record<string,unknown>)=>LeafletMarker;
};

declare global {
  interface Window { L?: LeafletNamespace; }
}

const STATUSES = ["current", "cooling", "lapsed", "dormant", "prospect", "closed"];
const STATUS_COLOURS: Record<string, string> = {
  current: "#059669",
  cooling: "#d97706",
  lapsed: "#ea580c",
  dormant: "#64748b",
  prospect: "#2563eb",
  closed: "#be123c",
};

export function MapView({ accounts, appointments }: { accounts: AccountPoint[]; appointments: AppointmentPoint[] }) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LeafletLayerGroup | null>(null);
  const appointmentLayerRef = useRef<LeafletLayerGroup | null>(null);
  const userMarkerRef = useRef<LeafletMarker | null>(null);
  const [ready, setReady] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(STATUSES));
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  const filtered = useMemo(() => accounts.filter((account) => {
    const status = account.relationship_status || "dormant";
    if (!selectedStatuses.has(status)) return false;
    if (onlyOverdue && !account.overdue_follow_up) return false;
    return true;
  }), [accounts, selectedStatuses, onlyOverdue]);

  const nearby = useMemo(() => {
    if (!userLocation) return [];
    return filtered
      .map((account) => ({ ...account, distance_km: haversineKm(userLocation.latitude, userLocation.longitude, account.latitude, account.longitude) }))
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, 12);
  }, [filtered, userLocation]);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then(() => {
      if (cancelled || !mapEl.current || !window.L || mapRef.current) return;
      const L = window.L;
      const map = L.map(mapEl.current, { zoomControl: true, tap: true }).setView([53.2, -2.2], 8);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      appointmentLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
      window.setTimeout(() => map.invalidateSize(), 0);
    }).catch(() => setLocationError("Map tiles could not be loaded."));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !layerRef.current || !window.L) return;
    const L = window.L;
    layerRef.current.clearLayers();
    const bounds: LatLng[] = [];

    for (const account of filtered) {
      const status = account.relationship_status || "dormant";
      const colour = STATUS_COLOURS[status] || STATUS_COLOURS.dormant;
      const marker = L.circleMarker([account.latitude, account.longitude], {
        radius: account.overdue_follow_up ? 12 : 10,
        color: "#ffffff",
        fillColor: colour,
        fillOpacity: 0.96,
        weight: 3,
      });
      marker.bindPopup(`<div style="min-width:210px;padding:2px"><strong style="font-size:14px">${escapeHtml(account.name)}</strong><br><span>${escapeHtml([account.town, account.postcode].filter(Boolean).join(" · "))}</span><br><span style="text-transform:capitalize">${escapeHtml(status)}</span>${account.overdue_follow_up ? " · <strong>follow-up overdue</strong>" : ""}<br><a style="display:inline-block;margin-top:8px;font-weight:700" href="/accounts/${account.id}">View account →</a></div>`);
      marker.addTo(layerRef.current);
      bounds.push([account.latitude, account.longitude]);
    }

    if (!userLocation && bounds.length && bounds.length < 1500) {
      mapRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
    }
  }, [ready, filtered, userLocation]);

  useEffect(() => {
    if (!ready || !appointmentLayerRef.current || !window.L) return;
    const L = window.L;
    appointmentLayerRef.current.clearLayers();
    for (const appointment of appointments) {
      const marker = L.circleMarker([appointment.account.latitude, appointment.account.longitude], {
        radius: 14,
        color: "#111827",
        fillColor: "#ffffff",
        fillOpacity: 1,
        weight: 4,
      });
      marker.bindTooltip(formatTime(appointment.starts_at), { permanent: true, direction: "top", offset: [0, -12], className: "fieldops-appointment-label" });
      marker.bindPopup(`<div style="min-width:210px"><strong>${escapeHtml(appointment.account.name)}</strong><br>${escapeHtml(formatTime(appointment.starts_at))} · ${escapeHtml(appointment.purpose || "Appointment")}<br><a style="display:inline-block;margin-top:8px;font-weight:700" href="/appointments/${appointment.id}">Open appointment →</a></div>`);
      marker.addTo(appointmentLayerRef.current);
    }
  }, [ready, appointments]);

  useEffect(() => {
    if (!ready || !mapRef.current || !window.L || !userLocation) return;
    const L = window.L;
    if (userMarkerRef.current) userMarkerRef.current.remove();
    userMarkerRef.current = L.circleMarker([userLocation.latitude, userLocation.longitude], {
      radius: 10, color: "#111827", fillColor: "#ffffff", fillOpacity: 1, weight: 4,
    }).addTo(mapRef.current).bindPopup("You are here");
  }, [ready, userLocation]);

  function toggleStatus(status: string) {
    setSelectedStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) next.delete(status); else next.add(status);
      return next;
    });
  }

  function locateMe() {
    setLocationError(null);
    if (!navigator.geolocation) { setLocationError("Location is not available on this device."); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        setUserLocation(next);
        mapRef.current?.setView([next.latitude, next.longitude], 12);
      },
      () => setLocationError("Couldn’t get your location. Check browser location permission."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function centreAppointments() {
    if (!mapRef.current || !window.L || !appointments.length) return;
    const bounds: LatLng[] = appointments.map((appointment) => [appointment.account.latitude, appointment.account.longitude]);
    if (bounds.length === 1) mapRef.current.setView(bounds[0], 12);
    else mapRef.current.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
  }

  function centreAccounts() {
    if (!mapRef.current || !window.L || !filtered.length) return;
    const bounds: LatLng[] = filtered.map((account) => [account.latitude, account.longitude]);
    mapRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold">{filtered.length} mapped accounts</p><p className="text-sm text-slate-500">Large pins are easier to tap; today’s appointments have a time label.</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={locateMe} className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white">My location</button>
            <button type="button" onClick={centreAppointments} disabled={!appointments.length} className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-40">Today’s appointments</button>
            <button type="button" onClick={centreAccounts} className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">All accounts</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {STATUSES.map((status) => {
            const active = selectedStatuses.has(status);
            return <button key={status} type="button" onClick={() => toggleStatus(status)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium capitalize ${active ? "border-slate-300 bg-white text-slate-800" : "border-slate-200 bg-slate-50 text-slate-400"}`}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOURS[status], opacity: active ? 1 : 0.3 }} />{status}</button>;
          })}
          <button type="button" onClick={() => setOnlyOverdue((value) => !value)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${onlyOverdue ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-600"}`}>Follow-up overdue</button>
        </div>
        {locationError && <p className="mt-3 text-sm text-rose-700">{locationError}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div ref={mapEl} className="h-[58vh] min-h-[420px] w-full" aria-label="Map of customer accounts" />
        </div>

        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold">Nearby</h2>
          {!userLocation ? <div className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Tap <strong>My location</strong> to see the nearest accounts.</div> : nearby.length ? <div className="mt-3 divide-y divide-slate-100">{nearby.map((account) => <Link key={account.id} href={`/accounts/${account.id}`} className="block py-3 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOURS[account.relationship_status || "dormant"] }} /><p className="truncate font-semibold text-slate-800">{account.name}</p></div><p className="mt-1 text-xs text-slate-500">{[account.town, account.postcode, account.classification].filter(Boolean).join(" · ")}</p>{account.overdue_follow_up && <p className="mt-1 text-xs font-semibold text-rose-600">Follow-up overdue</p>}</div><span className="shrink-0 text-sm font-semibold text-slate-600">{account.distance_km < 1 ? `${Math.round(account.distance_km * 1000)}m` : `${account.distance_km.toFixed(1)}km`}</span></div></Link>)}</div> : <p className="mt-3 text-sm text-slate-500">No accounts match the current filters.</p>}
        </aside>
      </div>

      <p className="text-xs text-slate-400">Account pins use postcode-level coordinates, so they are for field planning rather than exact front-door navigation.</p>
    </div>
  );
}

async function loadLeaflet() {
  if (window.L) return;
  if (!document.querySelector('link[data-fieldops-leaflet]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.dataset.fieldopsLeaflet = "true";
    document.head.appendChild(link);
  }
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-fieldops-leaflet]') as HTMLScriptElement | null;
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(), { once: true }); return; }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.dataset.fieldopsLeaflet = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Leaflet failed to load"));
    document.head.appendChild(script);
  });
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}
function toRad(value: number) { return value * Math.PI / 180; }
function formatTime(value: string) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function escapeHtml(value: string) { return value.replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '\"': "&quot;" }[char] || char)); }
