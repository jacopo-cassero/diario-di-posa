// Piccolo generatore di PDF senza librerie esterne: testo Helvetica, linee,
// riquadri e immagini JPEG. Coordinate in millimetri, origine in alto a sinistra.
import { WIDTHS } from './pdf-metrics.js';

const PT = 72 / 25.4;
const FONTS = { normal: ['F1', 'Helvetica'], bold: ['F2', 'Helvetica-Bold'], italic: ['F3', 'Helvetica-Oblique'] };
const WIN = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F };
const SOST = { ' ': ' ', ' ': ' ', ' ': ' ', '−': '-', '‐': '-', '‑': '-', '­': '' };

/** Converte un testo nei codici WinAnsi (i caratteri non rappresentabili diventano "?"). */
export function codici(str) {
  const out = [];
  for (let ch of String(str ?? '')) {
    if (ch in SOST) { ch = SOST[ch]; if (!ch) continue; }
    const c = ch.codePointAt(0);
    if (WIN[ch]) out.push(WIN[ch]);
    else if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff)) out.push(c);
    else if (c === 9) out.push(32);
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const b = base.codePointAt(0);
      out.push(b && b >= 0x20 && b <= 0x7e ? b : 63);
    }
  }
  return out;
}
const hexCol = h => { const s = String(h).replace('#', ''); return [0, 2, 4].map(i => (parseInt(s.slice(i, i + 2), 16) / 255).toFixed(3)).join(' '); };
const f = n => (Math.round(n * 100) / 100).toString();

/** Dimensioni e componenti colore di un JPEG. */
export function infoJpeg(bytes) {
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const m = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8], comp: bytes[i + 9] };
    }
    i += 2 + len;
  }
  throw new Error('JPEG non valido');
}

export class PDF {
  constructor() { this.pages = []; this.images = []; this.W = 210; this.H = 297; this.addPage(); }
  addPage() { this.cur = { ops: [], imgs: new Set() }; this.pages.push(this.cur); return this; }
  get pageNo() { return this.pages.length; }
  setPage(n) { this.cur = this.pages[n - 1]; }

  width(str, size = 10, font = 'normal') {
    const w = WIDTHS[FONTS[font][1]];
    return codici(str).reduce((s, c) => s + (w[c] || 500), 0) * size / 1000 / PT;
  }
  /** Divide un testo in righe che stanno nella larghezza indicata (mm). */
  wrap(str, maxW, size = 10, font = 'normal') {
    const lines = [];
    for (const par of String(str ?? '').split(/\r?\n/)) {
      if (!par.trim()) { lines.push(''); continue; }
      let line = '';
      for (const word of par.split(/\s+/).filter(Boolean)) {
        const t = line ? line + ' ' + word : word;
        if (this.width(t, size, font) <= maxW) { line = t; continue; }
        if (line) lines.push(line);
        if (this.width(word, size, font) <= maxW) { line = word; continue; }
        let part = '';
        for (const ch of word) { if (this.width(part + ch, size, font) > maxW) { lines.push(part); part = ch; } else part += ch; }
        line = part;
      }
      lines.push(line);
    }
    return lines;
  }
  text(x, y, str, { size = 10, font = 'normal', color = '#000000', align = 'left' } = {}) {
    const cs = codici(str); if (!cs.length) return;
    let xx = x;
    if (align !== 'left') { const w = this.width(str, size, font); xx = align === 'right' ? x - w : x - w / 2; }
    const esc = cs.map(c => c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c < 32 || c > 126 ? '\\' + c.toString(8).padStart(3, '0') : String.fromCharCode(c)).join('');
    this.cur.ops.push(`BT /${FONTS[font][0]} ${f(size)} Tf ${hexCol(color)} rg ${f(xx * PT)} ${f((this.H - y) * PT)} Td (${esc}) Tj ET`);
  }
  /** Testo su più righe; restituisce la y sotto l'ultima riga. */
  paragraph(x, y, str, maxW, { size = 10, font = 'normal', color = '#000000', lead = 1.35, align = 'left' } = {}) {
    const lh = size * lead / PT;
    for (const l of this.wrap(str, maxW, size, font)) { this.text(align === 'right' ? x + maxW : x, y, l, { size, font, color, align }); y += lh; }
    return y;
  }
  line(x1, y1, x2, y2, { color = '#000000', width = 0.2 } = {}) {
    this.cur.ops.push(`${hexCol(color)} RG ${f(width * PT)} w ${f(x1 * PT)} ${f((this.H - y1) * PT)} m ${f(x2 * PT)} ${f((this.H - y2) * PT)} l S`);
  }
  rect(x, y, w, h, { fill = null, stroke = null, width = 0.2 } = {}) {
    const r = `${f(x * PT)} ${f((this.H - y - h) * PT)} ${f(w * PT)} ${f(h * PT)} re`;
    if (fill && stroke) this.cur.ops.push(`${hexCol(fill)} rg ${hexCol(stroke)} RG ${f(width * PT)} w ${r} B`);
    else if (fill) this.cur.ops.push(`${hexCol(fill)} rg ${r} f`);
    else if (stroke) this.cur.ops.push(`${hexCol(stroke)} RG ${f(width * PT)} w ${r} S`);
  }
  /** Registra un JPEG (Uint8Array) e restituisce il suo nome. */
  addJpeg(bytes) {
    const info = infoJpeg(bytes);
    const name = 'Im' + (this.images.length + 1);
    this.images.push({ name, bytes, ...info });
    return name;
  }
  image(name, x, y, w, h) {
    const img = this.images.find(i => i.name === name); if (!img) return;
    if (h == null) h = w * img.h / img.w;
    if (w == null) w = h * img.w / img.h;
    this.cur.imgs.add(name);
    this.cur.ops.push(`q ${f(w * PT)} 0 0 ${f(h * PT)} ${f(x * PT)} ${f((this.H - y - h) * PT)} cm /${name} Do Q`);
    return { w, h };
  }

