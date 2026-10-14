/**
 * 文書作成モードの「Word で保存する」（v2.0.0）：本物の .docx（Office Open XML の WordprocessingML）を、ブラウザの中だけで作ります。
 * 入力した本文は外部のサービスへ送りません。外部のライブラリも使いません（ZIP は ./zip.ts）。
 *
 * - 用紙は A4 縦（210×297mm）、余白は上下左右 25mm
 * - 書体は日本語に適した「游明朝」（Word にない環境では、Word が近い書体に置き換えます）。本文 10.5pt・行間 1.5
 * - 中身はタイトル（中央・太字）と、本人が入力した全文だけ。赤い波線・確認用の印・所要時間・結果は入れません
 * - 本人が入力した改行は段落の区切り（Word で Enter を押したのと同じ）、空白（半角・全角）はそのまま、タブは Word のタブ
 * - 誤字も本人の入力どおり（見本の文章に置き換えません）
 */
import { normalizeText } from './document';
import { buildZip } from './zip';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const DOCX_FONT = '游明朝';

/** XML の文字として使えない文字（制御文字など）を取り除き、記号を書き換えます */
export function xmlText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 1行（段落）の中身：タブは <w:tab/>、それ以外の文字（空白を含む）はそのまま */
function runs(line: string): string {
  if (line === '') return '';
  const parts = line.split('\t');
  return parts
    .map((part, i) => (i > 0 ? '<w:r><w:tab/></w:r>' : '') + (part ? `<w:r><w:t xml:space="preserve">${xmlText(part)}</w:t></w:r>` : ''))
    .join('');
}

export function documentXml(title: string, text: string): string {
  const lines = normalizeText(text).split('\n');
  const body = lines.map((l) => `<w:p>${runs(l)}</w:p>`).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<w:body>' +
    `<w:p><w:pPr><w:pStyle w:val="DocTitle"/></w:pPr>${runs(normalizeText(title).replace(/\n/g, ' '))}</w:p>` +
    body +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>' +
    '<w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="851" w:footer="851" w:gutter="0"/>' +
    '<w:cols w:space="425"/><w:docGrid w:type="lines" w:linePitch="360"/></w:sectPr>' +
    '</w:body></w:document>'
  );
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr>' +
  `<w:rFonts w:ascii="${DOCX_FONT}" w:eastAsia="${DOCX_FONT}" w:hAnsi="${DOCX_FONT}" w:cs="${DOCX_FONT}"/>` +
  '<w:kern w:val="2"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US" w:eastAsia="ja-JP" w:bidi="ar-SA"/>' +
  '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:widowControl w:val="0"/><w:spacing w:after="0" w:line="360" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  '<w:style w:type="paragraph" w:customStyle="1" w:styleId="DocTitle"><w:name w:val="文書のタイトル"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>' +
  '<w:pPr><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>' +
  '</w:styles>';

const SETTINGS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:defaultTabStop w:val="840"/><w:characterSpacingControl w:val="compressPunctuation"/>' +
  '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
  '</w:settings>';

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
  '</Types>';

const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
  '</Relationships>';

const DOC_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
  '</Relationships>';

function coreXml(title: string, when: Date): string {
  const t = when.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${xmlText(title)}</dc:title><dc:language>ja-JP</dc:language>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${t}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${t}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

const APP_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>桜打 — SAKURA TYPE</Application></Properties>';

/** タイトルと本人の全文から .docx の中身（ZIP）を作ります */
export function buildDocx(title: string, text: string, when = new Date()): Uint8Array {
  const enc = new TextEncoder();
  return buildZip(
    [
      { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
      { name: '_rels/.rels', data: enc.encode(ROOT_RELS) },
      { name: 'docProps/core.xml', data: enc.encode(coreXml(title, when)) },
      { name: 'docProps/app.xml', data: enc.encode(APP_XML) },
      { name: 'word/_rels/document.xml.rels', data: enc.encode(DOC_RELS) },
      { name: 'word/document.xml', data: enc.encode(documentXml(title, text)) },
      { name: 'word/styles.xml', data: enc.encode(STYLES) },
      { name: 'word/settings.xml', data: enc.encode(SETTINGS) },
    ],
    when,
  );
}
