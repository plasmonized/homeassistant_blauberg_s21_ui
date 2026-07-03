import { ControlProfilesPanel } from "./ControlProfilesPanel";
import { BoostTriggerPanel } from "./BoostTriggerPanel";
import { Separator } from "@/components/ui/separator";

interface AutomationPanelProps {
  deviceId: number;
}

export function AutomationPanel({ deviceId }: AutomationPanelProps) {
  return (
    <div className="space-y-6">
      <BoostTriggerPanel deviceId={deviceId} />
      <Separator />
      <ControlProfilesPanel deviceId={deviceId} />
    </div>
  );
}
