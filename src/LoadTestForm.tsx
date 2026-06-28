import { useId, useState } from '@harborclient/sdk/react';
import { Button, FormGroup, Input, StatusMessage } from '@harborclient/sdk/components';
import type { LoadTestConfig } from './types';
import { normalizeConfig, saveDefaultConfig, useDefaultConfig } from './store';

interface Props {
  /** Called when the user submits the form to start a run. */
  onRun: (config: LoadTestConfig) => void;
  /** Called when the user cancels an active run. */
  onCancel?: () => void;
  /** Whether a run is currently active. */
  running?: boolean;
  /** Optional helper text shown above the fields. */
  hint?: string;
  /** Primary action label. */
  runLabel?: string;
}

/**
 * Shared load test configuration form for the request tab and collection modal.
 */
export function LoadTestForm({
  onRun,
  onCancel,
  running = false,
  hint,
  runLabel = 'Run load test'
}: Props) {
  const defaults = useDefaultConfig();
  const [config, setConfig] = useState<LoadTestConfig>(defaults);

  const countId = useId();
  const concurrencyId = useId();
  const timeoutId = useId();
  const delayId = useId();
  const keepAliveId = useId();

  /**
   * Updates one numeric field in the form state.
   *
   * @param key - Configuration field to update.
   * @param value - Raw input value from the field.
   */
  const updateNumber = (key: keyof LoadTestConfig, value: string): void => {
    setConfig((current) =>
      normalizeConfig({
        ...current,
        [key]: Number(value)
      })
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {hint ? <StatusMessage>{hint}</StatusMessage> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <FormGroup label="Total requests" htmlFor={countId}>
          <Input
            id={countId}
            type="number"
            min={1}
            max={10000}
            value={String(config.count)}
            disabled={running}
            onChange={(event) => {
              updateNumber('count', event.target.value);
            }}
          />
        </FormGroup>

        <FormGroup label="Concurrency" htmlFor={concurrencyId}>
          <Input
            id={concurrencyId}
            type="number"
            min={1}
            max={500}
            value={String(config.concurrency)}
            disabled={running}
            onChange={(event) => {
              updateNumber('concurrency', event.target.value);
            }}
          />
        </FormGroup>

        <FormGroup label="Timeout (ms)" htmlFor={timeoutId}>
          <Input
            id={timeoutId}
            type="number"
            min={100}
            max={300000}
            value={String(config.timeoutMs)}
            disabled={running}
            onChange={(event) => {
              updateNumber('timeoutMs', event.target.value);
            }}
          />
        </FormGroup>

        <FormGroup label="Delay between starts (ms)" htmlFor={delayId}>
          <Input
            id={delayId}
            type="number"
            min={0}
            max={60000}
            value={String(config.delayMs)}
            disabled={running}
            onChange={(event) => {
              updateNumber('delayMs', event.target.value);
            }}
          />
        </FormGroup>
      </div>

      <label className="flex items-center gap-2 text-[14px]" htmlFor={keepAliveId}>
        <input
          id={keepAliveId}
          type="checkbox"
          checked={config.keepAlive}
          disabled={running}
          onChange={(event) => {
            setConfig((current) =>
              normalizeConfig({
                ...current,
                keepAlive: event.target.checked
              })
            );
          }}
        />
        Prefer keep-alive connections when supported
      </label>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={running}
          onClick={() => {
            const normalized = normalizeConfig(config);
            saveDefaultConfig(normalized);
            onRun(normalized);
          }}
        >
          {runLabel}
        </Button>
        {running && onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
