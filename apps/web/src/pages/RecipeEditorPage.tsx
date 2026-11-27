import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ActionIcon, Alert, Button, Center, Group, Loader, Menu, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconAlertTriangle, IconCopy, IconDots, IconDownload, IconFlask2, IconRuler2, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { calculateRecipe } from '@brew/brewcalc';
import type { RecipeDto } from '@brew/shared';
import { ApiError, downloadFile } from '../api';
import { useNotifyDeleted, useTrashNote } from '../components/trash-ui';
import { useDeleteRecipe, useDuplicateRecipe, useRecipe, useSaveRecipe } from '../data';
import { recipeRoute } from '../router';
import { NewBatchModal } from '../components/NewBatchModal';
import { RecipeImagePicker } from '../components/RecipeImage';
import { RecipeMetaRow } from '../components/RecipeMeta';
import { ConflictAlert, RecipeBody, SaveIndicator, ScaleModal, useDocAutosave } from '../components/RecipeDocEditor';
import { notifyError } from '../lib/notify';

/** Size of the recipe picture; the name and the style/equipment row fill its height. */
const PICTURE_SIZE = 72;

export function RecipeEditorPage() {
  const { recipeId } = recipeRoute.useParams();
  const { t } = useTranslation();
  const recipe = useRecipe(recipeId);
  if (recipe.isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  if (recipe.isError || !recipe.data) {
    return (
      <Alert color="red" icon={<IconAlertTriangle size={18} />}>
        {recipe.error instanceof ApiError && recipe.error.status === 404 ? t('recipe.notFound') : t('errors.unknown')}
      </Alert>
    );
  }
  return <Editor key={recipeId} initial={recipe.data} />;
}

function Editor({ initial }: { initial: RecipeDto }) {
  const { t } = useTranslation();
  const trashNote = useTrashNote();
  const notifyDeleted = useNotifyDeleted();
  const navigate = useNavigate();
  const save = useSaveRecipe();
  const { doc, update, state, flush } = useDocAutosave(initial, (d, version) => save.mutateAsync({ id: initial.id, doc: d, version }));
  const calc = useMemo(() => calculateRecipe(doc), [doc]);
  const duplicate = useDuplicateRecipe();
  const remove = useDeleteRecipe();
  const [scaling, setScaling] = useState(false);
  const [brewing, setBrewing] = useState(false);

  const exportAs = async (format: 'beerxml' | 'beerjson') => {
    await flush();
    downloadFile(`/api/recipes/${initial.id}/export?format=${format}`, `${doc.name}.${format === 'beerxml' ? 'xml' : 'json'}`).catch(notifyError);
  };

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: t('recipe.delete.title'),
      children: <Text size="sm">{t('recipe.delete.text', { name: doc.name })}{' '}{trashNote}</Text>,
      labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        remove.mutate(initial.id, {
          onSuccess: () => {
            notifyDeleted('recipe', initial.id, doc.name, () => void navigate({ to: '/recipes/$recipeId', params: { recipeId: initial.id } }));
            void navigate({ to: '/recipes' });
          },
          onError: notifyError,
        }),
    });

  return (
    <Stack gap="md">
      {/* On phones the buttons wrap to their own line, so the name keeps its room. */}
      <Group justify="space-between" wrap="wrap" gap="sm" align="flex-start">
        <RecipeImagePicker image={doc.image} onChange={(image) => update((d) => ({ ...d, image }))} size={PICTURE_SIZE} />
        {/* Name at the top edge of the picture, style and equipment at its bottom edge. */}
        <Stack gap={6} justify="space-between" mih={PICTURE_SIZE} style={{ flex: '1 1 260px', minWidth: 0 }}>
          <TextInput
            value={doc.name}
            onChange={(e) => {
              const name = e.currentTarget.value;
              update((d) => ({ ...d, name: name.trim() ? name.slice(0, 120) : d.name }));
            }}
            variant="unstyled"
            size="xl"
            classNames={{ input: 'recipe-title' }}
            aria-label={t('fields.name')}
          />
          <RecipeMetaRow doc={doc} calc={calc} update={update} />
        </Stack>
        <Group gap={6} wrap="nowrap" ml="auto" style={{ alignSelf: 'center' }}>
          <SaveIndicator state={state} />
          <Button
            leftSection={<IconFlask2 size={18} />}
            onClick={async () => {
              await flush();
              setBrewing(true);
            }}
          >
            {t('batches.brewThis')}
          </Button>
          <Menu position="bottom-end" width={220}>
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label={t('common.more')}>
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconRuler2 size={16} />} onClick={() => setScaling(true)}>
                {t('recipe.scale.menu')}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconCopy size={16} />}
                onClick={async () => {
                  await flush();
                  duplicate.mutate(initial.id, { onSuccess: (r) => void navigate({ to: '/recipes/$recipeId', params: { recipeId: r.id } }), onError: notifyError });
                }}
              >
                {t('recipe.duplicate')}
              </Menu.Item>
              <Menu.Label>{t('recipe.export')}</Menu.Label>
              <Menu.Item leftSection={<IconDownload size={16} />} onClick={() => void exportAs('beerxml')}>
                BeerXML
              </Menu.Item>
              <Menu.Item leftSection={<IconDownload size={16} />} onClick={() => void exportAs('beerjson')}>
                BeerJSON
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={confirmDelete}>
                {t('common.delete')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <ConflictAlert state={state} />
      <RecipeBody doc={doc} calc={calc} update={update} />

      <ScaleModal opened={scaling} onClose={() => setScaling(false)} doc={doc} onScale={(next) => update(() => next)} />
      <NewBatchModal opened={brewing} onClose={() => setBrewing(false)} recipeId={initial.id} />
    </Stack>
  );
}
