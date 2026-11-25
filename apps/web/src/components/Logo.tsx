import { Group, Text } from '@mantine/core';
import { APP_NAME, imageUrl } from '@brew/shared';
import { useSettings } from '../data';

/** A beer glass with foam. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#e39500" />
      <path d="M18 22h24l-2.4 30a4 4 0 0 1-4 3.7H24.4a4 4 0 0 1-4-3.7z" fill="#ffd67a" />
      <path d="M20.2 32h19.6l-1.6 20a2.5 2.5 0 0 1-2.5 2.3H24.3a2.5 2.5 0 0 1-2.5-2.3z" fill="#f6a800" />
      <path d="M42 27h4a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5h-5" fill="none" stroke="#fff4dc" strokeWidth="3.5" />
      <path d="M16.5 22a6 6 0 0 1 5.7-7.8 7.5 7.5 0 0 1 13.5-1 6 6 0 0 1 8 6.3 4.6 4.6 0 0 1-.7 2.5z" fill="#fffaf0" />
      <circle cx="27" cy="40" r="1.6" fill="#ffe9b0" />
      <circle cx="33" cy="46" r="1.2" fill="#ffe9b0" />
      <circle cx="30" cy="35" r="1" fill="#ffe9b0" />
    </svg>
  );
}

export function Logo({ height = 30 }: { height?: number }) {
  return (
    <Group gap={8} wrap="nowrap">
      <LogoMark size={height} />
      <Text fw={700} fz={height * 0.62} lh={1.2} style={{ letterSpacing: '-0.01em' }}>
        {APP_NAME}
      </Text>
    </Group>
  );
}

/**
 * The brewery's own logo and name when set (Settings → Brewery), otherwise the app's logo.
 * Used in the header of the signed-in app.
 */
export function BreweryBrand({ height = 30 }: { height?: number }) {
  const settings = useSettings();
  const logo = settings.data?.breweryLogo;
  const name = settings.data?.breweryName?.trim();
  if (!logo && !name) return <Logo height={height} />;
  return (
    <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
      {logo ? <BreweryLogo id={logo} size={height} /> : <LogoMark size={height} />}
      {/* Line height above 1: with truncation (overflow hidden), descenders like the "y" would be cut off. */}
      <Text fw={700} fz={height * 0.55} lh={1.3} truncate style={{ letterSpacing: '-0.01em', maxWidth: '40vw' }}>
        {name || APP_NAME}
      </Text>
    </Group>
  );
}

export function BreweryLogo({ id, size }: { id: string; size: number }) {
  return (
    <img
      src={imageUrl(id)}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', borderRadius: Math.round(size * 0.2), flex: 'none', display: 'block' }}
    />
  );
}
