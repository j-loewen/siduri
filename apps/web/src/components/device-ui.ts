import { useTranslation } from 'react-i18next';
import type { Telemetry } from '@brew/shared';
import { useFormat } from '../units';

/** "1.048 SG · 19.2 °C · target 19 °C" */
export function useTelemetryText() {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (tm: Telemetry | null) => {
    if (!tm) return t('devices.noData');
    return [
      tm.gravity != null ? fmt(tm.gravity, 'gravity') : null,
      tm.tempC != null ? fmt(tm.tempC, 'temperature', 1) : null,
      tm.targetTempC != null ? t('devices.target', { temp: fmt(tm.targetTempC, 'temperature', 1) }) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };
}

/** Push URL of a device: this server's address plus its token. */
export const pushUrl = (token: string) => `${window.location.origin}/api/integrations/telemetry/${token}`;
