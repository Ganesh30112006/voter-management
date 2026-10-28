import { describe, expect, it } from 'vitest';
import type { PdfTextItem } from './pdfLayout';
import { placeGlyphPieces, unmappedGlyphTexts, withoutAddedSpaces, type ShownGlyph } from './teluguGlyphs';

const FONT = 'DAAAAA+NirmalaUI';
/** Glyphs the PDF does give text for (ం = 1663), so the Nirmala table is trusted. */
const known: ShownGlyph[] = Array.from({ length: 12 }, () => ({ font: FONT, gid: 1663, unicode: 'ం' }));
const blank = (gid: number, font = FONT): ShownGlyph => ({ font, gid, unicode: '\0' });
const item = (str: string, x: number, y = 100): PdfTextItem => ({ str, x, y, width: 5, size: 8 });

/** Replaces each NUL in the item texts with the looked-up piece, as the PDF reader does. */
function fill(texts: string[], pieces: string[]): string[] {
  let k = 0;
  return texts.map((t) => t.replace(/\0/g, () => pieces[k++]));
}

describe('Telugu letters printed without text (Nirmala UI)', () => {
  it('looks up glyphs only when the page agrees with the font table', () => {
    // 2344 = ్డ (below-base), 2356 = ్ర (ra-vattu), 2245 = సీ.
    const pieces = unmappedGlyphTexts([...known, blank(2344), blank(2356), blank(2245)]);
    expect(pieces).toHaveLength(3);
    expect(pieces[2]).toBe('సీ');
    // Another font, or a page whose glyphs disagree with the table (a different font version): left blank.
    expect(unmappedGlyphTexts([...known, blank(2344, 'EAAAAA+Tahoma')])).toEqual(['']);
    const disagree = known.map((g) => ({ ...g, unicode: 'అ' }));
    expect(unmappedGlyphTexts([...disagree, blank(2344)])).toEqual(['']);
  });

  it('puts below-base forms and the ra-vattu back in Unicode order', () => {
    const pieces = unmappedGlyphTexts([...known, blank(2344), blank(2356), blank(2357), blank(2347), blank(2353)]);
    const texts = fill(['రె', 'డి\0', ' ', '\0శీ', '\0', 'సీ', '\0', 'లి', ' ', '\0'], pieces);
    const out = placeGlyphPieces(texts.map((t, i) => item(t, i * 10)));
    // రెడ్డి, శ్రీ, స్త్రీ (ra-vattu drawn first, ్త after), and ల్లి across a space item.
    expect(out.map((i) => i.str).join('|')).toBe('రె|డ్డి| |శ్రీ|స్త్రీ|ల్లి| ');
  });

  it('removes the spaces pdf.js adds inside words and keeps the drawn ones', () => {
    const drawn = (s: string[]) => s.map((unicode) => ({ font: FONT, gid: 0, unicode }));
    expect(withoutAddedSpaces(['వెం', ' ', 'కట', ' ఉష'], drawn(['వెం', 'కట', ' ', 'ఉష']))).toEqual(['వెం', '', 'కట', ' ఉష']);
    // A drawn space that pdf.js left out comes back.
    expect(withoutAddedSpaces(['ఓటరు', 'పేరు'], drawn(['ఓటరు', ' ', 'పేరు']))).toEqual(['ఓటరు', ' పేరు']);
    // Text that does not match the drawn glyphs: nothing is changed.
    expect(withoutAddedSpaces(['వెం', 'కట'], drawn(['వెం', ' ', 'ఉష']))).toBeNull();
  });
});
