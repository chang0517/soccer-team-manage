"use client";

// 한 경기에서 선수들의 평균 위치를 한 구장 위에 찍어 보여준다.
// 모든 선수가 같은 구장 틀(등록한 구장)로 분석됐을 때만 의미가 있다.

export type TeamDot = { id: number; label: string; x: number; y: number };

export default function GpsTeamMap({
  dots,
  lengthM,
  widthM,
}: {
  dots: TeamDot[];
  lengthM: number;
  widthM: number;
}) {
  const L = lengthM;
  const W = widthM;
  return (
    <svg viewBox={`-2 -2 ${L + 4} ${W + 4}`} className="w-full rounded-2xl" role="img" aria-label="팀 평균 위치">
      <rect x={-2} y={-2} width={L + 4} height={W + 4} fill="#2f6b45" />
      <g fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={0.3}>
        <rect x={0} y={0} width={L} height={W} />
        <line x1={L / 2} y1={0} x2={L / 2} y2={W} />
        <circle cx={L / 2} cy={W / 2} r={9.15} />
        <rect x={0} y={(W - 40.32) / 2} width={16.5} height={40.32} />
        <rect x={L - 16.5} y={(W - 40.32) / 2} width={16.5} height={40.32} />
        <rect x={0} y={(W - 18.32) / 2} width={5.5} height={18.32} />
        <rect x={L - 5.5} y={(W - 18.32) / 2} width={5.5} height={18.32} />
      </g>
      {dots.map((d) => (
        <g key={d.id}>
          <circle cx={d.x} cy={d.y} r={2.4} fill="#1d4ed8" stroke="#fff" strokeWidth={0.5} />
          <text x={d.x} y={d.y + 5.6} textAnchor="middle" fontSize={3.4} fontWeight={700} fill="#fff">
            {d.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
