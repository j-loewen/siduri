import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { ApiError } from '../api';

/**
 * A readable message for an error: server errors are translated by their code when the locale
 * has one (errors.<code>), otherwise the server's English message is shown.
 */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    return i18n.exists(key) ? i18n.t(key) : err.message;
  }
  if (err instanceof TypeError) return i18n.t('errors.network');
  return err instanceof Error ? err.message : i18n.t('errors.unknown');
}

export function useErrorMessage() {
  const { i18n: instance } = useTranslation();
  // Re-created on language change so components re-render with the new language.
  return useCallback((err: unknown) => errorText(err), [instance.language]);
}

export const notifyError = (err: unknown) => notifications.show({ color: 'red', title: i18n.t('errors.title'), message: errorText(err) });

export const notifyOk = (message: string) => notifications.show({ message });
