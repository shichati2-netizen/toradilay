/**
 * Refractive Liquid Glass for Chromium/Electron controls.
 *
 * The SVG displacement-map technique is adapted from "liquid-glass" by
 * Nikita Stadnik (https://github.com/nikdelvin/liquid-glass), MIT License.
 * See THIRD_PARTY_NOTICES.md for the full notice.
 *
 * Chromium builds that support SVG URLs in backdrop-filter get real backdrop
 * displacement. Other engines keep the CSS blur/saturation fallback.
 */

type DisplacementOptions = {
  height: number;
  width: number;
  radius: number;
  depth: number;
  strength: number;
  chromaticAberration: number;
  precision: number;
};

const filterCache = new Map<string, string>();
const REFRACTIVE_SELECTORS = [
  ".btn-ghost",
  ".btn-navy",
  ".btn-key",
  ".inset-field",
  ":scope > header > div:first-child",
  ":scope > footer",
].join(",");

function svgData(svg: string): string {
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function getDisplacementMap({ height, width, radius, depth, precision }: DisplacementOptions): string {
  const top = Math.max(0, Math.min(48, Math.ceil((radius / Math.max(height, 1)) * 15)));
  const left = Math.max(0, Math.min(48, Math.ceil((radius / Math.max(width, 1)) * 15)));
  const innerHeight = Math.max(1, height - 2 * depth);
  const innerWidth = Math.max(1, width - 2 * depth);
  return svgData(`<svg height="${height}" width="${width}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="Y" x1="0" x2="0" y1="${top}%" y2="${100-top}%">
        <stop offset="0%" stop-color="#0F0"/><stop offset="100%" stop-color="#000"/>
      </linearGradient>
      <linearGradient id="X" x1="${left}%" x2="${100-left}%" y1="0" y2="0">
        <stop offset="0%" stop-color="#F00"/><stop offset="100%" stop-color="#000"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="#808080"/>
    <g filter="blur(${Math.max(0.5, 2 - precision * 0.015).toFixed(2)}px)">
      <rect width="${width}" height="${height}" fill="#000080"/>
      <rect width="${width}" height="${height}" fill="url(#Y)"/>
      <rect width="${width}" height="${height}" fill="url(#X)"/>
      <rect x="${depth}" y="${depth}" width="${innerWidth}" height="${innerHeight}"
        fill="#808080" rx="${Math.min(radius, Math.min(innerHeight, innerWidth) / 2)}"
        ry="${Math.min(radius, Math.min(innerHeight, innerWidth) / 2)}" filter="blur(${depth}px)"/>
    </g>
  </svg>`);
}

function getDisplacementFilter(options: DisplacementOptions): string {
  const { height, width, strength, chromaticAberration } = options;
  const key = [height, width, options.radius, options.depth, strength, chromaticAberration, options.precision].join(":");
  const cached = filterCache.get(key);
  if (cached) return cached;

  const map = getDisplacementMap(options);
  const svg = `<svg height="${height}" width="${width}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="displace" color-interpolation-filters="sRGB">
        <feImage x="0" y="0" height="${height}" width="${width}" href="${map}" result="displacementMap"/>
        <feDisplacementMap in="SourceGraphic" in2="displacementMap" scale="${strength + chromaticAberration * 2}" xChannelSelector="R" yChannelSelector="G"/>
        <feColorMatrix type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="displacedR"/>
        <feDisplacementMap in="SourceGraphic" in2="displacementMap" scale="${strength + chromaticAberration}" xChannelSelector="R" yChannelSelector="G"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="displacedG"/>
        <feDisplacementMap in="SourceGraphic" in2="displacementMap" scale="${strength}" xChannelSelector="R" yChannelSelector="G"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="displacedB"/>
        <feBlend in="displacedR" in2="displacedG" mode="screen"/>
        <feBlend in2="displacedB" mode="screen"/>
      </filter>
    </defs>
  </svg>`;
  const uri = `url("${svgData(svg)}#displace")`;
  if (filterCache.size >= 80) filterCache.clear();
  filterCache.set(key, uri);
  return uri;
}

function supportsBackdropFilterUrl(): boolean {
  if (typeof CSS === "undefined" || typeof document === "undefined") return false;
  const probe = document.createElement("div");
  probe.style.backdropFilter = 'url("#liquid-glass-test")';
  const standard = probe.style.backdropFilter.includes("url");
  probe.style.setProperty("-webkit-backdrop-filter", 'url("#liquid-glass-test")');
  const webkit = probe.style.getPropertyValue("-webkit-backdrop-filter").includes("url");
  return standard || webkit;
}

export function applyLiquidGlassRefraction(root: HTMLElement, intensity: number, shapePrecision = 78): () => void {
  if (!supportsBackdropFilterUrl() || typeof ResizeObserver === "undefined") return () => {};

  const observers = new Map<Element, ResizeObserver>();
  let closed = false;

  const updateElement = (element: Element) => {
    if (!(element instanceof HTMLElement) || closed) return;
    const rect = element.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width < 2 || height < 2) return;

    const computed = getComputedStyle(element);
    const parsedRadius = Number.parseFloat(computed.borderTopLeftRadius) || 0;
    const radius = Math.round(Math.min(parsedRadius, Math.min(width, height) / 2));
    const precision = Math.max(0, Math.min(100, shapePrecision));
    const depth = Math.max(2, Math.min(8, Math.round(Math.min(width, height) * (0.09 - precision * 0.00055))));
    const strength = Math.round(18 + Math.max(0, Math.min(100, intensity)) * 0.18);
    const chromaticAberration = Math.max(0.5, Math.min(1.35, intensity / 75));
    const url = getDisplacementFilter({ height, width, radius, depth, strength, chromaticAberration, precision });
    const value = `blur(1px) ${url} blur(4px) saturate(180%) brightness(1.035)`;
    element.style.setProperty("backdrop-filter", value);
    element.style.setProperty("-webkit-backdrop-filter", value);
    element.setAttribute("data-liquid-glass-refraction", "true");
  };

  const attach = (element: Element) => {
    if (observers.has(element) || !(element instanceof HTMLElement)) return;
    const observer = new ResizeObserver(() => updateElement(element));
    observers.set(element, observer);
    observer.observe(element);
    updateElement(element);
  };

  const scan = () => {
    if (closed) return;
    root.querySelectorAll(REFRACTIVE_SELECTORS).forEach(attach);
  };
  scan();

  const mutation = new MutationObserver((records) => {
    if (records.some((record) => record.addedNodes.length > 0 || record.removedNodes.length > 0)) {
      scan();
      for (const [element, observer] of observers) {
        if (!root.contains(element)) {
          observer.disconnect();
          observers.delete(element);
          element.removeAttribute("data-liquid-glass-refraction");
          if (element instanceof HTMLElement) {
            element.style.removeProperty("backdrop-filter");
            element.style.removeProperty("-webkit-backdrop-filter");
          }
        }
      }
    }
  });
  mutation.observe(root, { childList: true, subtree: true });

  return () => {
    closed = true;
    mutation.disconnect();
    for (const [element, observer] of observers) {
      observer.disconnect();
      element.removeAttribute("data-liquid-glass-refraction");
      if (element instanceof HTMLElement) {
        element.style.removeProperty("backdrop-filter");
        element.style.removeProperty("-webkit-backdrop-filter");
      }
    }
    observers.clear();
  };
}
