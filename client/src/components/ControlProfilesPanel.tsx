import { useState } from "react";
import {
  useControlProfiles,
  useControlLogs,
  useControlProfileTemplates,
  useCreateControlProfile,
  useUpdateControlProfile,
  useDeleteControlProfile,
} from "@/hooks/use-control-profiles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, Trash2, Pencil, Bot, Thermometer, Droplets, Wind, Moon, Sun, Gauge, History } from "lucide-react";

interface ControlProfilesPanelProps {
  deviceId: number;
}

const controlTypeIcons: Record<string, any> = {
  temperature_control: Thermometer,
  humidity_control: Droplets,
  co2_control: Wind,
  summer_winter: Sun,
  night_setback: Moon,
  weather_compensated: Gauge,
};

const controlTypeLabels: Record<string, string> = {
  temperature_control: "Temperaturregelung",
  humidity_control: "Feuchtigkeitsregelung",
  co2_control: "CO2-Regelung",
  summer_winter: "Sommer/Winter",
  night_setback: "Nachtabsenkung",
  weather_compensated: "Wetterkompensiert",
};

export function ControlProfilesPanel({ deviceId }: ControlProfilesPanelProps) {
  const { data: profiles, isLoading: profilesLoading } = useControlProfiles(deviceId);
  const { data: logs, isLoading: logsLoading } = useControlLogs(deviceId);
  const { data: templates } = useControlProfileTemplates();
  const createProfile = useCreateControlProfile(deviceId);
  const updateProfile = useUpdateControlProfile(deviceId);
  const deleteProfile = useDeleteControlProfile(deviceId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [params, setParams] = useState<Record<string, any>>({});
  const [name, setName] = useState("");

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    if (templates && templates[templateKey]) {
      const t = templates[templateKey];
      setName(t.name);
      setParams(t.defaultParams || {});
    }
  };

  const handleSave = () => {
    if (!selectedTemplate) return;

    const data = {
      name,
      controlType: selectedTemplate,
      parameters: params,
      enabled: true,
      deviceId,
    };

    if (editingProfile) {
      updateProfile.mutate({ id: editingProfile.id, data: { name, parameters: params } });
    } else {
      createProfile.mutate(data as any);
    }

    setDialogOpen(false);
    setEditingProfile(null);
    setSelectedTemplate("");
    setParams({});
    setName("");
  };

  const handleEdit = (profile: any) => {
    setEditingProfile(profile);
    setSelectedTemplate(profile.schemaType || profile.controlType);
    setName(profile.name);
    setParams(profile.parameters || {});
    setDialogOpen(true);
  };

  const handleToggle = (profile: any) => {
    updateProfile.mutate({
      id: profile.id,
      data: { enabled: !profile.enabled },
    });
  };

  const handleParamChange = (key: string, value: any) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  };

  const renderParamInput = (key: string, value: any, label: string) => {
    if (key.toLowerCase().includes("entity") || key.toLowerCase().includes("sensor")) {
      return (
        <div key={key} className="space-y-2">
          <Label>{label}</Label>
          <Input
            value={value || ""}
            onChange={(e) => handleParamChange(key, e.target.value || null)}
            placeholder="z.B. sensor.wohnzimmer_temperatur"
            data-testid={`input-param-${key}`}
          />
        </div>
      );
    }
    if (key.toLowerCase().includes("time") && typeof value === "string" && value.includes(":")) {
      return (
        <div key={key} className="space-y-2">
          <Label>{label}</Label>
          <Input
            type="time"
            value={value || "00:00"}
            onChange={(e) => handleParamChange(key, e.target.value)}
            data-testid={`input-param-${key}`}
          />
        </div>
      );
    }
    if (typeof value === "boolean" || key === "enabled") {
      return (
        <div key={key} className="flex items-center gap-2">
          <Switch
            checked={!!value}
            onCheckedChange={(v) => handleParamChange(key, v)}
            data-testid={`switch-param-${key}`}
          />
          <Label>{label}</Label>
        </div>
      );
    }
    return (
      <div key={key} className="space-y-2">
        <Label>{label}</Label>
        <Input
          type="number"
          value={value ?? 0}
          onChange={(e) => handleParamChange(key, e.target.value === "" ? null : Number(e.target.value))}
          step={key.includes("Temp") || key.includes("temp") || key.includes("hysteresis") || key.includes("offset") || key.includes("supply") ? 0.1 : 1}
          data-testid={`input-param-${key}`}
        />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Regelungsschemata</h3>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              onClick={() => {
                setEditingProfile(null);
                setSelectedTemplate("");
                setParams({});
                setName("");
              }}
              data-testid="button-add-control-profile"
            >
              <Plus className="h-4 w-4 mr-1" />
              Schema hinzufügen
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProfile ? "Regelschema bearbeiten" : "Neues Regelschema"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {!editingProfile && (
                <div className="space-y-2">
                  <Label>Regelschema-Typ</Label>
                  <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                    <SelectTrigger data-testid="select-template-type">
                      <SelectValue placeholder="Schema auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates &&
                        Object.entries(templates).map(([key, t]: [string, any]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex items-center gap-2">
                              {(() => {
                                const Icon = controlTypeIcons[key] || Bot;
                                return <Icon className="h-4 w-4" />;
                              })()}
                              {t.name}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name des Regelschemas"
                  data-testid="input-profile-name"
                />
              </div>

              {selectedTemplate && templates && templates[selectedTemplate] && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {templates[selectedTemplate].description}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(templates[selectedTemplate].paramLabels || {}).map(([key, label]) =>
                      renderParamInput(key, params[key], label as string)
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!selectedTemplate || !name}
                  data-testid="button-save-control-profile"
                >
                  {editingProfile ? "Speichern" : "Erstellen"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active Profiles */}
      <div className="space-y-3">
        {profilesLoading ? (
          <Skeleton className="h-24" />
        ) : profiles && profiles.length > 0 ? (
          profiles.map((profile: any) => {
            const controlType = profile.schemaType || profile.controlType;
            const Icon = controlTypeIcons[controlType] || Bot;
            return (
              <Card key={profile.id} className="p-4" data-testid={`card-control-profile-${profile.id}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{profile.name}</h4>
                        <Badge
                          variant={profile.enabled ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {profile.enabled ? "Aktiv" : "Inaktiv"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {controlTypeLabels[controlType] || controlType}
                      </p>
                      {profile.parameters && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(profile.parameters)
                            .filter(([k, v]) => v !== null && v !== undefined && !k.includes("Entity") && !k.includes("entity"))
                            .slice(0, 4)
                            .map(([k, v]) => (
                              <Badge key={k} variant="outline" className="text-xs">
                                {k}: {String(v)}
                              </Badge>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={profile.enabled}
                      onCheckedChange={() => handleToggle(profile)}
                      data-testid={`switch-profile-enabled-${profile.id}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(profile)}
                      data-testid={`button-edit-profile-${profile.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteProfile.mutate(profile.id)}
                      data-testid={`button-delete-profile-${profile.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Keine Regelungsschemata konfiguriert</p>
            <p className="text-sm mt-1">
              Wählen Sie ein vorgefertigtes Schema und passen Sie nur die Parameter an.
            </p>
          </div>
        )}
      </div>

      {/* Regulation Logs */}
      <Accordion type="single" collapsible>
        <AccordionItem value="logs">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4" />
              <span>Regelungsverlauf</span>
              {logs && logs.length > 0 && (
                <Badge variant="outline" className="text-xs">{logs.length}</Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            {logsLoading ? (
              <Skeleton className="h-24" />
            ) : logs && logs.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {logs.slice(0, 20).map((log: any) => (
                  <div
                    key={log.id}
                    className="text-sm p-2 rounded bg-muted/50"
                    data-testid={`control-log-${log.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {controlTypeLabels[log.controlType] || log.controlType || log.schemaType || "Unbekannt"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString("de-DE")}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1">
                      {log.actionTaken} — {log.message}
                    </p>
                    {log.success === false && (
                      <Badge variant="destructive" className="text-xs mt-1">Fehlgeschlagen</Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Noch keine Regelungsaktionen aufgezeichnet
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
