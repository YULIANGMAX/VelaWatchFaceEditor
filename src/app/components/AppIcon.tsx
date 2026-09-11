import React from "react";

export interface AppIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

export function AppIcon({ size = 32, className = "", style, ...props }: AppIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label="Vela Watch Face Editor Icon"
      {...props}
    >
      <defs>
        <linearGradient id="v-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1c242d" />
          <stop offset="50%" stopColor="#141a21" />
          <stop offset="100%" stopColor="#0a0d11" />
        </linearGradient>

        <linearGradient id="v-arc" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#ff7a59" />
        </linearGradient>

        <linearGradient id="v-left-arm" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>

        <linearGradient id="v-right-arm" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff8e6e" />
          <stop offset="100%" stopColor="#df5a38" />
        </linearGradient>

        <filter id="v-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.6" />
        </filter>
      </defs>

      {/* 基础 Squircle 表壳/背景 */}
      <rect width="128" height="128" rx="30" fill="url(#v-bg)" stroke="#2d3744" strokeWidth="2" />

      {/* 精密表盘内刻度外圈 */}
      <circle cx="64" cy="64" r="46" fill="none" stroke="#25303c" strokeWidth="1.5" strokeDasharray="2 6" />

      {/* 编辑器设计弧光 / 动量弧线 (Top-Right Arc) */}
      <path d="M 64 18 A 46 46 0 0 1 110 64" fill="none" stroke="url(#v-arc)" strokeWidth="3.5" strokeLinecap="round" />

      {/* 4 个主刻度点 */}
      <rect x="62.5" y="21" width="3" height="7" rx="1.5" fill="#38bdf8" />
      <rect x="100" y="62.5" width="7" height="3" rx="1.5" fill="#ff7a59" />
      <rect x="62.5" y="100" width="3" height="7" rx="1.5" fill="#2dd4bf" />
      <rect x="21" y="62.5" width="7" height="3" rx="1.5" fill="#38bdf8" />

      {/* 8 个精密副刻度点 */}
      <circle cx="87" cy="27" r="1.5" fill="#4b5563" />
      <circle cx="101" cy="41" r="1.5" fill="#4b5563" />
      <circle cx="101" cy="87" r="1.5" fill="#4b5563" />
      <circle cx="87" cy="101" r="1.5" fill="#4b5563" />
      <circle cx="41" cy="101" r="1.5" fill="#4b5563" />
      <circle cx="27" cy="87" r="1.5" fill="#4b5563" />
      <circle cx="27" cy="41" r="1.5" fill="#4b5563" />
      <circle cx="41" cy="27" r="1.5" fill="#4b5563" />

      {/* 核心 "V" 标志 / 时钟双指针 */}
      {/* 左指针：时针（指向10点方向） */}
      <polygon points="64,72 58,67 36,36 43,32 64,65" fill="url(#v-left-arm)" filter="url(#v-shadow)" />

      {/* 右指针：分针（指向2点方向，更长更锐利） */}
      <polygon points="64,72 64,65 91,26 98,30 68,70" fill="url(#v-right-arm)" filter="url(#v-shadow)" />

      {/* 精密同心表针轴心 (Center Pin) */}
      <circle cx="64" cy="69" r="8" fill="#111822" stroke="#e2e8f0" strokeWidth="2.5" filter="url(#v-shadow)" />
      <circle cx="64" cy="69" r="3.5" fill="#ff7a59" />
    </svg>
  );
}
