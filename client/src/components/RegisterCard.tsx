import { useState } from "react";
import { Register } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Save, Trash2, Edit2, X, Gauge, Zap, ToggleLeft,
  Activity, Fan, Rocket, Thermometer, Wind, Droplets, Sun, Snowflake, Home,
  RotateCcw, ChevronUp, ChevronDown, Minus, Plus,
} from "lucide-react";
import { useWriteRegister, useDeleteRegister } from "@/hooks/use-registers";
import { cn } from "@/lib/utils";

interface RegisterCardProps {
  register: Register;
  deviceId: number;
}

// Register type detection helpers
const isFanSpeed = (reg: Register) =>
  reg.name.toLowerCase().includes("fan") && reg.name.toLowerCase().includes("speed");
const isSystemPower = (reg: Register) =>
  reg.name.toLowerCase().includes("system") && reg.dataType === "bool";
const isOperationMode = (reg: Register) =>
  reg.name.toLowerCase().includes("operation") && reg.name.toLowerCase().includes("mode");
const isBypass = (reg: Register) =>
  reg.name.toLowerCase().includes("bypass");
const isBoost = (reg: Register) =>
  reg.name.toLowerCase().includes("boost");
const isTemperatureSetpoint = (reg: Register) =>
  reg.name.toLowerCase().includes("temperature") && reg.name.toLowerCase().includes("setpoint");
const isTemperature = (reg: Register) =>
  reg.name.toLowerCase().includes("temperature") && !reg.name.toLowerCase().includes("supply");
const isHumidity = (reg: Register) =>
  reg.name.toLowerCase().includes("humidity");
const isCO2 = (reg: Register) =>
  reg.name.toLowerCase().includes("co2");

