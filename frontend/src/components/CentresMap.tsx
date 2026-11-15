import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCentresMap, type CentresMapData } from "../api/centres.api";
import { Empty, ErrorNote, Panel, Pill } from "./ui";

// The directory on a map, plus the places customers asked for where no verified centre exists yet.
// The interactive map needs a browser key (VITE_GOOGLE_MAPS_BROWSER_KEY, Maps JavaScript API, restricted to
// this site). Without it the same information is shown as lists with "open in Google Maps" links.
// The key comes from Configuration -> Maps (saved in the console); the build-time variable is only a fallback.
const ENV_KEY = (import.meta.env.VITE_GOOGLE_MAPS_BROWSER_KEY as string | undefined) || "";

interface GMap {
  fitBounds(b: GBounds): void;
  setZoom(z: number): void;
}
interface GBounds {
  extend(p: { lat: number; lng: number }): void;
}
interface GMapsApi {
  Map: new (el: HTMLElement, o: Record<string, unknown>) => GMap;
  Marker: new (o: Record<string, unknown>) => { addListener(ev: string, fn: () => void): void };
  InfoWindow: new () => { setContent(s: string): void; open(o: Record<string, unknown>): void };
  LatLngBounds: new () => GBounds;
}
type MapsWindow = Window & { google?: { maps: GMapsApi }; __oxxyMaps?: Promise<GMapsApi> };

function loadMaps(key: string): Promise<GMapsApi> {
  const w = window as MapsWindow;
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  if (!w.__oxxyMaps)
    w.__oxxyMaps = new Promise<GMapsApi>((resolve, reject) => {
      const el = document.createElement("script");
      el.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
      el.async = true;
      el.onload = () =>
        w.google?.maps ? resolve(w.google.maps) : reject(new Error("Google Maps did not load"));
      el.onerror = () =>
        reject(new Error("Google Maps could not be loaded (check the browser key)"));
      document.head.appendChild(el);
    });
  return w.__oxxyMaps;
}

export const mapsLink = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`;
const searchLink = (text: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function LiveMap({ data }: { data: CentresMapData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    let off = false;
    loadMaps(data.browser_key || ENV_KEY)
      .then((g) => {
        if (off || !ref.current) return;
        const map = new g.Map(ref.current, {
          center: { lat: 20.6, lng: 78.9 },
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
        });
        const info = new g.InfoWindow();
        const bounds = new g.LatLngBounds();
        let n = 0;
        const pin = (lat: number, lng: number, title: string, html: string, color: string) => {
          const marker = new g.Marker({
            map,
            position: { lat, lng },
            title,
            icon: {
              path: 0,
              scale: 7,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
          });
          marker.addListener("click", () => {
            info.setContent(html);
            info.open({ map, anchor: marker });
          });
          bounds.extend({ lat, lng });
          n++;
        };
        for (const c of data.centres)
          if (c.latitude && c.longitude)
            pin(
              c.latitude,
              c.longitude,
              c.name,
              `<b>${esc(c.name)}</b><br>${esc([c.branch, c.locality, c.city].filter(Boolean).join(", "))}<br>${c.verified && c.active ? "Verified, active" : "Not suggested (inactive or not verified)"}`,
              c.verified && c.active ? "#0f9d8f" : "#9aa7ad",
            );
        for (const x of data.gaps)
          if (x.latitude && x.longitude)
            pin(
              x.latitude,
              x.longitude,
              x.place,
              `<b>${esc(x.place)}</b><br>${x.requests} customer request(s), no verified centre`,
              "#e0533d",
            );
        if (n > 1) map.fitBounds(bounds);
        else if (n === 1) {
          map.fitBounds(bounds);
          map.setZoom(13);
        }
      })
      .catch((e: Error) => !off && setFailed(e.message));
    return () => {
      off = true;
    };
  }, [data]);
  if (failed)
    return (
      <div className="panel-b small" style={{ color: "var(--crit)" }}>
        {failed}
      </div>
    );
  return <div ref={ref} style={{ height: 460, width: "100%" }} />;
}

export default function CentresMap() {
  const q = useQuery({ queryKey: ["centres", "map"], queryFn: getCentresMap });
  const d = q.data;
  const noPoint = (d?.centres ?? []).filter((c) => !c.latitude || !c.longitude);
  return (
    <>
      <ErrorNote error={q.error} />
      {q.isLoading && <Empty>Loading…</Empty>}
      {d && (
        <>
          <Panel
            title="Centres on the map"
            note="Green: verified and active (suggested to customers). Grey: not suggested. Red: a place customers asked for, with no verified centre yet."
            bodyless
          >
            {d.browser_key || ENV_KEY ? (
              <LiveMap data={d} />
            ) : (
              <div className="panel-b small muted">
                The interactive map needs a browser key: save it in Configuration, Maps (Maps JavaScript API, restricted to this site). Each centre below
                still opens in Google Maps.
              </div>
            )}
            {!d.maps_enabled && (
              <div className="panel-b small" style={{ color: "var(--warn)" }}>
                Google Maps is not set up on the server (Configuration, Maps): areas are not looked
                up, and centres need their point typed by hand.
              </div>
            )}
          </Panel>
          <Panel
            title="Places without a verified centre"
            note="From customer requests; most asked first"
            bodyless
          >
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Place</th>
                    <th>Requests</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.gaps.map((x) => (
                    <tr key={x.place}>
                      <td>{x.place}</td>
                      <td>{x.requests}</td>
                      <td className="small">
                        <a
                          href={searchLink(`hospitals near ${x.place}`)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          See what is there in Google Maps
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.gaps.length && <Empty>No open request for a place without a centre.</Empty>}
            </div>
          </Panel>
          {!!noPoint.length && (
            <Panel
              title="Centres without a point"
              note="They cannot be found by distance: open each one and use Find on map"
              bodyless
            >
              <div className="panel-b row" style={{ flexWrap: "wrap", gap: 6 }}>
                {noPoint.map((c) => (
                  <Pill key={c.id} tone="warn">
                    {c.name}
                    {c.city ? `, ${c.city}` : ""}
                  </Pill>
                ))}
              </div>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
