import { Link } from 'react-router-dom';

function FolderIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="folderGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5CB8FF" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="folderTabGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>
      </defs>
      <path d="M4 14C4 11.79 5.79 10 8 10H18L22 14H40C42.21 14 44 15.79 44 18V38C44 40.21 42.21 42 40 42H8C5.79 42 4 40.21 4 38V14Z" fill="url(#folderGrad)" />
      <path d="M4 14C4 11.79 5.79 10 8 10H18L22 14H4V14Z" fill="url(#folderTabGrad)" />
      <path d="M4 18H44V38C44 40.21 42.21 42 40 42H8C5.79 42 4 40.21 4 38V18Z" fill="url(#folderGrad)" opacity="0.85" />
    </svg>
  );
}

function AudioFileIcon({ size = 48 }: { size?: number }) {
  const w = size;
  const h = size;
  return (
    <svg width={w} height={h} viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="audioDocGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FAFAFA" />
          <stop offset="100%" stopColor="#E4E4E7" />
        </linearGradient>
        <linearGradient id="audioDocFold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#D4D4D8" />
          <stop offset="100%" stopColor="#A1A1AA" />
        </linearGradient>
        <filter id="audioDocShadow" x="-4" y="-2" width="56" height="64" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.15" />
        </filter>
      </defs>
      {/* Document body */}
      <g filter="url(#audioDocShadow)">
        <path d="M6 6C6 3.79 7.79 2 10 2H30L42 14V50C42 52.21 40.21 54 38 54H10C7.79 54 6 52.21 6 50V6Z" fill="url(#audioDocGrad)" />
      </g>
      {/* Dog-ear fold */}
      <path d="M30 2L42 14H34C31.79 14 30 12.21 30 10V2Z" fill="url(#audioDocFold)" />
      {/* Waveform bars */}
      <rect x="14" y="28" width="3" height="12" rx="1.5" fill="#7C3AED" opacity="0.8" />
      <rect x="19.5" y="24" width="3" height="20" rx="1.5" fill="#7C3AED" opacity="0.9" />
      <rect x="25" y="26" width="3" height="16" rx="1.5" fill="#7C3AED" opacity="0.85" />
      <rect x="30.5" y="30" width="3" height="8" rx="1.5" fill="#7C3AED" opacity="0.7" />
    </svg>
  );
}

export interface FileCardProps {
  to: string;
  icon: 'folder' | 'audio';
  label: string;
}

export function FileCard({ to, icon, label }: FileCardProps) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center gap-1.5 py-3 px-2 rounded-md no-underline text-inherit hover:bg-hover transition-colors"
    >
      <div className="shrink-0 transition-transform group-hover:scale-105">
        {icon === 'folder' ? <FolderIcon /> : <AudioFileIcon />}
      </div>
      <span className="text-[11px] font-medium text-text text-center truncate max-w-full group-hover:text-accent transition-colors leading-tight">
        {label}
      </span>
    </Link>
  );
}
