const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export const MINIMUM_TEXT_CONTRAST = 4.5;

function rgb(color: string) {
  if (!HEX_COLOR.test(color)) return null;
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  };
}

function linearChannel(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string) {
  const value = rgb(color);
  if (!value) return null;
  return 0.2126 * linearChannel(value.r)
    + 0.7152 * linearChannel(value.g)
    + 0.0722 * linearChannel(value.b);
}

export function contrastRatio(first: string, second: string) {
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  if (firstLuminance === null || secondLuminance === null) return 0;
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function assessAccentPalette({
  accent,
  background,
  surface,
}: {
  accent: string;
  background: string;
  surface: string;
}) {
  const lightText = "#ffffff";
  const darkText = "#171b18";
  const lightTextRatio = contrastRatio(accent, lightText);
  const darkTextRatio = contrastRatio(accent, darkText);
  const accentText = lightTextRatio >= darkTextRatio ? lightText : darkText;
  const backgroundRatio = contrastRatio(accent, background);
  const surfaceRatio = contrastRatio(accent, surface);
  const accentTextRatio = Math.max(lightTextRatio, darkTextRatio);

  return {
    accentText,
    backgroundRatio,
    surfaceRatio,
    accentTextRatio,
    safe: [backgroundRatio, surfaceRatio, accentTextRatio]
      .every((ratio) => ratio >= MINIMUM_TEXT_CONTRAST),
  };
}

export function resolveAccessibleAccentPalette(input: {
  accent: string;
  background: string;
  surface: string;
}) {
  const candidates = [input.accent, "#7f3127", "#171b18", "#ffffff"];
  for (const accent of candidates) {
    const assessment = assessAccentPalette({ ...input, accent });
    if (assessment.safe) {
      return {
        ...assessment,
        accent,
        adjusted: accent.toLowerCase() !== input.accent.toLowerCase(),
      };
    }
  }

  const assessment = assessAccentPalette(input);
  return { ...assessment, accent: input.accent, adjusted: false };
}

export function formatContrast(ratio: number) {
  return `${ratio.toFixed(1)}:1`;
}
