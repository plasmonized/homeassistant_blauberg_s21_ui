// Current configuration only; these values are not historical snapshots.
export interface BaseProfileReferenceSettings {
  roomSetpoint: number;
  co2ControlEnabled: boolean;
  co2Setpoint: number;
  co2BoostThreshold: number;
  humidityControlEnabled: boolean;
  humiditySetpoint: number;
  humidityBoostThreshold: number;
}
