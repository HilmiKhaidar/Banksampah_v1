import type { SVGProps } from "react";

export type AppIconName =
  | "home"
  | "deposit"
  | "students"
  | "waste"
  | "transactions"
  | "balance"
  | "withdrawal"
  | "report"
  | "notification"
  | "profile"
  | "settings"
  | "contact"
  | "help"
  | "eye"
  | "eye-off";

const paths: Record<AppIconName, string[]> = {
  home: ["M3 10.5 12 3l9 7.5", "M5.5 9.5V21h13V9.5", "M9.5 21v-6h5v6"],
  deposit: ["M12 5v14", "m6 13 6 6 6-6", "M5 5h14"],
  students: ["M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20", "M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M17 7.5a3 3 0 0 1 0 5.8", "M21 20v-1.5a4 4 0 0 0-3-3.85"],
  waste: ["M7 7h10", "M9 7V4h6v3", "m6 7 1 14h10l1-14", "M10 11v6", "M14 11v6"],
  transactions: ["M5 7h14", "m15 3 4 4-4 4", "M19 17H5", "l4-4 4 4"],
  balance: ["M4 7.5h16v11H4z", "M4 10h16", "M16 15h1"],
  withdrawal: ["M5 7h14", "m15 3 4 4-4 4", "M19 17H5", "m9 13-4 4 4 4"],
  report: ["M5 4h14v17H5z", "M8 16v-3", "M12 16V9", "M16 16v-5"],
  notification: ["M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9", "M10 21h4"],
  profile: ["M20 21a8 8 0 0 0-16 0", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"],
  settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 1.7-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20h-2.4v-.2a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.7-1.7.06-.06A1.7 1.7 0 0 0 8.4 15a1.7 1.7 0 0 0-1.56-1.03H6v-2.4h.84A1.7 1.7 0 0 0 8.4 10a1.7 1.7 0 0 0-.34-1.88L8 8.06l1.7-1.7.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 12.67 5.2V5h2.4v.2a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.7 1.7-.06.06A1.7 1.7 0 0 0 19.4 10a1.7 1.7 0 0 0 1.56 1.03h.04v2.4h-.04A1.7 1.7 0 0 0 19.4 15Z"],
  contact: ["M4 5h16v11H8l-4 4V5Z", "M8 9h8", "M8 12h5"],
  help: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M9.7 9a2.4 2.4 0 1 1 4.1 1.7c-1 .9-1.8 1.3-1.8 2.8", "M12 17h.01"],
  eye: ["M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z", "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"],
  "eye-off": ["m3 3 18 18", "M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17.6 17.6 0 0 1-3.2 3.8", "M6.3 6.3C3.6 8.2 2.5 12 2.5 12s3.5 6 9.5 6a9.6 9.6 0 0 0 3.1-.5", "M9.9 9.9a3 3 0 0 0 4.2 4.2"],
};

export default function AppIcon({
  name,
  size = 20,
  ...props
}: { name: AppIconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {paths[name].map((path, index) => <path d={path} key={`${name}-${index}`} />)}
    </svg>
  );
}
