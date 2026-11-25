import { useCallback, useEffect, useRef, useState } from 'react';
import type { BatchCarbonation, BatchMeasured } from '@brew/shared';
import { usePatchBatch } from '../data';
import { notifyError } from './notify';

/** Batch fields that are objects merged with each patch, and their full shape. */
interface MergedFields {
  measured: BatchMeasured;
  carbonation: BatchCarbonation;
}

/**
 * Saves values of one merged batch field (`measured`, `carbonation`) as they are typed. Changes to
 * different keys are merged into one pending patch (a plain debounce would keep only the last
 * key), and whatever is pending is saved when the component unmounts, the page is hidden (phone
 * locked) or `flush()` is called, so nothing typed gets lost.
 *
 * `local` holds values typed but not yet confirmed by the server; show them over the batch's.
 */
export function useBatchFieldSaver<F extends keyof MergedFields>(batchId: string, field: F, delayMs = 600) {
  type Values = Partial<MergedFields[F]>;
  const patch = usePatchBatch();
  const mutate = useRef(patch.mutateAsync);
  mutate.current = patch.mutateAsync;
  const pending = useRef<Values>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [local, setLocal] = useState<Values>({});

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const values = pending.current;
    if (Object.keys(values).length === 0) return;
    pending.current = {};
    try {
      await mutate.current({ id: batchId, patch: { [field]: values } });
      // Saved: the batch now has these values (unless they were changed again meanwhile).
      setLocal((l) => {
        const next = { ...l };
        for (const [k, v] of Object.entries(values)) if (next[k as keyof Values] === v && !(k in pending.current)) delete next[k as keyof Values];
        return next;
      });
    } catch (err) {
      // Keep them for the next attempt; newer values win.
      pending.current = { ...values, ...pending.current };
      notifyError(err);
    }
  }, [batchId, field]);

  const set = useCallback(
    (values: Values) => {
      pending.current = { ...pending.current, ...values };
      setLocal((l) => ({ ...l, ...values }));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [flush, delayMs],
  );

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onHidden);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onHidden);
      void flush();
    };
  }, [flush]);

  return { local, set, flush };
}

/** Measured values of a batch, saved as they are typed (see useBatchFieldSaver). */
export function useMeasuredSaver(batchId: string, delayMs = 600) {
  const saver = useBatchFieldSaver(batchId, 'measured', delayMs);
  const { set: setValues } = saver;
  const set = useCallback(<K extends keyof BatchMeasured>(key: K, value: BatchMeasured[K]) => setValues({ [key]: value } as Partial<BatchMeasured>), [setValues]);
  return { local: saver.local, flush: saver.flush, set };
}

export type MeasuredSaver = ReturnType<typeof useMeasuredSaver>;
