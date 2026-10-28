import { NIRMALA_TELUGU } from './nirmalaTelugu';
import type { PdfTextItem } from './pdfLayout';

/**
 * A browser that prints a Telugu page as PDF (Chrome on Windows, font Nirmala UI) gives many conjunct glyphs no
 * text: pdf.js reads them as NUL, and names lose letters (రెడ్డి came out as "రె డి"). The glyph numbers are
 * still in the PDF, so those glyphs are looked up in the Nirmala UI glyph table and put back in Unicode order.
 */

/** A glyph drawn on the page, in content order (from the pdf.js operator list). */
export interface ShownGlyph {
  /** Font name as embedded, e.g. "BAAAAA+NirmalaUI-Bold". */
  font: string;
  /** Glyph number (the character code of an Identity-H font). */
  gid: number;
  /** Text pdf.js found for the glyph; "\0" when the PDF gives none. */
  unicode: string;
}

const VIRAMA = '\u0c4d';
const RA_VATTU = '\u0c4d\u0c30';
/** Stand-ins inside item text until the pieces are placed: the ra-vattu (drawn before its syllable) and below-base forms. */
const PRE = '\ue000';
const BELOW_OPEN = '\ue001';
const BELOW_CLOSE = '\ue002';
const CONSONANT = /[\u0c15-\u0c39\u0c58-\u0c5a]/;

const isNirmala = (font: string) => /^(?:[A-Z]{6}\+)?Nirmala(?:UI|Text)/.test(font);

/**
 * Text for each glyph pdf.js read as NUL, in content order ('' when unknown). The table is used only when the
 * page's other Nirmala glyphs agree with it, so a PDF made with a different version of the font is left as it was.
 */
export function unmappedGlyphTexts(glyphs: ShownGlyph[]): string[] {
  let checked = 0;
  let agree = 0;
  for (const g of glyphs) {
    const known = NIRMALA_TELUGU[g.gid];
    if (!isNirmala(g.font) || known === undefined || !g.unicode || g.unicode === '\0') continue;
    checked++;
    if (g.unicode.normalize('NFC') === known) agree++;
  }
  const trusted = checked >= 10 && agree >= checked * 0.95;
  return glyphs
    .filter((g) => g.unicode === '\0')
    .map((g) => {
      const text = trusted && isNirmala(g.font) ? NIRMALA_TELUGU[g.gid] : undefined;
      if (!text) return '';
      if (text === RA_VATTU) return PRE;
      return text.startsWith(VIRAMA) ? BELOW_OPEN + text + BELOW_CLOSE : text;
    });
}

/**
 * pdf.js adds spaces where drawn pieces of text leave a gap; with Nirmala UI such gaps fall inside words
 * ("వెం కట"). When every glyph is drawn, real spaces included (as browsers print), the item texts are matched
 * against the drawn glyphs and the added spaces are removed. Null when they do not match.
 */
export function withoutAddedSpaces(texts: string[], glyphs: ShownGlyph[]): string[] | null {
  const drawn = glyphs.map((g) => g.unicode).join('');
  if (!drawn.includes(' ')) return null;
  let p = 0;
  const out: string[] = [];
  for (const text of texts) {
    let kept = '';
    for (const c of text) {
      // pdf.js also leaves out some drawn spaces; those are put back.
      if (!drawn.startsWith(c, p) && /\s/.test(drawn[p] ?? '')) {
        while (/\s/.test(drawn[p] ?? '')) p++;
        if (drawn.startsWith(c, p)) kept += ' ';
      }
      if (drawn.startsWith(c, p)) {
        p += c.length;
        kept += c;
      } else if (!/\s/.test(c)) {
        return null;
      }
    }
    out.push(kept);
  }
  return drawn.slice(p).trim() === '' ? out : null;
}

/** Puts a below-base form (్డ) after the syllable's consonants, before its vowel signs and a ra-vattu. */
function addBelow(text: string, below: string): string {
  const tail = text.match(/(?:\u0c4d\u0c30)?[\u0c00-\u0c03\u0c3e-\u0c56]*$/)![0];
  const at = text.length - tail.length;
  return text.slice(0, at) + below + text.slice(at);
}

/**
 * Places the looked-up pieces (marked by `unmappedGlyphTexts`) in Unicode order. Items are in content order. A
 * below-base form is drawn after its syllable, possibly as an item of its own, and joins the syllable before it;
 * a ra-vattu is drawn before its syllable and joins the next one ("్ర" + "శీ" = "శ్రీ").
 */
export function placeGlyphPieces(items: PdfTextItem[]): PdfTextItem[] {
  const out: PdfTextItem[] = [];
  let pending: { y: number; size: number } | null = null;
  const sameLine = (a: { y: number; size: number }, b: { y: number; size: number }) => Math.abs(a.y - b.y) <= Math.max(a.size, b.size) * 0.6;
  for (const item of items) {
    if (!/[\ue000\ue001]/.test(item.str) && !pending) {
      out.push(item);
      continue;
    }
    if (pending && !sameLine(pending, item)) pending = null;
    let text = '';
    const s = item.str;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === PRE) {
        pending = item;
      } else if (c === BELOW_OPEN) {
        const end = s.indexOf(BELOW_CLOSE, i);
        const below = s.slice(i + 1, end);
        i = end;
        // The syllable before, skipping space items between them.
        let back = out.length - 1;
        while (back > 0 && !out[back].str.trim() && sameLine(out[back], item)) back--;
        const prev = out[back];
        if (CONSONANT.test(text)) text = addBelow(text, below);
        else if (prev && sameLine(prev, item) && CONSONANT.test(prev.str)) {
          prev.str = addBelow(prev.str, below);
          prev.width = Math.max(prev.width, item.x + item.width - prev.x);
        }
      } else if (pending && CONSONANT.test(c)) {
        // The syllable's consonants (క, or క్ష), then the ra-vattu, then its vowel signs.
        let j = i + 1;
        while (s[j] === VIRAMA && CONSONANT.test(s[j + 1] ?? '')) j += 2;
        text += s.slice(i, j) + RA_VATTU;
        pending = null;
        i = j - 1;
      } else if (c !== BELOW_CLOSE) {
        text += c;
      }
    }
    if (text) out.push({ ...item, str: text });
  }
  return out;
}
