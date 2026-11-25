import { useRef, useState } from 'react';
import { Alert, Button, Checkbox, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconDownload, IconUpload } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BACKUP_SECTIONS, backupContents, type BackupImportResult, type BackupSection } from '@brew/shared';
import { downloadFile, uploadFile } from '../api';
import { notifyError, notifyOk } from '../lib/notify';

interface PickedFile {
  file: File;
  exportedAt: string | null;
  contents: Partial<Record<BackupSection, number>>;
}

/** Settings → Backup: download the brewery's data as one file, or import such a file. */
export function BackupSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [exportSections, setExportSections] = useState<string[]>([...BACKUP_SECTIONS]);
  const [exporting, setExporting] = useState(false);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [importSections, setImportSections] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const ordered = (list: string[]) => BACKUP_SECTIONS.filter((s) => list.includes(s));

  const download = () => {
    setExporting(true);
    downloadFile(`/api/backup/export?include=${ordered(exportSections).join(',')}`, 'siduri-backup.json')
      .catch(notifyError)
      .finally(() => setExporting(false));
  };

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPicked(null);
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      raw = null;
    }
    const contents = backupContents(raw);
    if (!contents) {
      setError(t('settings.backup.notBackup'));
      return;
    }
    const exportedAt = typeof (raw as { exportedAt?: unknown }).exportedAt === 'string' ? (raw as { exportedAt: string }).exportedAt : null;
    setPicked({ file, exportedAt, contents });
    setImportSections(BACKUP_SECTIONS.filter((s) => contents[s] !== undefined));
  };

  const runImport = () => {
    if (!picked) return;
    setImporting(true);
    uploadFile<BackupImportResult>(`/api/backup/import?include=${ordered(importSections).join(',')}`, picked.file)
      .then((result) => {
        const parts = ordered(importSections).map((s) =>
          s === 'settings'
            ? t('settings.backup.sections.settings')
            : `${t(`settings.backup.sections.${s}`)}: ${t('settings.backup.addedSkipped', { added: result.added[s], skipped: result.skipped[s] })}`,
        );
        notifyOk(`${t('settings.backup.imported')} ${parts.join(' · ')}`);
        setPicked(null);
        // Almost every list may have changed.
        void qc.invalidateQueries();
      })
      .catch(notifyError)
      .finally(() => setImporting(false));
  };

  return (
    <>
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          {t('settings.backup.exportTitle')}
        </Text>
        <Checkbox.Group value={exportSections} onChange={setExportSections}>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            {BACKUP_SECTIONS.map((s) => (
              <Checkbox key={s} value={s} label={t(`settings.backup.sections.${s}`)} description={t(`settings.backup.hints.${s}`)} />
            ))}
          </SimpleGrid>
        </Checkbox.Group>
        <Group>
          <Button leftSection={<IconDownload size={16} />} onClick={download} loading={exporting} disabled={exportSections.length === 0}>
            {t('settings.backup.download')}
          </Button>
        </Group>
      </Stack>

      <Stack gap="xs" mt="sm">
        <Text size="sm" fw={600}>
          {t('settings.backup.importTitle')}
        </Text>
        <Text size="sm" c="dimmed">
          {t('settings.backup.importHint')}
        </Text>
        {!picked && (
          <Group>
            <Button variant="default" leftSection={<IconUpload size={16} />} onClick={() => input.current?.click()}>
              {t('settings.backup.choose')}
            </Button>
          </Group>
        )}
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void read(e.currentTarget.files?.[0]);
            e.currentTarget.value = '';
          }}
        />
        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={18} />}>
            {error}
          </Alert>
        )}
        {picked && (
          <Paper withBorder radius="md" p="sm">
            <Stack gap="sm">
              <Text size="sm">
                {picked.exportedAt
                  ? t('settings.backup.fileFrom', { name: picked.file.name, date: new Date(picked.exportedAt).toLocaleString() })
                  : picked.file.name}
              </Text>
              <Checkbox.Group value={importSections} onChange={setImportSections}>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                  {BACKUP_SECTIONS.filter((s) => picked.contents[s] !== undefined).map((s) => (
                    <Checkbox
                      key={s}
                      value={s}
                      label={s === 'settings' ? t('settings.backup.sections.settings') : `${t(`settings.backup.sections.${s}`)} (${picked.contents[s]})`}
                      description={s === 'settings' ? t('settings.backup.settingsReplace') : undefined}
                    />
                  ))}
                </SimpleGrid>
              </Checkbox.Group>
              <Group justify="flex-end" gap="xs">
                <Button variant="default" onClick={() => setPicked(null)} disabled={importing}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={runImport} loading={importing} disabled={importSections.length === 0}>
                  {t('settings.backup.import')}
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}
      </Stack>
    </>
  );
}
