import { ebcToSrm, lovibondToSrm, srmToEbc } from '@brew/shared';

/**
 * Beer colour (EBC) from the grain bill, Morey's equation:
 * MCU = Σ(lb × colour) / gal, SRM = 1.4922 × MCU^0.6859.
 *
 * The malt colour goes in as SRM, taken to be equal to °Lovibond, as Brewfather and most brewing
 * tools do. (Converting SRM to °L first would make dark grists ~20% lighter than those tools show.)
 */
export function moreyEbc(items: { amountKg: number; colorEbc: number }[], volumeL: number): number {
  if (volumeL <= 0) return 0;
  let mcu = 0;
  for (const it of items) {
    const color = Math.max(0, ebcToSrm(it.colorEbc));
    mcu += (it.amountKg * 2.20462262 * color) / (volumeL * 0.264172052);
  }
  return mcu > 0 ? srmToEbc(1.4922 * mcu ** 0.6859) : 0;
}

/**
 * Approximate on-screen colour (hex) of a beer of this colour, for swatches. Interpolated from a
 * common SRM colour table (pale straw to black).
 */
const SRM_RGB: [number, [number, number, number]][] = [
  [1, [255, 230, 153]],
  [2, [255, 216, 120]],
  [3, [255, 202, 90]],
  [4, [255, 191, 66]],
  [6, [251, 177, 35]],
  [8, [234, 143, 0]],
  [10, [222, 124, 0]],
  [13, [207, 105, 0]],
  [17, [187, 81, 0]],
  [20, [166, 62, 0]],
  [24, [142, 41, 0]],
  [29, [119, 26, 0]],
  [35, [91, 13, 0]],
  [40, [69, 6, 0]],
  [50, [38, 2, 0]],
  [70, [16, 1, 0]],
];

export function beerColorHex(colorEbc: number): string {
  const srm = Math.max(0, ebcToSrm(colorEbc));
  let rgb = SRM_RGB[SRM_RGB.length - 1]![1];
  if (srm <= SRM_RGB[0]![0]) rgb = SRM_RGB[0]![1];
  else {
    for (let i = 1; i < SRM_RGB.length; i++) {
      const [s1, c1] = SRM_RGB[i]!;
      const [s0, c0] = SRM_RGB[i - 1]!;
      if (srm <= s1) {
        const t = (srm - s0) / (s1 - s0);
        rgb = [0, 1, 2].map((k) => Math.round(c0[k]! + (c1[k]! - c0[k]!) * t)) as [number, number, number];
        break;
      }
    }
  }
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export { lovibondToSrm };
