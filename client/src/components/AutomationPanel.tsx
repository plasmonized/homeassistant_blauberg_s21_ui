import { ControlProfilesPanel } from "./ControlProfilesPanel";

interface AutomationPanelProps {
  deviceId: number;
}

export function AutomationPanel({ deviceId }: AutomationPanelProps) {
  return <ControlProfilesPanel deviceId={deviceId} />;
}
