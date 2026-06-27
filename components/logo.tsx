import { Network } from "@/components/icons";
export function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#0f3d2e] text-white shadow-sm"><Network size={20} /></span>{!compact && <div><div className="text-[15px] font-semibold tracking-tight text-[#17211c]">Kuzana Brain</div><div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#21a67a]">Lite</div></div>}</div>;
}
