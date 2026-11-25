import { useRef, useState, type DragEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Alert, Button, Checkbox, Group, List, Modal, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconFileUpload } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { LIBRARY_KINDS, type ImportPreview, type LibraryKind } from '@brew/shared';
import { previewImport, useCommitImport } from '../data';
import { notifyOk, useErrorMessage } from '../lib/notify';

/**
 * Import BeerXML / BeerJSON: pick or drop a file, see what is in it, choose what to keep.
 * Recipes become recipes; ingredients, styles and water profiles go into the library.
 */
export function ImportModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [recipes, setRecipes] = useState<Set<number>>(new Set());
  const [kinds, setKinds] = useState<Set<LibraryKind>>(new Set());
  const [equipment, setEquipment] = useState(true);
  const commit = useCommitImport();

  const reset = () => {
    setPreview(null);
    setError(null);
    setRecipes(new Set());
    setKinds(new Set());
  };
  const close = () => {
    reset();
    onClose();
  };

  const read = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setReading(true);
    try {
      const p = await previewImport(file);
      setPreview(p);
      setRecipes(new Set(p.recipes.map((_, i) => i)));
      setKinds(new Set(p.library.map((i) => i.kind)));
      setEquipment(p.recipes.length === 0);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setReading(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void read(e.dataTransfer.files[0]);
  };

  const counts = LIBRARY_KINDS.map((kind) => [kind, preview?.library.filter((i) => i.kind === kind).length ?? 0] as const).filter(([, n]) => n > 0);

  const save = () => {
    if (!preview) return;
    commit.mutate(
      {
        recipes: preview.recipes.filter((_, i) => recipes.has(i)),
        library: preview.library.filter((i) => kinds.has(i.kind)),
        equipment: equipment ? preview.equipment : [],
      },
      {
        onSuccess: (result) => {
          notifyOk(t('import.done', { recipes: result.recipeIds.length, library: result.libraryAdded, skipped: result.librarySkipped }));
          close();
          if (result.recipeIds.length === 1) void navigate({ to: '/recipes/$recipeId', params: { recipeId: result.recipeIds[0]! } });
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  const nothing = preview && recipes.size === 0 && kinds.size === 0 && !(equipment && preview.equipment.length);

  return (
    <Modal opened={opened} onClose={close} title={t('import.title')} size="lg">
      <Stack>
        {!preview && (
          <Paper
            withBorder
            p="xl"
            radius="md"
            style={{ borderStyle: 'dashed', textAlign: 'center', cursor: 'pointer', background: dragging ? 'var(--mantine-primary-color-light)' : undefined }}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <Stack align="center" gap="xs">
              <IconFileUpload size={36} stroke={1.5} />
              <Text fw={500}>{t('import.drop')}</Text>
              <Text size="sm" c="dimmed">
                {t('import.formats')}
              </Text>
              <Button variant="light" loading={reading} onClick={(e) => (e.stopPropagation(), input.current?.click())}>
                {t('import.choose')}
              </Button>
            </Stack>
            <input
              ref={input}
              type="file"
              accept=".xml,.json,.bsmx,application/xml,text/xml,application/json"
              hidden
              onChange={(e) => {
                void read(e.currentTarget.files?.[0]);
                e.currentTarget.value = '';
              }}
            />
          </Paper>
        )}

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={18} />}>
            {error}
          </Alert>
        )}

        {preview && (
          <>
            <Text size="sm" c="dimmed">
              {t('import.found', { format: preview.format === 'beerxml' ? 'BeerXML' : 'BeerJSON' })}
            </Text>
            {preview.recipes.length > 0 && (
              <Stack gap={6}>
                <Text fw={600}>{t('import.recipes')}</Text>
                <ScrollArea.Autosize mah={220}>
                  <Stack gap={6}>
                    {preview.recipes.map((r, i) => (
                      <Checkbox
                        key={i}
                        label={`${r.name}${r.style ? ` · ${r.style.name}` : ''}`}
                        checked={recipes.has(i)}
                        onChange={(e) => {
                          const next = new Set(recipes);
                          if (e.currentTarget.checked) next.add(i);
                          else next.delete(i);
                          setRecipes(next);
                        }}
                      />
                    ))}
                  </Stack>
                </ScrollArea.Autosize>
              </Stack>
            )}
            {counts.length > 0 && (
              <Stack gap={6}>
                <Text fw={600}>{t('import.library')}</Text>
                {counts.map(([kind, n]) => (
                  <Checkbox
                    key={kind}
                    label={`${t(`library.kinds.${kind}`)} (${n})`}
                    checked={kinds.has(kind)}
                    onChange={(e) => {
                      const next = new Set(kinds);
                      if (e.currentTarget.checked) next.add(kind);
                      else next.delete(kind);
                      setKinds(next);
                    }}
                  />
                ))}
                <Text size="xs" c="dimmed">
                  {t('import.skipExisting')}
                </Text>
              </Stack>
            )}
            {preview.equipment.length > 0 && (
              <Checkbox
                label={t('import.equipment', { names: preview.equipment.map((e) => e.name).join(', ') })}
                checked={equipment}
                onChange={(e) => setEquipment(e.currentTarget.checked)}
              />
            )}
            {preview.warnings.length > 0 && (
              <Alert color="yellow" icon={<IconAlertTriangle size={18} />} title={t('import.warnings')}>
                <List size="sm" spacing={2}>
                  {preview.warnings.slice(0, 8).map((w) => (
                    <List.Item key={w}>{w}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
            <Group justify="space-between">
              <Button variant="subtle" onClick={reset}>
                {t('import.otherFile')}
              </Button>
              <Button onClick={save} loading={commit.isPending} disabled={Boolean(nothing)}>
                {t('import.save')}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
