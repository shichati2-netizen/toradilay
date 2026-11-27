"use client";

import { useEffect, useRef, useState } from "react";
import { FileWarning } from "lucide-react";

const PAGE_WIDTH = 360;
const previewCache = new Map<string, string>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Downloads a PDF as bytes and extracts its text with PDF.js in the browser.
 * It deliberately never opens a PDF URL in an iframe/window or invokes the
 * browser's native PDF viewer.
 */
export async function extractPdfTextHtmlFromUrl(
  url: string,
  maxPages = 30,
): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("חילוץ PDF זמין רק בחלון התוכנה.");
  }

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("לא ניתן לטעון את קובץ ה-PDF (" + response.status + ").");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 8) {
    throw new Error("קובץ ה-PDF ריק או פגום.");
  }

  const header = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!header.includes("%PDF-")) {
    throw new Error("השרת לא החזיר קובץ PDF תקין.");
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("/pdf.worker.mjs", window.location.origin).toString();

  const loadingTask = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
    cMapUrl: new URL("/pdfjs/cmaps/", window.location.origin).toString(),
    cMapPacked: true,
    standardFontDataUrl: new URL("/pdfjs/standard_fonts/", window.location.origin).toString(),
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  try {
    const pageLimit = Math.min(Math.max(1, Math.floor(maxPages)), pdf.numPages);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const lines: Array<{ y: number; text: string }> = [];

        for (const item of content.items) {
          if (!("str" in item) || typeof item.str !== "string" || !item.str.trim()) continue;
          const y = "transform" in item && Array.isArray(item.transform)
            ? Math.round(Number(item.transform[5]) || 0)
            : 0;
          const existing = lines.find((line) => Math.abs(line.y - y) <= 3);
          if (existing) existing.text += " " + item.str;
          else lines.push({ y, text: item.str });
        }

        lines.sort((a, b) => b.y - a.y);
        const body = lines
          .map((line) => "<p>" + escapeHtml(line.text.trim()) + "</p>")
          .join("");

        pages.push(
          '<section class="pdf-text-page" dir="auto">' +
            (body || "<p>לא נמצא טקסט קריא בעמוד זה.</p>") +
          "</section>",
        );
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await pdf.destroy();
  }

  const html = pages.join('<div class="pdf-page-separator"></div>');
  if (!html.trim()) {
    return "<p>לא נמצא טקסט קריא בקובץ PDF. ייתכן שמדובר בסריקה כתמונה.</p>";
  }
  return html;
}

export function PdfTextPreview({
  src,
  className = "h-72 w-full",
  title = "תצוגה מקדימה של PDF",
}: {
  src: string;
  className?: string;
  title?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(previewCache.get(src) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    const update = () => setScale(element.clientWidth / PAGE_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (previewCache.has(src)) {
      setHtml(previewCache.get(src) ?? null);
      return;
    }
    let cancelled = false;
    setHtml(null);
    setError(null);

    void extractPdfTextHtmlFromUrl(src, 1)
      .then((result) => {
        if (cancelled) return;
        previewCache.set(src, result);
        setHtml(result);
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "חילוץ הטקסט מה-PDF נכשל.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <div
      ref={boxRef}
      role="img"
      aria-label={title}
      className={"paper pointer-events-none relative overflow-hidden rounded-xl " + className}
    >
      {html ? (
        <>
          <div
            className="docx-content-page absolute right-0 top-0 origin-top-right"
            style={{
              width: PAGE_WIDTH,
              minHeight: 500,
              padding: "24px 26px",
              fontSize: 16,
              transform: `scale(${scale})`,
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#fffdf8] via-[#fffdf8]/85 to-transparent" />
        </>
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-100 px-4 text-center text-slate-500">
          <FileWarning className="h-8 w-8" />
          <span className="text-xs font-semibold">{error}</span>
        </div>
      ) : (
        <div className="flex h-full flex-col gap-2.5 bg-white p-4" aria-label="מחלץ טקסט מה-PDF">
          <div className="h-3 w-2/5 self-center animate-pulse rounded-full bg-slate-200" />
          {[100, 92, 96, 88, 94, 70, 90, 84].map((width, index) => (
            <div
              key={index}
              className="h-2 animate-pulse rounded-full bg-slate-200"
              style={{ width: width + "%", animationDelay: index * 90 + "ms" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
