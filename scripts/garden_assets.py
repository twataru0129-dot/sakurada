#!/usr/bin/env python3
"""
桜ガーデンの画像を、元の素材（assets/garden-source）からゲーム用の WebP に切り出します。

- 素材シート（2×2：左上=苗木、右上=若木、左下=つぼみ、右下=満開）は、等分割の線で切ると
  木の上端・枝先が隣の区画にはみ出している素材があるため、透明でない部分のつながり（連結成分）ごとに
  どの木のものかを決め、その木の部分だけを残して切り出します（隣の木が混ざらず、枝先も切れません）。
- 木の接地位置（根元）は、木の下の草地のいちばん幅の広い行の中央とします（画面ではこの点を植える場所に合わせます）。
- 画像の描き直しはしません。縮小と切り出し・透明部分の除去だけを行います。
- 出力：src/assets/garden/**（WebP）と、寸法・接地位置の表 src/data/garden/sprites.json。
  特別な桜（special）は別のフォルダ・別の表に出力します（通常の画面の読み込みに含めないため）。

使い方: python3 scripts/garden_assets.py   （Pillow・numpy・scipy が必要です）
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'garden-source'
OUT = ROOT / 'src' / 'assets' / 'garden'
DATA = ROOT / 'src' / 'data' / 'garden'
STAGES = ['sapling', 'young', 'buds', 'bloom']
ATLAS = ['yae_beni_shidare', 'kanzan', 'asahiyama', 'ukon', 'gyoiko', 'amanogawa', 'kenrokuen_kikuzakura']
SPECIAL = 'saitama_sakura'
DECORATIONS = ['flowerbed', 'stepping_stones', 'wooden_bench', 'stone_lantern', 'small_pond']
MAX_SIDE = 640
QUALITY = 86


def components(alpha: np.ndarray):
    """透明でない部分のつながり。縁のぼかしを含めるため、少し広げてからまとめます"""
    m = alpha > 16
    lab, k = ndi.label(ndi.binary_dilation(m, iterations=2))
    sizes = ndi.sum(m, lab, range(1, k + 1))
    boxes = ndi.find_objects(lab)
    return lab, [(i + 1, int(s), b) for i, (s, b) in enumerate(zip(sizes, boxes)) if s > 0]


def box_distance(a, b) -> float:
    ay0, ay1, ax0, ax1 = a[0].start, a[0].stop, a[1].start, a[1].stop
    by0, by1, bx0, bx1 = b[0].start, b[0].stop, b[1].start, b[1].stop
    dx = max(0, bx0 - ax1, ax0 - bx1)
    dy = max(0, by0 - ay1, ay0 - by1)
    return float(np.hypot(dx, dy))


def split_atlas(img: Image.Image):
    """素材シートを4段階に分けます。各区画の中心に最も大きく描かれた木を本体とし、小さな破片は近い本体に入れます"""
    a = np.array(img.convert('RGBA'))
    h, w = a.shape[:2]
    lab, comps = components(a[:, :, 3])
    quads = {'sapling': (0, 0), 'young': (1, 0), 'buds': (0, 1), 'bloom': (1, 1)}
    main = {}
    for stage, (qx, qy) in quads.items():
        best = None
        for idx, size, box in comps:
            cy = (box[0].start + box[0].stop) / 2
            cx = (box[1].start + box[1].stop) / 2
            if int(cx >= w / 2) == qx and int(cy >= h / 2) == qy and (best is None or size > best[1]):
                best = (idx, size, box)
        if best is None:
            raise SystemExit(f'区画 {stage} に木が見つかりません')
        main[stage] = best
    owner = {}
    for idx, size, box in comps:
        stage = min(main, key=lambda s: (0 if main[s][0] == idx else 1, box_distance(box, main[s][2])))
        owner[idx] = stage
    out = {}
    for stage in STAGES:
        keep = np.isin(lab, [i for i, s in owner.items() if s == stage])
        b = a.copy()
        b[:, :, 3] = np.where(keep, b[:, :, 3], 0)
        out[stage] = Image.fromarray(b)
    return out


def trim(img: Image.Image, pad: int = 4) -> Image.Image:
    a = np.array(img)
    ys, xs = np.nonzero(a[:, :, 3] > 8)
    x0, x1 = max(0, xs.min() - pad), min(a.shape[1], xs.max() + 1 + pad)
    y0, y1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + 1 + pad)
    return img.crop((x0, y0, x1, y1))


def scale(img: Image.Image) -> Image.Image:
    s = MAX_SIDE / max(img.size)
    if s >= 1:
        return img
    return img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)


def ground_point(img: Image.Image):
    """根元：下から12％の範囲で、横幅がいちばん広い行（木の下の草地の中ほど）の中央。画像に対する比で返します"""
    a = np.array(img)[:, :, 3] > 40
    h, w = a.shape
    rows = range(int(h * 0.88), h)
    best_y, best_w = h - 1, -1
    for y in rows:
        xs = np.nonzero(a[y])[0]
        if xs.size and xs.max() - xs.min() > best_w:
            best_w = xs.max() - xs.min()
            best_y = y
    xs = np.nonzero(a[best_y])[0]
    return round(float((xs.min() + xs.max()) / 2 / w), 4), round(float(best_y / h), 4), round(float(best_w / w), 4)


def save(img: Image.Image, path: Path) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, 'WEBP', quality=QUALITY, method=6)
    gx, gy, gw = ground_point(img)
    return {'file': path.name, 'w': img.width, 'h': img.height, 'groundX': gx, 'groundY': gy, 'groundWidth': gw}


def tree_sprites(species: str, folder: Path) -> dict:
    sheet = SRC / 'trees' / f'{species}_atlas.png'
    parts = split_atlas(Image.open(sheet)) if sheet.exists() else {s: Image.open(SRC / 'trees' / f'{species}_{s}.png').convert('RGBA') for s in STAGES}
    return {stage: save(scale(trim(parts[stage])), folder / f'{species}_{stage}.webp') for stage in STAGES}


def main():
    sprites = {'trees': {}, 'decorations': {}}
    for species in ['somei_yoshino', *ATLAS]:
        sprites['trees'][species] = tree_sprites(species, OUT / 'trees')
    for d in DECORATIONS:
        img = scale(trim(Image.open(SRC / 'decorations' / f'{d}.png').convert('RGBA')))
        sprites['decorations'][d] = save(img, OUT / 'decorations' / f'{d}.webp')
    bg = Image.open(SRC / 'backgrounds' / 'garden_day.png').convert('RGB')
    (OUT / 'backgrounds').mkdir(parents=True, exist_ok=True)
    bg.save(OUT / 'backgrounds' / 'garden_day.webp', 'WEBP', quality=84, method=6)
    sprites['background'] = {'file': 'garden_day.webp', 'w': bg.width, 'h': bg.height}
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / 'sprites.json').write_text(json.dumps(sprites, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    special = {'trees': {SPECIAL: tree_sprites(SPECIAL, OUT / 'special')}}
    (DATA / 'special_sprites.json').write_text(json.dumps(special, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('ok')


if __name__ == '__main__':
    main()
