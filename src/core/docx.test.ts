// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildDocx, documentXml, xmlText } from './docx';
import { crc32, readZip } from './zip';

const text = '朝、学校に着いたら、まず教室であいさつをします。\n　かばんを  決められた場所に置きます。\tタブ\n\n<最後>は&で終わる';

describe('Word（.docx）の作成', () => {
  it('ZIP の照合値（CRC-32）は標準の値と一致する', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('Word が開くのに必要な部品（目録・関係・本文・書式）がそろい、壊れていない ZIP になる', () => {
    const zip = buildDocx('朝の準備', text, new Date('2026-10-14T03:00:00Z'));
    // ZIP の先頭はローカルヘッダー（PK\x03\x04）
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const files = readZip(zip);
    expect(files.map((f) => f.name)).toEqual(['[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'docProps/app.xml', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml', 'word/settings.xml']);
    const dec = new TextDecoder();
    const doc = dec.decode(files.find((f) => f.name === 'word/document.xml')!.data);
    // A4 縦・余白
    expect(doc).toContain('<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>');
    expect(doc).toContain('w:top="1418"');
    const styles = dec.decode(files.find((f) => f.name === 'word/styles.xml')!.data);
    expect(styles).toContain('w:eastAsia="游明朝"');
    expect(styles).toContain('w:eastAsia="ja-JP"');
    // XML として読める
    const parsed = new DOMParser().parseFromString(doc, 'application/xml');
    expect(parsed.getElementsByTagName('parsererror')).toHaveLength(0);
  });
  it('本文：改行は段落、空白（半角・全角・連続）はそのまま、タブは Word のタブ、空の行も空の段落。記号は文字として書く', () => {
    const doc = documentXml('朝の準備', text);
    const parsed = new DOMParser().parseFromString(doc, 'application/xml');
    const ps = [...parsed.getElementsByTagName('w:p')];
    // タイトル＋本文4行（空の行を含む）
    expect(ps).toHaveLength(5);
    const lineText = (p: Element) => [...p.getElementsByTagName('w:r')].map((r) => (r.getElementsByTagName('w:tab').length ? '\t' : (r.getElementsByTagName('w:t')[0]?.textContent ?? ''))).join('');
    expect(lineText(ps[0]!)).toBe('朝の準備');
    expect(ps.slice(1).map(lineText)).toEqual(text.split('\n'));
    expect(doc).toContain('xml:space="preserve"');
    // 所要時間・確認用の印などは入らない（本人の本文とタイトルだけ）
    expect(doc).not.toMatch(/所要|経過|誤り|波線/);
  });
  it('XML として使えない制御文字は取り除く', () => {
    expect(xmlText('a\u0001b<c>&')).toBe('ab&lt;c&gt;&amp;');
  });
});
