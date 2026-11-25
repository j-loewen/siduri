/** Pictures (recipe logos). The browser shrinks them before upload; the server checks type and size. */
export const IMAGE_TYPES = ['image/webp', 'image/jpeg', 'image/png', 'image/gif'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** Largest accepted upload (already resized pictures are far smaller). */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Longest side pictures are resized to before upload. */
export const IMAGE_MAX_SIDE = 512;

export interface ImageDto {
  id: string;
  type: ImageType;
  bytes: number;
}

export const imageUrl = (id: string) => `/api/images/${id}`;
