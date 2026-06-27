import { Network } from "@/components/icons";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="relative grid size-10 place-items-center overflow-hidden rounded-2xl bg-[#0a3f37] text-[#d4fff4] shadow-[0_12px_24px_rgba(6,56,48,.18)]">
        <span className="absolute inset-x-1 top-1 h-px bg-[#78f4d4]" />
        <Network size={20} strokeWidth={1.9} />
      </span>
      {!compact && (
        <div>
          <div className="text-[16px] font-black text-[#101b18]">
            mindbase
          </div>
          <div className="text-[10px] font-bold uppercase text-[#0aa37f]">
            Knowledge OS
          </div>
        </div>
      )}
    </div>
  );
}
