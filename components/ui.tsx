import { LoaderCircle } from "@/components/icons";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && (
          <p className="mb-2 text-[11px] font-black uppercase text-[#0aa37f]">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-black text-[#101b18] md:text-[38px]">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60756c]">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <LoaderCircle size={size} className="animate-spin" />;
}

export function Badge({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: "green" | "gold" | "gray";
}) {
  const classes =
    tone === "green"
      ? "bg-[#def8ef] text-[#08735f]"
      : tone === "gold"
        ? "bg-[#fff0ed] text-[#b53d31]"
        : "bg-[#e9f2ee] text-[#536b62]";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${classes}`}
    >
      {children}
    </span>
  );
}
