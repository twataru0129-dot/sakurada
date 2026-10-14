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


def dance():
    """
    クリアのダンス（v1.6.0）：主人公の「両手を上げた姿」「両手を下げた姿」。
    2枚は顔・胴体・足元が同じ位置に描かれているため、同じ範囲で切り抜き、同じ大きさに縮小します（切り替えで体がずれないように）。
    元の画像には、体から離れた場所にほぼ透明な点（不透明度 1〜16/255）が散らばっているため、
    体の輪郭から 6px より外の点は完全に透明にします（背景に四角い枠が出ないように）。体と輪郭のぼかしはそのままです。
    """
    from scipy import ndimage

    names = ['hero_dance_up', 'hero_dance_down']
    imgs = [np.array(Image.open(SRC / 'images' / 'characters' / f'{n}.png').convert('RGBA')) for n in names]
    for a in imgs:
        body = ndimage.binary_dilation(a[..., 3] > 32, iterations=6)
        a[..., 3][~body] = 0
    boxes = [bbox(a[..., 3], 0) for a in imgs]
    pad = 8
    x0 = max(0, min(b[0] for b in boxes) - pad)
    y0 = max(0, min(b[1] for b in boxes) - pad)
    x1 = min(imgs[0].shape[1], max(b[2] for b in boxes) + pad)
    y1 = min(imgs[0].shape[0], max(b[3] for b in boxes) + pad)
    h = 820
    out = {}
    OUT.joinpath('characters').mkdir(parents=True, exist_ok=True)
    for n, a in zip(names, imgs):
        crop = Image.fromarray(a).crop((x0, y0, x1, y1))
        img = crop.resize((round(crop.width * h / crop.height), h), Image.LANCZOS)
        img.save(OUT / 'characters' / f'{n}.webp', 'WEBP', quality=Q, method=6)
        out[n] = {'file': f'{n}.webp', 'w': img.width, 'h': img.height}
    return out


def emblems():
    """
    勝利のランクのエンブレム（v1.7.0）：assets/bowie-source/images/emblems/rank_01〜10（背景透過・下にランク名の文字入り）。
    - full：ランク名の文字を含む全体（獲得したエンブレムを大きく出すとき）
    - mark：ランク名の文字より上だけ（ランク一覧の小さな表示用。名前は画面の文字で別に出し、二重になりません）。
      名前の文字と飾りの間でいちばん透明に近い行（下から 14〜32％ の範囲）で切ります。
    元の画像の、絵から離れたほぼ透明な点は消します（背景に枠が出ないように。ダンスの画像と同じ処理）。
    """
    from scipy import ndimage

    out = {}
    (OUT / 'emblems').mkdir(parents=True, exist_ok=True)
    for f in sorted((SRC / 'images' / 'emblems').glob('rank_*.png')):
        a = np.array(Image.open(f).convert('RGBA'))
        body = ndimage.binary_dilation(a[..., 3] > 32, iterations=6)
        a[..., 3][~body] = 0
        box = bbox(a[..., 3], 0)
        h = a.shape[0]
        cov = (a[..., 3] > 40).mean(axis=1)
        lo, hi = int(h * 0.68), int(h * 0.86)
        cut = lo + int(np.argmin(cov[lo:hi]))
        full = Image.fromarray(a).crop((box[0], box[1], box[2], box[3]))
        full = full.resize((512, round(full.height * 512 / full.width)), Image.LANCZOS) if full.width > 512 else full
        mark = Image.fromarray(a[:cut]).crop(bbox(a[:cut, :, 3], 0))
        mark = mark.resize((260, round(mark.height * 260 / mark.width)), Image.LANCZOS)
        name = f.stem
        full.save(OUT / 'emblems' / f'{name}.webp', 'WEBP', quality=Q, method=6)
        mark.save(OUT / 'emblems' / f'{name}_mark.webp', 'WEBP', quality=Q, method=6)
        out[name] = {'full': f'{name}.webp', 'mark': f'{name}_mark.webp', 'w': full.width, 'h': full.height, 'markW': mark.width, 'markH': mark.height}
    return out


FINAL = ['bowie_final_idle', 'bowie_final_release_prepare', 'bowie_final_release_mid', 'bowie_final_release', 'bowie_final_angry', 'bowie_final_laugh']
# 最終形態の「放つ」（bowie_final_release）の手のひらの前：独立した爆弾を出す位置（元の画像の px。手の赤い光の中心、指先のすぐ前）
FINAL_EMIT = (112, 250)


