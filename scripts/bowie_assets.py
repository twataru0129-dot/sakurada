#!/usr/bin/env python3
"""
ボウイの爆弾遊戯の画像を、元の素材（assets/bowie-source）からゲーム用の WebP に変換します。

- キャラクター：透明でない部分で切り抜き、足元（いちばん下の数％の行の中央）を基準点として記録します。
  ボウイの画像は元の寸法・描かれた大きさが画像ごとに違うため、体の高さ（切り抜いた高さ）がそろうように縮小します。
  主人公の画像はどれも同じ大きさで描かれているため、同じ倍率で縮小します（ポーズによる高さの違いはそのまま）。
- 放つ動作3（bowie_release_3）は手に爆弾が描かれています。その爆弾の中心と大きさを記録し、
  手を離れた瞬間に、独立した爆弾をちょうどその位置・大きさで出せるようにします。
- 画像の描き直しはしません。切り抜き・縮小・形式の変換だけです。音声は変更せずにコピーします。
- 出力：src/assets/bowie/**、寸法と基準点の表 src/data/bowie/sprites.json

使い方: python3 scripts/bowie_assets.py   （Pillow・numpy が必要です）
"""
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'bowie-source'
OUT = ROOT / 'src' / 'assets' / 'bowie'
DATA = ROOT / 'src' / 'data' / 'bowie'
BOWIE = ['bowie_idle', 'bowie_release_1', 'bowie_release_2', 'bowie_release_3', 'bowie_release_4', 'bowie_frustrated', 'bowie_laugh', 'bowie_despair']
HERO = ['hero_idle', 'hero_disarm', 'hero_danger', 'hero_hit', 'hero_victory']
BOWIE_FIGURE_PX = 900
HERO_SCALE = 720 / 1254
Q = 88


def bbox(alpha: np.ndarray, th: int = 16):
    ys, xs = np.nonzero(alpha > th)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def foot_x(alpha: np.ndarray, box) -> float:
    """足元：切り抜いた範囲のいちばん下 10％ の行で、透明でない部分の左右の中央（片足だけが低い絵でも両足の間になるように）"""
    x0, y0, x1, y1 = box
    rows = alpha[int(y1 - (y1 - y0) * 0.10):y1, x0:x1] > 40
    xs = np.nonzero(rows.any(axis=0))[0]
    return x0 + (xs.min() + xs.max()) / 2


def cyan_center(rgba: np.ndarray):
    """爆弾の青い紋様の中心と幅（手に描かれた爆弾の位置を求めるため）"""
    r, g, b, a = (rgba[..., i].astype(int) for i in range(4))
    m = (a > 200) & (b > 150) & (g > 110) & (r < 110) & (b - r > 80)
    ys, xs = np.nonzero(m)
    return float(xs.mean()), float(ys.mean()), float(xs.max() - xs.min())


def character(name: str, scale_for):
    img = Image.open(SRC / 'images' / 'characters' / f'{name}.png').convert('RGBA')
    a = np.array(img)
    box = bbox(a[..., 3])
    pad = 6
    x0, y0 = max(0, box[0] - pad), max(0, box[1] - pad)
    x1, y1 = min(img.width, box[2] + pad), min(img.height, box[3] + pad)
    fx = foot_x(a[..., 3], box)
    s = scale_for(box)
    crop = img.crop((x0, y0, x1, y1))
    out = crop.resize((round(crop.width * s), round(crop.height * s)), Image.LANCZOS)
    OUT.joinpath('characters').mkdir(parents=True, exist_ok=True)
    out.save(OUT / 'characters' / f'{name}.webp', 'WEBP', quality=Q, method=6)
    info = {
        'file': f'{name}.webp',
        'w': out.width,
        'h': out.height,
        # 足元（画像に対する比）
        'footX': round((fx - x0) / crop.width, 4),
        'footY': round((box[3] - y0) / crop.height, 4),
        # 体の高さ（足元から上端まで、画像の高さに対する比）
        'bodyH': round((box[3] - box[1]) / crop.height, 4),
    }
    if name == 'bowie_release_3':
        cx, cy, cw = cyan_center(a)
        info['bomb'] = {'x': round((cx - x0) / crop.width, 4), 'y': round((cy - y0) / crop.height, 4), 'glyphW': round(cw / crop.width, 4)}
    return info


def scene(name: str, max_w: int, alpha: bool):
    img = Image.open(SRC / 'images' / 'scenes' / f'{name}.png').convert('RGBA' if alpha else 'RGB')
    if img.width > max_w:
        img = img.resize((max_w, round(img.height * max_w / img.width)), Image.LANCZOS)
    OUT.joinpath('scenes').mkdir(parents=True, exist_ok=True)
    img.save(OUT / 'scenes' / f'{name}.webp', 'WEBP', quality=Q if alpha else 84, method=6)
    return {'file': f'{name}.webp', 'w': img.width, 'h': img.height}


def bomb():
    img = Image.open(SRC / 'images' / 'scenes' / 'bomb.png').convert('RGBA')
    a = np.array(img)
    box = bbox(a[..., 3])
    crop = img.crop(box)
    ca = np.array(crop)
    ys, xs = np.nonzero(ca[..., 3] > 16)
    low = ys > ys.min() + (ys.max() - ys.min()) * 0.3
    _, _, glyph_w = cyan_center(ca)
    body_w = xs[low].max() - xs[low].min()
    out = crop.resize((360, round(crop.height * 360 / crop.width)), Image.LANCZOS)
    out.save(OUT / 'scenes' / 'bomb.webp', 'WEBP', quality=Q, method=6)
    return {
        'file': 'bomb.webp',
        'w': out.width,
        'h': out.height,
        # 本体（導火線を除く）の中心：回転の中心と、位置を合わせる基準
        'bodyX': round(float(xs[low].mean()) / crop.width, 4),
        'bodyY': round(float(ys[low].mean()) / crop.height, 4),
        'bodyW': round(float(body_w) / crop.width, 4),
        # 青い紋様の幅に対する本体の幅（手に描かれた爆弾と大きさを合わせるため）
        'bodyPerGlyph': round(float(body_w) / glyph_w, 4),
    }


def main():
    def bowie_scale(box):
        return BOWIE_FIGURE_PX / (box[3] - box[1])

    sprites = {
        'bowie': {n: character(n, bowie_scale) for n in BOWIE},
        'hero': {n: character(n, lambda _b: HERO_SCALE) for n in HERO},
        'scenes': {
            'stage_background': scene('stage_background', 1672, False),
            'speed_cutin': scene('speed_cutin', 1672, False),
            'game_over_clean': scene('game_over_clean', 1672, False),
            'title_logo': scene('title_logo', 1100, True),
            'game_icon': scene('game_icon', 640, False),
        },
    }
    sprites['bomb'] = bomb()
    (OUT / 'audio').mkdir(parents=True, exist_ok=True)
    for f in sorted((SRC / 'audio').glob('*.mp3')):
        shutil.copyfile(f, OUT / 'audio' / f.name)
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / 'sprites.json').write_text(json.dumps(sprites, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('ok')


if __name__ == '__main__':
    main()