  /** Restituisce il PDF come Uint8Array. */
  output({ title = '', author = '' } = {}) {
    const enc = s => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; };
    const parts = []; let len = 0; const offs = [];
    const push = p => { const b = typeof p === 'string' ? enc(p) : p; parts.push(b); len += b.length; };
    const pstr = s => '(' + codici(s).map(c => c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c > 126 ? '\\' + c.toString(8).padStart(3, '0') : String.fromCharCode(c)).join('') + ')';
    // numerazione oggetti: 1 catalogo, 2 pagine, 3-5 font, 6 info, poi immagini, poi pagine+contenuti
    const imgBase = 7, pageBase = imgBase + this.images.length;
    const objs = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[2] = `<< /Type /Pages /Kids [${this.pages.map((_, i) => `${pageBase + i * 2} 0 R`).join(' ')}] /Count ${this.pages.length} >>`;
    Object.values(FONTS).forEach(([, base], i) => { objs[3 + i] = `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`; });
    objs[6] = `<< /Title ${pstr(title)} /Author ${pstr(author)} /Producer (Diario di Posa) >>`;
    const fontRes = Object.values(FONTS).map(([n], i) => `/${n} ${3 + i} 0 R`).join(' ');
    this.pages.forEach((p, i) => {
      const xo = [...p.imgs].map(n => `/${n} ${imgBase + this.images.findIndex(im => im.name === n)} 0 R`).join(' ');
      objs[pageBase + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(this.W * PT)} ${f(this.H * PT)}] /Resources << /Font << ${fontRes} >>${xo ? ` /XObject << ${xo} >>` : ''} >> /Contents ${pageBase + i * 2 + 1} 0 R >>`;
      const content = p.ops.join('\n');
      objs[pageBase + i * 2 + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    });
    const total = pageBase + this.pages.length * 2 - 1;
    push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    for (let n = 1; n <= total; n++) {
      offs[n] = len;
      const img = n >= imgBase && n < pageBase ? this.images[n - imgBase] : null;
      if (img) {
        const cs = img.comp === 1 ? '/DeviceGray' : img.comp === 4 ? '/DeviceCMYK' : '/DeviceRGB';
        push(`${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode${img.comp === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : ''} /Length ${img.bytes.length} >>\nstream\n`);
        push(img.bytes); push('\nendstream\nendobj\n');
      } else push(`${n} 0 obj\n${objs[n]}\nendobj\n`);
    }
    const xref = len;
    let x = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= total; n++) x += String(offs[n]).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer\n<< /Size ${total + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
}
