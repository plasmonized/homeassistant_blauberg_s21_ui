import { useState } from "react";
import { Register } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Thermometer } from "lucide-react";
import houseImg from "@assets/AISelect_20260529_183307_1780072475244.jpg";

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

        {/* Temperature overlays - positioned absolutely over the image */}
        {/* Top-left: Outdoor */}
        <div className="absolute top-[35%] left-[2%] sm:top-[38%] sm:left-[5%]">
          <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-2 py-1 shadow-lg">
            <div className="text-[10px] text-muted-foreground leading-none">Außenluft</div>
            <div className="text-sm font-bold font-mono text-blue-400">
              {getValue(outdoorReg)} °C
            </div>
          </div>
        </div>

        {/* Top-right: Supply */}
        <div className="absolute top-[35%] right-[2%] sm:top-[38%] sm:right-[5%]">
          <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-2 py-1 shadow-lg">
            <div className="text-[10px] text-muted-foreground leading-none">Zuluft</div>
            <div className="text-sm font-bold font-mono text-green-400">
              {getValue(supplyReg)} °C
            </div>
          </div>
        </div>

        {/* Bottom-left: Exhaust */}
        <div className="absolute bottom-[28%] left-[2%] sm:bottom-[30%] sm:left-[5%]">
          <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-2 py-1 shadow-lg">
            <div className="text-[10px] text-muted-foreground leading-none">Fortluft</div>
            <div className="text-sm font-bold font-mono text-orange-400">
              {getValue(exhaustReg)} °C
            </div>
          </div>
        </div>

        {/* Bottom-right: Extract */}
        <div className="absolute bottom-[28%] right-[2%] sm:bottom-[30%] sm:right-[5%]">
          <div className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg px-2 py-1 shadow-lg">
            <div className="text-[10px] text-muted-foreground leading-none">Abluft</div>
            <div className="text-sm font-bold font-mono text-red-400">
              {getValue(extractReg)} °C
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