export function RegisterCard({ register, deviceId }: RegisterCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const writeMutation = useWriteRegister();
  const deleteMutation = useDeleteRegister();

  const isWritable = register.isWritable;
  const displayValue = register.lastValue !== null ? register.lastValue : "--";
  const isBool = register.dataType === "bool";
  const isEnum = register.dataType === "enum";
  const isNumber = register.dataType === "uint16" || register.dataType === "int16";
  const boolValue = displayValue === "true" || displayValue === "1" || displayValue === "on";
  const numValue = parseFloat(displayValue);

  const enumOptions = isEnum && register.options && typeof register.options === "object"
    ? (register.options as Record<string, string>)
    : null;

  const enumLabel = enumOptions ? (enumOptions[displayValue] ?? displayValue) : displayValue;

  // Handle writes
  const handleWrite = (value: number | boolean | string) => {
    if (!isWritable) return;
    writeMutation.mutate({ id: register.id, value, deviceId });
  };

  const handleSwitchChange = (checked: boolean) => {
    handleWrite(checked);
  };

  const handleFanSpeed = (speed: number) => {
    handleWrite(speed);
  };

  const handleSliderChange = (value: number[]) => {
    handleWrite(value[0]);
  };

  const handleDelete = () => {
    if (confirm("Dieses Register wirklich entfernen?")) {
      deleteMutation.mutate({ id: register.id, deviceId });
    }
  };

  // Icon selection
  const getIcon = () => {
    if (isFanSpeed(register)) return <Fan className="w-4 h-4 text-blue-500" />;
    if (isSystemPower(register)) return <Zap className="w-4 h-4 text-yellow-500" />;
    if (isBoost(register)) return <Rocket className="w-4 h-4 text-purple-500" />;
    if (isOperationMode(register)) return <Home className="w-4 h-4 text-emerald-500" />;
    if (isBypass(register)) return <ChevronUp className="w-4 h-4 text-cyan-500" />;
    if (isTemperature(register)) return <Thermometer className="w-4 h-4 text-red-500" />;
    if (isHumidity(register)) return <Droplets className="w-4 h-4 text-sky-500" />;
    if (isCO2(register)) return <Wind className="w-4 h-4 text-slate-500" />;
    switch (register.type) {
      case "coil": return <Zap className="w-4 h-4 text-yellow-500" />;
      case "discrete": return <ToggleLeft className="w-4 h-4 text-blue-500" />;
      case "input": return <Gauge className="w-4 h-4 text-purple-500" />;
      default: return <Activity className="w-4 h-4 text-emerald-500" />;
    }
  };

  // Get clean register name
  const getCleanName = () => {
    return register.name
      .replace(/\s*\(.*?\)/g, "")
      .replace(/\s*-\s*/g, " ")
      .trim();
  };

  // Render different control UIs based on register type
  const renderControl = () => {
    // System On/Off - Big toggle
    if (isSystemPower(register) && isBool) {
      return (
        <div className="flex items-center gap-3">
          <Switch
            checked={boolValue}
            onCheckedChange={handleSwitchChange}
            disabled={writeMutation.isPending || !isWritable}
            className="data-[state=checked]:bg-green-500"
            data-testid={`switch-system-power-${register.id}`}
          />
          <div className="flex flex-col">
            <span className={cn("text-sm font-bold", boolValue ? "text-green-600" : "text-muted-foreground")}>
              {boolValue ? "EIN" : "AUS"}
            </span>
            <span className="text-xs text-muted-foreground">
              {boolValue ? "System läuft" : "System gestoppt"}
            </span>
          </div>
        </div>
      );
    }

    // Boost Switch (coil) - enables the hardware boost-switch input on the unit.
    if (isBoost(register) && isBool) {
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <Switch
              checked={boolValue}
              onCheckedChange={handleSwitchChange}
              disabled={writeMutation.isPending || !isWritable}
              data-testid={`switch-boost-${register.id}`}
            />
            <span className={cn("text-sm font-bold", boolValue ? "text-purple-600" : "text-muted-foreground")}>
              {boolValue ? "EIN" : "AUS"}
            </span>
          </div>
          {isWritable && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Aktiviert den Hardware-Boost-Schalter-Eingang am Gerät.
            </p>
          )}
        </div>
      );
    }

    // Fan Speed - Segmented control (Stufe 1-5; "Aus" über den System-Schalter)
    if (isFanSpeed(register) && isNumber) {
      const currentSpeed = !isNaN(numValue) ? numValue : 0;
      const speeds = [1, 2, 3, 4, 5];
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Fan className="w-5 h-5 text-blue-400" />
            <span className="text-2xl font-bold font-mono">{currentSpeed >= 1 ? currentSpeed : "–"}</span>
            <span className="text-xs text-muted-foreground">/ 5</span>
          </div>
          <div className="flex gap-1">
            {speeds.map((value) => (
              <Button
                key={value}
                variant={currentSpeed === value ? "default" : "outline"}
                size="sm"
                className={cn(
                  "flex-1 h-10 text-sm font-semibold",
                  currentSpeed === value && "bg-primary text-primary-foreground"
                )}
                onClick={() => handleFanSpeed(value)}
                disabled={writeMutation.isPending || !isWritable}
                data-testid={`button-fan-speed-${value}-${register.id}`}
              >
                {value}
              </Button>
            ))}
          </div>
        </div>
      );
    }

    // Operation Mode - Big tiles
    if (isOperationMode(register) && isEnum && enumOptions) {
      const modeIcons: Record<string, any> = {
        "0": <Wind className="w-5 h-5" />,
        "1": <Sun className="w-5 h-5" />,
        "2": <Snowflake className="w-5 h-5" />,
        "3": <Home className="w-5 h-5" />,
      };
      const modeColors: Record<string, string> = {
        "0": "bg-sky-50 border-sky-200 text-sky-700",
        "1": "bg-amber-50 border-amber-200 text-amber-700",
        "2": "bg-cyan-50 border-cyan-200 text-cyan-700",
        "3": "bg-emerald-50 border-emerald-200 text-emerald-700",
      };
      return (
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(enumOptions).map(([key, label]) => {
            const active = displayValue === key;
            return (
              <Button
                key={key}
                variant="outline"
                className={cn(
                  "h-14 flex flex-col items-center gap-1 text-xs font-medium border-2 transition-all",
                  active ? modeColors[key] || "bg-primary/10 border-primary text-primary" : "hover:bg-muted/50"
                )}
                onClick={() => handleWrite(Number(key))}
                disabled={writeMutation.isPending || !isWritable}
                data-testid={`button-mode-${key}-${register.id}`}
              >
                {modeIcons[key] || <Activity className="w-5 h-5" />}
                <span>{label}</span>
              </Button>
            );
          })}
        </div>
      );
    }

    // Bypass Control - 3-state enum (Auto / Offen / Geschlossen)
    if (isBypass(register) && isEnum && enumOptions) {
      const bypassIcons: Record<string, any> = {
        "0": <ChevronDown className="w-4 h-4" />,
        "1": <ChevronUp className="w-4 h-4" />,
        "2": <RotateCcw className="w-4 h-4" />,
      };
      return (
        <div className="grid grid-cols-3 gap-1 w-full">
          {Object.entries(enumOptions).map(([key, label]) => {
            const active = displayValue === key;
            return (
              <Button
                key={key}
                variant={active ? "default" : "outline"}
                size="sm"
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2 px-1",
                  active && "bg-primary text-primary-foreground"
                )}
                onClick={() => handleWrite(Number(key))}
                disabled={writeMutation.isPending || !isWritable}
                data-testid={`button-bypass-${key}-${register.id}`}
              >
                {bypassIcons[key] || <ChevronUp className="w-4 h-4" />}
                <span className="text-[10px] leading-tight text-center">{label as string}</span>
              </Button>
            );
          })}
        </div>
      );
    }

    // Bypass Control - legacy binary fallback (non-enum devices)
    if (isBypass(register)) {
      const bypassOn = isBool ? boolValue : (numValue === 1 || displayValue === "1");
      const handleBypassToggle = (checked: boolean) => {
        if (isBool) {
          handleSwitchChange(checked);
        } else {
          handleWrite(checked ? 1 : 0);
        }
      };
      return (
        <div className="flex items-center gap-3">
          <Switch
            checked={bypassOn}
            onCheckedChange={handleBypassToggle}
            disabled={writeMutation.isPending || !isWritable}
            data-testid={`switch-bypass-${register.id}`}
          />
          <span className={cn("text-sm font-medium", bypassOn ? "text-cyan-500" : "text-muted-foreground")}>
            {bypassOn ? "EIN" : "AUS"}
          </span>
        </div>
      );
    }

    // Temperature Setpoint - stepper + slider (15-30°C)
    if (isTemperatureSetpoint(register) && isNumber) {
      const minTemp = 15;
      const maxTemp = 30;
      const rawCurrent = !isNaN(numValue) ? numValue : 21;
      const current = Math.min(maxTemp, Math.max(minTemp, rawCurrent));
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Thermometer className="w-5 h-5 text-red-400" />
            <span className="text-2xl font-bold font-mono tabular-nums">{current}</span>
            <span className="text-xs text-muted-foreground">°C</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              className="h-10 w-10 shrink-0"
              onClick={() => handleWrite(Math.max(minTemp, current - 1))}
              disabled={writeMutation.isPending || !isWritable || current <= minTemp}
              data-testid={`button-setpoint-dec-${register.id}`}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Slider
              value={[current]}
              min={minTemp}
              max={maxTemp}
              step={1}
              onValueChange={handleSliderChange}
              disabled={writeMutation.isPending || !isWritable}
              className="flex-1"
              data-testid={`slider-setpoint-${register.id}`}
            />
            <Button
              size="icon"
              variant="outline"
              className="h-10 w-10 shrink-0"
              onClick={() => handleWrite(Math.min(maxTemp, current + 1))}
              disabled={writeMutation.isPending || !isWritable || current >= maxTemp}
              data-testid={`button-setpoint-inc-${register.id}`}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      );
    }

    // Generic Boolean
    if (isBool) {
      return (
        <div className="flex items-center gap-3">
          <Switch
            checked={boolValue}
            onCheckedChange={handleSwitchChange}
            disabled={writeMutation.isPending || !isWritable}
            data-testid={`switch-bool-${register.id}`}
          />
          <span className={cn("text-sm font-medium", boolValue ? "text-primary" : "text-muted-foreground")}>
            {boolValue ? "EIN" : "AUS"}
          </span>
        </div>
      );
    }

    // Generic Enum
    if (isEnum && enumOptions) {
      return (
        <Select
          value={displayValue}
          onValueChange={(val) => handleWrite(Number(val))}
          disabled={writeMutation.isPending || !isWritable}
        >
          <SelectTrigger className="h-10 text-sm" data-testid={`select-enum-${register.id}`}>
            <SelectValue>{enumLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Object.entries(enumOptions).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Generic Number - Editable value
    if (isEditing && isWritable) {
      return (
        <div className="flex items-center gap-2">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="h-10 text-sm font-mono"
            placeholder={displayValue}
            autoFocus
            type="number"
            data-testid={`input-edit-${register.id}`}
          />
          <Button size="icon" variant="ghost" className="h-10 w-10 text-green-600" onClick={() => {
            const num = parseFloat(editValue);
            if (!isNaN(num)) {
              handleWrite(num);
              setIsEditing(false);
            }
          }}>
            <Save className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-10 w-10 text-red-500" onClick={() => setIsEditing(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      );
    }

    // Read-only or non-editing display
    return (
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold font-mono tabular-nums">
          {displayValue}
        </span>
        {register.unit && <span className="text-xs text-muted-foreground">{register.unit}</span>}
      </div>
    );
  };

  return (
    <Card className={cn(
      "group relative overflow-hidden border-border/40 transition-all",
      isWritable && "hover:border-primary/50 hover:shadow-sm",
      !isWritable && "bg-muted/30"
    )}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-1">
          <div className="flex items-center gap-2">
            {getIcon()}
            <span className="font-medium text-sm text-foreground/90 truncate max-w-[160px]" title={register.name}>
              {getCleanName()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isWritable && (
              <Badge variant="outline" className="text-[10px] font-mono opacity-50">
                RW
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] font-mono opacity-50">
              {register.type.toUpperCase().slice(0, 1)}{register.address}
            </Badge>
          </div>
        </div>

        {/* Control UI */}
        <div className="mt-3">
          {renderControl()}
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-1 mt-3 pt-2 border-t border-border/30 opacity-0 group-hover:opacity-100 transition-opacity">
          {isWritable && !isBool && !isEnum && !isFanSpeed(register) && !isTemperatureSetpoint(register) && !isEditing && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
              setEditValue(displayValue !== "--" ? displayValue : "0");
              setIsEditing(true);
            }}>
              <Edit2 className="w-3 h-3 text-muted-foreground" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDelete}>
            <Trash2 className="w-3 h-3 text-destructive/70 hover:text-destructive" />
          </Button>
        </div>
      </CardContent>

      {writeMutation.isPending && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center backdrop-blur-[1px] z-10">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      )}
    </Card>
  );
}
