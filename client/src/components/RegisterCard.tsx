import { useState } from "react";
import { Register, TAG_LABELS, TAG_COLORS, LOCATION_TAGS, FUNCTION_TAGS, ROLE_TAGS } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2, Save, Trash2, Edit2, X, Gauge, Zap, ToggleLeft,
  Activity, Fan, Rocket, Thermometer, Wind, Droplets, Sun, Snowflake, Home,
  RotateCcw, ChevronUp, ChevronDown, Minus, Plus, Settings2,
} from "lucide-react";
import { useWriteRegister, useDeleteRegister, useUpdateRegister } from "@/hooks/use-registers";
import { cn } from "@/lib/utils";

interface RegisterCardProps {
  register: Register;
  deviceId: number;
}

const isFanSpeed = (reg: Register) =>
  reg.name.toLowerCase().includes("fan") && reg.name.toLowerCase().includes("speed");
const isSystemPower = (reg: Register) =>
  reg.name.toLowerCase().includes("system") && reg.dataType === "bool";
const isOperationMode = (reg: Register) =>
  reg.name.toLowerCase().includes("operation") && reg.name.toLowerCase().includes("mode");
const isBypass = (reg: Register) =>
  reg.name.toLowerCase().includes("bypass");
const isBypassStatus = (reg: Register) =>
  isBypass(reg) && !reg.isWritable;
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

// Tag groups for the edit dialog
const TAG_GROUPS = [
  { label: "Ort", tags: LOCATION_TAGS as readonly string[] },
  { label: "Funktion", tags: FUNCTION_TAGS as readonly string[] },
  { label: "Rolle", tags: ROLE_TAGS as readonly string[] },
];

function EditRegisterDialog({
  register,
  deviceId,
  open,
  onClose,
}: {
  register: Register;
  deviceId: number;
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(register.name);
  const [unit, setUnit] = useState(register.unit ?? "");
  const [tags, setTags] = useState<string[]>(register.tags ?? []);
  const updateRegister = useUpdateRegister();

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSave = () => {
    updateRegister.mutate(
      {
        id: register.id,
        deviceId,
        name: name.trim() || register.name,
        unit: unit.trim() || null,
        tags: tags.length > 0 ? tags : null,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Register bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-register-name" />
          </div>

          <div className="space-y-1.5">
            <Label>Einheit</Label>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="z.B. °C, %, ppm"
              data-testid="input-register-unit"
            />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <p className="text-xs text-muted-foreground">
              Tags helfen der App zu verstehen, welche Art von Sensor oder Steuerung das ist.
            </p>
            {TAG_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-xs text-muted-foreground font-medium mb-1.5 mt-2">{group.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {group.tags.map((tag) => {
                    const active = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={cn(
                          "px-2 py-0.5 rounded-full text-xs font-medium border transition-all",
                          active
                            ? cn("border-transparent", TAG_COLORS[tag])
                            : "border-border text-muted-foreground hover:border-muted-foreground/50"
                        )}
                        data-testid={`tag-toggle-${tag}`}
                      >
                        {TAG_LABELS[tag] ?? tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={updateRegister.isPending}
              className="flex-1"
              data-testid="button-save-register"
            >
              {updateRegister.isPending ? "Speichern..." : "Speichern"}
            </Button>
            <Button variant="outline" onClick={onClose} data-testid="button-cancel-register">
              Abbrechen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RegisterCard({ register, deviceId }: RegisterCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [showMetaEdit, setShowMetaEdit] = useState(false);
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

  const handleWrite = (value: number | boolean | string) => {
    if (!isWritable) return;
    writeMutation.mutate({ id: register.id, value, deviceId });
  };

  const handleSwitchChange = (checked: boolean) => handleWrite(checked);
  const handleFanSpeed = (speed: number) => handleWrite(speed);
  const handleSliderChange = (value: number[]) => handleWrite(value[0]);

  const handleDelete = () => {
    if (confirm("Dieses Register wirklich entfernen?")) {
      deleteMutation.mutate({ id: register.id, deviceId });
    }
  };

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

  const getCleanName = () =>
    register.name.replace(/\s*\(.*?\)/g, "").replace(/\s*-\s*/g, " ").trim();

  // Tags to display (skip generic role tags to reduce noise)
  const displayTags = (register.tags ?? []).filter(
    (t) => !["sensor", "control", "status"].includes(t)
  );

  const renderControl = () => {
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

    if (isBypassStatus(register) && isNumber) {
      const pct = !isNaN(numValue) ? Math.min(100, Math.max(0, numValue)) : 0;
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-cyan-400" />
            <span className="text-2xl font-bold font-mono tabular-nums">{!isNaN(numValue) ? numValue : "–"}</span>
            <span className="text-xs text-muted-foreground">% geöffnet</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-cyan-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Tatsächliche Klappenstellung des Bypasses (0% = geschlossen, 100% = offen) — nützlich, wenn die Steuerung oben auf "Auto" steht.
          </p>
        </div>
      );
    }

    if (isBypass(register)) {
      const bypassOn = isBool ? boolValue : (numValue === 1 || displayValue === "1");
      const handleBypassToggle = (checked: boolean) => {
        if (isBool) handleSwitchChange(checked);
        else handleWrite(checked ? 1 : 0);
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

    return (
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold font-mono tabular-nums">{displayValue}</span>
        {register.unit && <span className="text-xs text-muted-foreground">{register.unit}</span>}
      </div>
    );
  };

  return (
    <>
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
                <Badge variant="outline" className="text-[10px] font-mono opacity-50">RW</Badge>
              )}
              <Badge variant="outline" className="text-[10px] font-mono opacity-50">
                {register.type.toUpperCase().slice(0, 1)}{register.address}
              </Badge>
            </div>
          </div>

          {/* Tags */}
          {displayTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {displayTags.map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    "px-1.5 py-0 rounded-full text-[10px] font-medium",
                    TAG_COLORS[tag] ?? "bg-muted text-muted-foreground"
                  )}
                >
                  {TAG_LABELS[tag] ?? tag}
                </span>
              ))}
            </div>
          )}

          {/* Control UI */}
          <div className="mt-3">{renderControl()}</div>

          {/* Action buttons */}
          <div className="flex justify-end gap-1 mt-3 pt-2 border-t border-border/30 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setShowMetaEdit(true)}
              title="Bearbeiten"
              data-testid={`button-edit-register-${register.id}`}
            >
              <Settings2 className="w-3 h-3 text-muted-foreground" />
            </Button>
            {isWritable && !isBool && !isEnum && !isFanSpeed(register) && !isTemperatureSetpoint(register) && !isEditing && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                setEditValue(displayValue !== "--" ? displayValue : "0");
                setIsEditing(true);
              }}>
                <Edit2 className="w-3 h-3 text-muted-foreground" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDelete}
              data-testid={`button-delete-register-${register.id}`}>
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

      <EditRegisterDialog
        register={register}
        deviceId={deviceId}
        open={showMetaEdit}
        onClose={() => setShowMetaEdit(false)}
      />
    </>
  );
}
