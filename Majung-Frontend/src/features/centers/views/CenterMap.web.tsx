// 웹 실지도 — Google Maps JS API. 마커 클릭 시 이름·전화·운영시간 정보창.
// 키(EXPO_PUBLIC_GOOGLE_MAPS_KEY)는 클라이언트 노출 전제 → 리퍼러 제한이 방어막.
import { useEffect, useRef } from "react";
import { View } from "react-native";

import type { Center } from "@/shared/types";

import { MapFallbackPanel } from "./MapFallbackPanel";

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;

// 사용하는 google.maps 부분만 최소 타입 선언 (any 회피, @types 의존성 없이).
interface GLatLng {
  lat: number;
  lng: number;
}
interface GMap {
  setCenter(p: GLatLng): void;
}
interface GMarker {
  addListener(event: string, cb: () => void): void;
}
interface GInfoWindow {
  setContent(html: string): void;
  open(map: GMap, anchor: GMarker): void;
}
interface GMaps {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  InfoWindow: new () => GInfoWindow;
}
declare global {
  interface Window {
    google?: { maps: GMaps };
  }
}

let loader: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY ?? ""}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google Maps 로드 실패"));
    document.head.appendChild(s);
  });
  return loader;
}

export function CenterMap({ centers }: { centers: Center[] }) {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (!KEY) return;
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled) return;
        const node = ref.current as unknown as HTMLElement | null;
        const maps = window.google?.maps;
        if (!node || !maps) return;
        const first = centers[0];
        const map = new maps.Map(node, {
          center: first ? { lat: first.lat, lng: first.lng } : { lat: 37.55, lng: 126.93 },
          zoom: 12,
          disableDefaultUI: true,
          clickableIcons: false,
        });
        const info = new maps.InfoWindow();
        for (const c of centers) {
          const marker = new maps.Marker({
            position: { lat: c.lat, lng: c.lng },
            map,
            title: c.name,
          });
          marker.addListener("click", () => {
            info.setContent(
              `<div style="font-size:13px;line-height:1.5"><b>${c.name}</b><br/>${c.phone}<br/>${c.hours}</div>`,
            );
            info.open(map, marker);
          });
        }
      })
      .catch(() => {
        // 로드 실패 시 빈 패널 — 아래 목록으로 충분
      });
    return () => {
      cancelled = true;
    };
  }, [centers]);

  if (!KEY) return <MapFallbackPanel />;
  return (
    <View
      ref={ref}
      className="h-44 overflow-hidden rounded-2xl border border-line bg-line lg:h-[420px]"
    />
  );
}
