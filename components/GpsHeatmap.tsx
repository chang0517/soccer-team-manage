"use client";

import { useEffect, useRef } from "react";
import type { Heatmap, TrackPath } from "@/lib/gps/types";

// 구장 좌표(m)로 그려진 히트맵. x는 길이, y는 폭 방향이다.
// 선은 정규 규격(11인제) 비율로 그리되, 실제 구장 크기에 맞춰 늘려 그린다.

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const STOPS: [number, [number, number, number]][] = [
  [0, [37, 99, 235]],
  [0.35, [34, 197, 94]],
  [0.65, [250, 204, 21]],
  [1, [239, 68, 68]],
];

function colorAt(v: number): [number, number, number, number] {
  const t = Math.min(1, Math.max(0, v / 255));
  let i = 1;
  while (i < STOPS.length - 1 && t > STOPS[i][0]) i++;
  const [t0, c0] = STOPS[i - 1];
  const [t1, c1] = STOPS[i];
  const f = (t - t0) / (t1 - t0);
  const a = Math.min(1, t * 3) * 0.85;
  return [
    c0[0] + (c1[0] - c0[0]) * f,
    c0[1] + (c1[1] - c0[1]) * f,
    c0[2] + (c1[2] - c0[2]) * f,
    a * 255,
  ];
}

export function drawPitchLines(
  ctx: CanvasRenderingContext2D,
  L: number,
  W: number,
  scale: number
) {
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = Math.max(1, scale * 0.25);
  const s = (v: number) => v * scale;
  ctx.strokeRect(0, 0, s(L), s(W));
  ctx.beginPath();
  ctx.moveTo(s(L / 2), 0);
  ctx.lineTo(s(L / 2), s(W));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s(L / 2), s(W / 2), s(9.15), 0, Math.PI * 2);
  ctx.stroke();
  // 페널티 지역(16.5 x 40.32)과 골 에어리어(5.5 x 18.32), 양쪽 골문.
  for (const side of [0, 1]) {
    const dir = side === 0 ? 1 : -1;
    const x0 = side === 0 ? 0 : L;
    const box = (depth: number, width: number) => {
      ctx.strokeRect(s(side === 0 ? x0 : x0 - depth), s((W - width) / 2), s(depth), s(width));
    };
    box(16.5, 40.32);
    box(5.5, 18.32);
    ctx.beginPath();
    ctx.arc(s(x0 + dir * 11), s(W / 2), Math.max(1, scale * 0.3), 0, Math.PI * 2);
    ctx.stroke();
  }
}

export default function GpsHeatmap({
  heatmap,
  lengthM,
  widthM,
  path,
}: {
  heatmap: Heatmap;
  lengthM: number;
  widthM: number;
  path?: TrackPath | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth;
    const scale = (cssW * dpr) / lengthM;
    canvas.width = Math.round(lengthM * scale);
    canvas.height = Math.round(widthM * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#2f6b45";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 격자(heatmap.cols x rows)를 작은 캔버스에 칠한 뒤 부드럽게 늘려 그린다.
    const { cols, rows, data } = heatmap;
    const bytes = decode(data);
    const small = document.createElement("canvas");
    small.width = cols;
    small.height = rows;
    const sctx = small.getContext("2d");
    if (sctx) {
      const img = sctx.createImageData(cols, rows);
      for (let i = 0; i < cols * rows; i++) {
        const [r, g, b, a] = colorAt(bytes[i]);
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = a;
      }
      sctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(small, 0, 0, cols * heatmap.cellM * scale, rows * heatmap.cellM * scale);
    }

    if (path && path.length > 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = Math.max(1, scale * 0.12);
      ctx.beginPath();
      path.forEach(([, x, y], i) => {
        if (i === 0) ctx.moveTo(x * scale, y * scale);
        else ctx.lineTo(x * scale, y * scale);
      });
      ctx.stroke();
    }
    drawPitchLines(ctx, lengthM, widthM, scale);
  }, [heatmap, lengthM, widthM, path]);

  return (
    <canvas
      ref={ref}
      className="w-full rounded-2xl"
      style={{ aspectRatio: `${lengthM} / ${widthM}` }}
      aria-label="선수 히트맵"
    />
  );
}
