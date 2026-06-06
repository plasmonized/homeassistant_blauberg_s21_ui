import { useState } from "react";
import { Register } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Thermometer } from "lucide-react";
import houseImg from "@assets/AISelect_20260529_183307(1)_1780726688481.jpg";

interface TemperatureDiagramProps {
  registers: Register[] | undefined;
  isLoading: boolean;
}

export function TemperatureDiagram({ registers, isLoading }: TemperatureDiagramProps) {
  const [imgLoaded, setImgLoaded] = useState(false);

  if (isLoading) {
    return (
      <Card className="p-6 border-border/40">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-80 w-full" />
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
    <Card className="p-4 border-border/40 bg-card/50">
      <div className="flex items-center gap-2 mb-3">
        <Thermometer className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Aktuelle Temperatur</h3>
      </div>

      <div className="relative w-full max-w-[600px] mx-auto">
        {/* House image */}
        <img
          src={houseImg}
          alt="Haus mit Wärmetauscher"
          className="w-full h-auto rounded-lg"
          onLoad={() => setImgLoaded(true)}
          style={{ visibility: imgLoaded ? "visible" : "hidden" }}
        />
        {!imgLoaded && (
          <Skeleton className="absolute inset-0 w-full h-full rounded-lg" />
        )}

        {/* Temperature overlays — aligned directly on the four horizontal arrows */}
        {/* Top-left arrow: Outdoor (Außenluft) coming from outside → right-pointing */}
        <div className="absolute top-[58%] left-[0%] translate-y-[-50%]">
          <div className="bg-transparent px-2 py-1">
            <div className="text-[10px] text-muted-foreground leading-none">Außenluft</div>
            <div className="text-sm font-bold font-mono text-blue-400">
              {getValue(outdoorReg)} °C
            </div>
          </div>
        </div>

        {/* Top-right arrow: Extract (Abluft) going out of the house → left-pointing */}
        <div className="absolute top-[58%] right-[30%] translate-y-[-50%]">
          <div className="bg-transparent px-2 py-1">
            <div className="text-[10px] text-muted-foreground leading-none">Abluft</div>
            <div className="text-sm font-bold font-mono text-red-400">
              {getValue(extractReg)} °C
            </div>
          </div>
        </div>

        {/* Bottom-left arrow: Exhaust (Fortluft) going outside → left-pointing */}
        <div className="absolute top-[76%] left-[0%] translate-y-[-50%]">
          <div className="bg-transparent px-2 py-1">
            <div className="text-[10px] text-muted-foreground leading-none">Fortluft</div>
            <div className="text-sm font-bold font-mono text-orange-400">
              {getValue(exhaustReg)} °C
            </div>
          </div>
        </div>

        {/* Bottom-right arrow: Supply (Zuluft) entering the house → right-pointing */}
        <div className="absolute top-[76%] right-[30%] translate-y-[-50%]">
          <div className="bg-transparent px-2 py-1">
            <div className="text-[10px] text-muted-foreground leading-none">Zuluft</div>
            <div className="text-sm font-bold font-mono text-green-400">
              {getValue(supplyReg)} °C
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
