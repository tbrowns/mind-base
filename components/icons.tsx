import type { ReactNode, SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number;
};

function createIcon(children: ReactNode) {
  return function Icon({
    size = 24,
    strokeWidth = 2,
    className,
    ...props
  }: Props) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...props}
      >
        {children}
      </svg>
    );
  };
}

export const Network = createIcon(
  <>
    <circle cx="6" cy="7" r="2.5" />
    <circle cx="18" cy="7" r="2.5" />
    <circle cx="12" cy="18" r="2.5" />
    <path d="m8 8.5 3 7" />
    <path d="m16 8.5-3 7" />
    <path d="M8.5 7h7" />
  </>,
);

export const BrainCircuit = createIcon(
  <>
    <path d="M8.5 4.5a3 3 0 0 0-3 3v7.2a4.8 4.8 0 0 0 4.8 4.8H12V6.8a2.3 2.3 0 0 0-2.3-2.3Z" />
    <path d="M15.5 4.5a3 3 0 0 1 3 3v7.2a4.8 4.8 0 0 1-4.8 4.8H12V6.8a2.3 2.3 0 0 1 2.3-2.3Z" />
    <path d="M7.5 10.5H10" />
    <path d="M14 10.5h2.5" />
    <path d="M8 15h8" />
  </>,
);

export const FileText = createIcon(
  <>
    <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    <path d="M14 3.5V8h4" />
    <path d="M8 12h8" />
    <path d="M8 16h6" />
  </>,
);

export const LayoutDashboard = createIcon(
  <>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="5" rx="1.5" />
    <rect x="13" y="11" width="7" height="9" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
  </>,
);

export const Inbox = createIcon(
  <>
    <path d="M4 13.5 6.3 6h11.4L20 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
    <path d="M4 13.5h4l1.5 2h5l1.5-2h4" />
  </>,
);

export const CalendarRange = createIcon(
  <>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M4 10h16" />
    <path d="M8 14h3" />
    <path d="M13 17h3" />
  </>,
);

export const Settings = createIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.2" />
    <path d="M12 18.8V21" />
    <path d="m4.2 7.5 1.9 1.1" />
    <path d="m17.9 15.4 1.9 1.1" />
    <path d="m4.2 16.5 1.9-1.1" />
    <path d="m17.9 8.6 1.9-1.1" />
  </>,
);

export const Search = createIcon(
  <>
    <circle cx="11" cy="11" r="6" />
    <path d="m16 16 4 4" />
  </>,
);

export const UploadCloud = createIcon(
  <>
    <path d="M7 18.5H6a4 4 0 0 1-.5-8 6 6 0 0 1 11.6-1.6A4.8 4.8 0 0 1 17 18.5h-1" />
    <path d="M12 19V11" />
    <path d="m8.5 14.5 3.5-3.5 3.5 3.5" />
  </>,
);

export const Upload = UploadCloud;

export const Sparkles = createIcon(
  <>
    <path d="m12 3 1.3 4.1L17 8.5l-3.7 1.4L12 14l-1.3-4.1L7 8.5l3.7-1.4Z" />
    <path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z" />
    <path d="m5.5 13 .6 1.6 1.6.6-1.6.6-.6 1.7-.6-1.7-1.6-.6 1.6-.6Z" />
  </>,
);

export const MessageSquareText = createIcon(
  <>
    <path d="M5 5h14v10H8l-3 3Z" />
    <path d="M8 9h8" />
    <path d="M8 12h5" />
  </>,
);

export const Layers3 = createIcon(
  <>
    <path d="m12 3 8 4-8 4-8-4Z" />
    <path d="m4 12 8 4 8-4" />
    <path d="m4 17 8 4 8-4" />
  </>,
);

export const FilePlus2 = createIcon(
  <>
    <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    <path d="M14 3.5V8h4" />
    <path d="M12 11v6" />
    <path d="M9 14h6" />
  </>,
);

export const Mail = createIcon(
  <>
    <rect x="4" y="6" width="16" height="12" rx="2" />
    <path d="m4.5 7 7.5 6 7.5-6" />
  </>,
);

export const Database = createIcon(
  <>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
  </>,
);

export const Cloud = createIcon(
  <path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.2 1.8A3.2 3.2 0 0 0 7 18Z" />,
);

export const KeyRound = createIcon(
  <>
    <circle cx="8" cy="12" r="4" />
    <path d="M12 12h8" />
    <path d="M17 12v3" />
    <path d="M20 12v2" />
  </>,
);

export const ShieldCheck = createIcon(
  <>
    <path d="M12 3 19 6v5.5c0 4.2-2.7 7.4-7 9.5-4.3-2.1-7-5.3-7-9.5V6Z" />
    <path d="m8.8 12.5 2.1 2.1 4.3-5" />
  </>,
);

export const LockKeyhole = createIcon(
  <>
    <rect x="5" y="10" width="14" height="10" rx="2" />
    <path d="M8 10V8a4 4 0 0 1 8 0v2" />
    <path d="M12 14v2" />
  </>,
);

export const Clock3 = createIcon(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v5l3 1.5" />
  </>,
);

export const BookOpen = createIcon(
  <>
    <path d="M4 5.5A3.5 3.5 0 0 1 7.5 4H11v16H7.5A3.5 3.5 0 0 0 4 21.5Z" />
    <path d="M20 5.5A3.5 3.5 0 0 0 16.5 4H13v16h3.5a3.5 3.5 0 0 1 3.5 1.5Z" />
  </>,
);

export const FileSearch = createIcon(
  <>
    <path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    <path d="M14 3.5V8h4" />
    <circle cx="11" cy="14" r="2.5" />
    <path d="m13 16 2 2" />
  </>,
);

export const Trash2 = createIcon(
  <>
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6 7l1 14h10l1-14" />
    <path d="M9 7V4h6v3" />
  </>,
);

export const RefreshCw = createIcon(
  <>
    <path d="M20 6v5h-5" />
    <path d="M4 18v-5h5" />
    <path d="M18 11a6 6 0 0 0-10-4.5L4 10" />
    <path d="M6 13a6 6 0 0 0 10 4.5L20 14" />
  </>,
);

export const CircleSlash = createIcon(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="m7 17 10-10" />
  </>,
);

export const CheckCircle2 = createIcon(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="m8.5 12.5 2.2 2.2 4.8-5.4" />
  </>,
);

export const TriangleAlert = createIcon(
  <>
    <path d="M12 4 21 20H3Z" />
    <path d="M12 9v5" />
    <path d="M12 17h.01" />
  </>,
);

export const AlertCircle = createIcon(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v5" />
    <path d="M12 16h.01" />
  </>,
);

export const LoaderCircle = createIcon(
  <>
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
    <path d="M21 4v8h-8" />
  </>,
);

export const Menu = createIcon(
  <>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h16" />
  </>,
);

export const X = createIcon(
  <>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </>,
);

export const ChevronDown = createIcon(<path d="m6 9 6 6 6-6" />);
export const ChevronRight = createIcon(<path d="m9 6 6 6-6 6" />);
export const ArrowRight = createIcon(
  <>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </>,
);
export const ArrowUp = createIcon(
  <>
    <path d="M12 19V5" />
    <path d="m6 11 6-6 6 6" />
  </>,
);
export const Check = createIcon(<path d="m5 12 4 4L19 6" />);
export const Plus = createIcon(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>,
);