def final_characters():
    """
    ボウイの最終形態（v1.8.0）：待機・構える・送り出す・放つ・怒り・高笑い。
    - 通常の画像は体の高さ（切り抜いた高さ）をそろえますが、最終形態は姿勢で体の高さが変わる（放つ・怒りは踏み込んで低い）ため、
      高さでそろえると放つ瞬間に体が大きくなります。そこで、同じ大きさで描かれた 1122×1402 の5枚は同じ倍率で縮小し、
      高笑い（1024×1536 で約1.1倍に描かれています）だけは、待機と頭頂〜靴底の高さが同じになる倍率にします。
    - 足元は、いちばん下 10％ の行（靴だけの範囲）の左右の中央。画面では、この点を通常のボウイと同じ足元の位置に合わせます。
    - bodyH には「待機の体の高さ」を各画像の高さの比で入れます（geometry.ts は bodyH で表示の高さを決めるため、
      これで全6枚が同じ倍率で表示されます）。
    - 体から離れたほぼ透明な点は消します（ダンスの画像と同じ処理。放つ姿の赤い光の粒は不透明なので残ります）。
    """
    from scipy import ndimage

    arrays = {}
    for n in FINAL:
        a = np.array(Image.open(SRC / 'images' / 'characters' / f'{n}.png').convert('RGBA'))
        body = ndimage.binary_dilation(a[..., 3] > 32, iterations=6)
        a[..., 3][~body] = 0
        arrays[n] = a
    boxes = {n: bbox(a[..., 3], 40) for n, a in arrays.items()}
    idle_h = boxes['bowie_final_idle'][3] - boxes['bowie_final_idle'][1]
    base = BOWIE_FIGURE_PX / idle_h
    laugh_h = boxes['bowie_final_laugh'][3] - boxes['bowie_final_laugh'][1]
    out = {}
    for n, a in arrays.items():
        img = Image.fromarray(a)
        box = boxes[n]
        s = base * (idle_h / laugh_h if n == 'bowie_final_laugh' else 1)
        pad = 6
        x0, y0 = max(0, box[0] - pad), max(0, box[1] - pad)
        x1, y1 = min(img.width, box[2] + pad), min(img.height, box[3] + pad)
        fx = foot_x(a[..., 3], box)
        crop = img.crop((x0, y0, x1, y1))
        res = crop.resize((round(crop.width * s), round(crop.height * s)), Image.LANCZOS)
        res.save(OUT / 'characters' / f'{n}.webp', 'WEBP', quality=Q, method=6)
        info = {
            'file': f'{n}.webp',
            'w': res.width,
            'h': res.height,
            'footX': round((fx - x0) / crop.width, 4),
            'footY': round((box[3] - y0) / crop.height, 4),
            # 待機の体の高さ（画像の高さに対する比）：6枚が同じ倍率で表示されます
            'bodyH': round(BOWIE_FIGURE_PX / res.height, 4),
        }
        if n == 'bowie_final_release':
            info['emit'] = {'x': round((FINAL_EMIT[0] - x0) / crop.width, 4), 'y': round((FINAL_EMIT[1] - y0) / crop.height, 4)}
        out[n] = info
    return out


def video():
    """
    クリアのスペシャルムービー（v1.9.0）：assets/bowie-source/video/bowie_clear_special.mp4（納品の MP4。H.264＋AAC・910×512・約15.1秒）。
    - 配信用は同じ MP4 をそのまま複製します（映像・音声は加工しません）。
    - H.264 を再生できないブラウザー（オープンソース版の Chromium など）のために、同じ映像・音声を WebM（VP9＋Opus）に
      変換した予備も作ります（ffmpeg があるときだけ。画面では MP4 を先に、WebM を2番目の候補にします）。
    """
    import subprocess

    src = SRC / 'video' / 'bowie_clear_special.mp4'
    out = OUT / 'video'
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, out / src.name)
    webm = out / 'bowie_clear_special.webm'
    if shutil.which('ffmpeg'):
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src),
                        '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '33', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
                        '-c:a', 'libopus', '-b:a', '128k', str(webm)], check=True)


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
    for i in range(1, 11):
        name = f'game_over_{i:02d}'
        sprites['scenes'][name] = scene(name, 1672, False)
    # 2〜4回目のカットイン（回ごとに専用の画像）と、敗北の音声の間に出す DEFEAT の画像（v1.5.3）
    for name in ['bowie_cutin_02', 'bowie_cutin_03', 'bowie_cutin_04', 'bowie_defeat']:
        sprites['scenes'][name] = scene(name, 1672, False)
    # 2〜4回目のカットインの文字入り版と、開始前の画面の背景（v1.6.1）
    for name in ['bowie_cutin_02_text', 'bowie_cutin_03_text', 'bowie_cutin_04_text', 'bowie_title_background']:
        sprites['scenes'][name] = scene(name, 1672, False)
    sprites['dance'] = dance()
    sprites['emblems'] = emblems()
    # 勝利の VICTORY の演出画像（v1.7.0）
    sprites['scenes']['bowie_victory_screen'] = scene('bowie_victory_screen', 1672, False)
    # 最終形態（v1.8.0）：キャラクター6枚、赤い最終決戦の背景、4回目の文字入りカットイン、最終形態の煽り10枚
    sprites['bowie'].update(final_characters())
    for name in ['stage_background_final', 'bowie_final_cutin_04'] + [f'game_over_final_{i:02d}' for i in range(1, 11)]:
        sprites['scenes'][name] = scene(name, 1672, False)
    video()
    (OUT / 'audio').mkdir(parents=True, exist_ok=True)
    for f in sorted((SRC / 'audio').glob('*.mp3')):
        shutil.copyfile(f, OUT / 'audio' / f.name)
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / 'sprites.json').write_text(json.dumps(sprites, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('ok')


if __name__ == '__main__':
    main()
