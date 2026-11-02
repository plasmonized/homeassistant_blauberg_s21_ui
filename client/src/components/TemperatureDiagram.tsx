import { useState } from "react";
import { Register } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import houseImg from "@/assets/ventilation-diagram.jpg";

interface TemperatureDiagramProps {
  registers: Register[] | undefined;
  isLoading: boolean;
}

export function TemperatureDiagram({ registers, isLoading }: TemperatureDiagramProps) {
  const [imgLoaded, setImgLoaded] = useState(false);

  if (isLoading) {
    return (
      <Card className="w-full border-border/40 bg-card/50 p-3 sm:p-4">
        <Skeleton className="aspect-[1.55/1] w-full" />
      </Card>
    );
  }

  // Find the four temperature registers by name
  const outdoorReg = registers?.find((r) => r.name.includes("Outdoor"));
  const supplyReg = registers?.find((r) => r.name.includes("Supply"));
  const extractReg = registers?.find((r) => r.name.includes("Extract"));
  const exhaustReg = registers?.find((r) => r.name.includes("Exhaust"));

  const getValue = (reg: Register | undefined) => {
    if (!reg || reg.lastValue === null) return "--";
    return reg.lastValue;
  };

  return (
    <Card className="w-full border-border/40 bg-card/50 p-2 sm:p-3">
      <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-lg">
        {/* The original artwork also contains a title. Crop only that top
            margin; keep the image and temperature overlays in one coordinate system. */}
        <div className="relative" style={{ marginTop: "calc(-10% - 2mm)", marginBottom: "-5mm" }}>
        {/* House image */}
        <img
          src={houseImg}
          alt="Haus mit Wärmetauscher"
          data-testid="temperature-diagram-image"
          className="block h-auto w-full rounded-lg"
          onLoad={() => setImgLoaded(true)}
          style={{ visibility: imgLoaded ? "visible" : "hidden" }}
        />
        {!imgLoaded && (
          <Skeleton className="absolute inset-0 w-full h-full rounded-lg" />
        )}

        {/* Temperature overlays — aligned directly on the four horizontal arrows */}
        {/* Top-left arrow: Outdoor (Außenluft) coming from outside → right-pointing */}
        <div className="absolute top-[58%] left-[0%] translate-y-[-50%]">
          <div className="px-1 py-0.5 sm:px-2 sm:py-1">
            <div className="text-[8px] leading-none text-slate-700 sm:text-[10px] dark:text-slate-700">Außenluft</div>
            <div className="font-mono text-[11px] font-bold text-blue-500 sm:text-sm dark:text-blue-400">
              {getValue(outdoorReg)} °C
            </div>
          </div>
        </div>

        {/* Top-right arrow: Extract (Abluft) going out of the house → left-pointing */}
        <div className="absolute top-[58%] left-[59%] translate-y-[-50%]">
          <div className="px-1 py-0.5 sm:px-2 sm:py-1">
            <div className="text-[8px] leading-none text-slate-700 sm:text-[10px] dark:text-slate-700">Abluft</div>
            <div className="font-mono text-[11px] font-bold text-red-500 sm:text-sm dark:text-red-400">
              {getValue(extractReg)} °C
            </div>
          </div>
        </div>

        {/* Bottom-left arrow: Exhaust (Fortluft) going outside → left-pointing */}
        <div className="absolute top-[76%] left-[0%] translate-y-[-50%]">
          <div className="px-1 py-0.5 sm:px-2 sm:py-1">
            <div className="text-[8px] leading-none text-slate-700 sm:text-[10px] dark:text-slate-700">Fortluft</div>
            <div className="font-mono text-[11px] font-bold text-orange-500 sm:text-sm dark:text-orange-400">
              {getValue(exhaustReg)} °C
            </div>
          </div>
        </div>

        {/* Bottom-right arrow: Supply (Zuluft) entering the house → right-pointing */}
        <div className="absolute top-[76%] left-[59%] translate-y-[-50%]">
          <div className="px-1 py-0.5 sm:px-2 sm:py-1">
            <div className="text-[8px] leading-none text-slate-700 sm:text-[10px] dark:text-slate-700">Zuluft</div>
            <div className="font-mono text-[11px] font-bold text-green-600 sm:text-sm dark:text-green-400">
              {getValue(supplyReg)} °C
            </div>
          </div>
        </div>
        </div>
      </div>
    </Card>
  );
}
