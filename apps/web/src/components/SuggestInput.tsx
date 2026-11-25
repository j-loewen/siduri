import { useMemo } from 'react';
import { Autocomplete, type AutocompleteProps } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { COMMON_ORIGINS, normalizeOrigin, type LibraryKind } from '@brew/shared';
import { useLibraryValues } from '../data';

type Props = Omit<AutocompleteProps, 'data' | 'value' | 'onChange' | 'label'> & {
  kind: LibraryKind;
  value: string;
  onChange: (value: string) => void;
  label?: string;
};

const uniqueSorted = (values: readonly string[]) =>
  [...new Map(values.filter(Boolean).map((v) => [v.toLowerCase(), v])).values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

/** Producer: pick one already in the library (of this kind) or type a new one. */
export function ProducerInput({ kind, value, onChange, label, ...rest }: Props) {
  const { t } = useTranslation();
  const values = useLibraryValues(kind);
  const data = useMemo(() => uniqueSorted(values.data?.producers ?? []), [values.data]);
  return (
    <Autocomplete
      label={label ?? t('fields.producer')}
      placeholder={t('fields.producerPlaceholder')}
      data={data}
      value={value}
      onChange={onChange}
      onBlur={() => value !== value.trim() && onChange(value.trim())}
      limit={100}
      maxDropdownHeight={260}
      {...rest}
    />
  );
}

/** Country of origin: one already in the library or a common one, or a new one ("DE" becomes "Germany"). */
export function OriginInput({ kind, value, onChange, label, ...rest }: Props) {
  const { t } = useTranslation();
  const values = useLibraryValues(kind);
  const data = useMemo(() => uniqueSorted([...(values.data?.origins ?? []).map(normalizeOrigin), ...COMMON_ORIGINS]), [values.data]);
  return (
    <Autocomplete
      label={label ?? t('fields.origin')}
      placeholder={t('fields.originPlaceholder')}
      data={data}
      value={value}
      onChange={onChange}
      onBlur={() => {
        const normalized = normalizeOrigin(value);
        if (normalized !== value) onChange(normalized);
      }}
      limit={100}
      maxDropdownHeight={260}
      {...rest}
    />
  );
}
