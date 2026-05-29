import { useState } from "react";
import { Register } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Trash2, Edit2, X, Gauge, Zap, ToggleLeft, Activity } from "lucide-react";
import { useWriteRegister, useDeleteRegister } from "@/hooks/use-registers";
import { cn } from "@/lib/utils";

interface RegisterCardProps {
  register: Register;
  deviceId: number;
}

export function RegisterCard({ register, deviceId }: RegisterCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const writeMutation = useWriteRegister();
  const deleteMutation = useDeleteRegister();

  const isCoil = register.type === "coil";
  const isHolding = register.type === "holding";
  const isInput = register.type === "input" || register.type === "discrete";
  const isWritable = register.isWritable;

  const handleSwitchChange = (checked: boolean) => {
    writeMutation.mutate({ id: register.id, value: checked, deviceId });
  };

  const handleValueSave = () => {
    const numValue = parseFloat(editValue);
    if (!isNaN(numValue)) {
      writeMutation.mutate({ id: register.id, value: numValue, deviceId });
      setIsEditing(false);
    }
  };

  const handleDelete = () => {
    if (confirm("Are you sure you want to stop tracking this register?")) {
      deleteMutation.mutate({ id: register.id, deviceId });
    }
  };

  const getIcon = () => {
    switch (register.type) {
      case "coil": return <Zap className="w-4 h-4 text-yellow-500" />;
      case "discrete": return <ToggleLeft className="w-4 h-4 text-blue-500" />;
      case "input": return <Gauge className="w-4 h-4 text-purple-500" />;
      default: return <Activity className="w-4 h-4 text-emerald-500" />;
    }
  };

  const displayValue = register.lastValue !== null ? register.lastValue : "--";
  const isBool = register.dataType === "bool";
  const isEnum = register.dataType === "enum";
  const boolValue = displayValue === "true" || displayValue === "1";

  const enumLabel = isEnum && register.options && typeof register.options === "object"
    ? (register.options as Record<string, string>)[displayValue] ?? displayValue
    : displayValue;

  return (
    <Card className="group relative overflow-hidden bg-card/50 hover:bg-card/80 transition-colors border-border/40 hover:border-primary/50">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            {getIcon()}
            <span className="font-medium text-sm text-foreground/90 truncate max-w-[150px]" title={register.name}>
              {register.name}
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono opacity-50 group-hover:opacity-100 transition-opacity">
            {register.type.toUpperCase().slice(0, 1)}{register.address}
          </Badge>
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div className="flex-1">
            {isCoil ? (
              <div className="flex items-center gap-2">
                <Switch 
                  checked={boolValue} 
                  onCheckedChange={handleSwitchChange} 
                  disabled={writeMutation.isPending}
                />
                <span className={cn("text-xs font-mono uppercase", boolValue ? "text-primary" : "text-muted-foreground")}>
                  {boolValue ? "ON" : "OFF"}
                </span>
              </div>
            ) : isEditing ? (
              isEnum && register.options && typeof register.options === "object" ? (
                <div className="flex items-center gap-2 max-w-[160px]">
                  <Select
                    value={editValue}
                    onValueChange={(val) => {
                      setEditValue(val);
                      writeMutation.mutate({ id: register.id, value: Number(val), deviceId });
                      setIsEditing(false);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={enumLabel} />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(register.options as Record<string, string>).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => setIsEditing(false)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 max-w-[140px]">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="h-8 text-xs font-mono"
                    placeholder={displayValue}
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500" onClick={handleValueSave}>
                    <Save className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => setIsEditing(false)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )
            ) : (
              <div className="flex items-baseline gap-1">
                <span className={cn("font-bold tracking-tighter", isEnum ? "text-lg" : "text-2xl font-mono")}>
                  {isEnum ? enumLabel : displayValue}
                </span>
                {register.unit && !isEnum && <span className="text-xs text-muted-foreground">{register.unit}</span>}
              </div>
            )}
          </div>

          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isWritable && !isCoil && !isEditing && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditValue(displayValue); setIsEditing(true); }}>
                <Edit2 className="w-3 h-3 text-muted-foreground" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleDelete}>
              <Trash2 className="w-3 h-3 text-destructive/70 hover:text-destructive" />
            </Button>
          </div>
        </div>
      </CardContent>
      {writeMutation.isPending && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center backdrop-blur-[1px]">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      )}
    </Card>
  );
}
