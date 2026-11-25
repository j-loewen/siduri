import { useRef, useState, type DragEvent } from 'react';
import { Loader, Menu, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconPhotoEdit, IconPhotoPlus, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { beerColorHex } from '@brew/brewcalc';
import { imageUrl, type ImageDto } from '@brew/shared';
import { uploadFile } from '../api';
import { resizeImage } from '../lib/image';
import { notifyError } from '../lib/notify';
import { ColorSwatch } from './recipe-ui';

/**
 * The recipe's beer colour; with a picture, the picture with the colour as a dot on its corner.
 */
export function RecipeThumb({ image, colorEbc, size = 40, radius = 8 }: { image: string | null | undefined; colorEbc: number; size?: number; radius?: number }) {
  if (!image) return <ColorSwatch ebc={colorEbc} size={Math.round(size * 0.7)} />;
  const dot = Math.max(11, Math.round(size * 0.42));
  return (
    <span style={{ position: 'relative', width: size, height: size, flex: 'none', display: 'block' }}>
      <img
        src={imageUrl(image)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: radius, display: 'block', background: 'var(--mantine-color-default-hover)' }}
      />
      <span className="recipe-thumb-color" style={{ width: dot, height: dot, background: beerColorHex(colorEbc) }} aria-hidden="true" />
    </span>
  );
}

/**
 * Picture of a recipe: click or drop a picture to add or change it. The picture is shrunk in the
 * browser before upload.
 */
export function RecipeImagePicker({ image, onChange, size = 84 }: { image: string | null; onChange: (id: string | null) => void; size?: number }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notifyError(new Error(t('recipe.image.notImage')));
      return;
    }
    setBusy(true);
    try {
      const small = await resizeImage(file);
      const saved = await uploadFile<ImageDto>('/api/images', small);
      onChange(saved.id);
    } catch (err) {
      notifyError(err);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void upload(e.dataTransfer.files[0]);
  };

  const box = (
    <UnstyledButton
      aria-label={image ? t('recipe.image.change') : t('recipe.image.add')}
      onClick={image ? undefined : () => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: image && !dragging ? '1px solid var(--mantine-color-default-border)' : '2px dashed var(--mantine-color-default-border)',
        background: dragging ? 'var(--mantine-primary-color-light)' : 'var(--mantine-color-default-hover)',
      }}
    >
      {busy ? (
        <Loader size="sm" />
      ) : image ? (
        <img src={imageUrl(image)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Stack gap={2} align="center">
          <IconPhotoPlus size={26} stroke={1.5} color="var(--mantine-color-dimmed)" />
          <Text size="xs" c="dimmed">
            {t('recipe.image.add')}
          </Text>
        </Stack>
      )}
    </UnstyledButton>
  );

  return (
    <>
      {image ? (
        <Menu position="bottom-start">
          <Menu.Target>{box}</Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconPhotoEdit size={16} />} onClick={() => input.current?.click()}>
              {t('recipe.image.change')}
            </Menu.Item>
            <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={() => onChange(null)}>
              {t('recipe.image.remove')}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      ) : (
        <Tooltip label={t('recipe.image.hint')}>{box}</Tooltip>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void upload(e.currentTarget.files?.[0]);
          e.currentTarget.value = '';
        }}
      />
    </>
  );
}
