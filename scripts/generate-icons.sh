#!/usr/bin/env bash
# 元画像 assets/brand/sakura-type-original.png から各サイズのアイコンを作成します。
# 元画像は正方形です。縮小のみを行い、切り取り・引き伸ばし・描き直しはしません。
# 必要: ImageMagick 6 以上（convert コマンド）
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=assets/brand/sakura-type-original.png
OUT=public/icons
mkdir -p "$OUT"

if [ ! -f "$SRC" ]; then
  echo "元画像がありません: $SRC に「桜打／SAKURA TYPE」の画像を置いてください" >&2
  exit 1
fi

W=$(identify -format '%w' "$SRC"); H=$(identify -format '%h' "$SRC")
if [ "$W" != "$H" ]; then
  echo "元画像が正方形ではありません (${W}x${H})。切り取りはしない方針のため停止します。" >&2
  exit 1
fi

resize() { convert "$SRC" -filter Lanczos -resize "$1x$1" -strip "$2"; }

resize 16  "$OUT/favicon-16.png"
resize 32  "$OUT/favicon-32.png"
resize 48  "$OUT/favicon-48.png"
resize 180 "$OUT/apple-touch-icon.png"
resize 192 "$OUT/icon-192.png"
resize 512 "$OUT/icon-512.png"
resize 320 "$OUT/logo-320.png"
convert "$OUT/favicon-16.png" "$OUT/favicon-32.png" "$OUT/favicon-48.png" "$OUT/favicon.ico"
rm "$OUT/favicon-16.png" "$OUT/favicon-48.png"

# maskable 用：画像全体（四隅を含む）が安全領域（中心から半径40%の円）に収まるよう、
# 一辺を 56% に縮小し、元画像の地色で余白を付けた別画像を作ります。
BG=$(convert "$SRC" -format '%[pixel:p{2,2}]' info:)
for S in 192 512; do
  INNER=$(( S * 56 / 100 ))
  convert "$SRC" -filter Lanczos -resize "${INNER}x${INNER}" -background "$BG" -gravity center -extent "${S}x${S}" -strip "$OUT/icon-maskable-$S.png"
done
echo "アイコンを作成しました: $OUT"
