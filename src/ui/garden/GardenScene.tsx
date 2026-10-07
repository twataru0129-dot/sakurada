/**
 * 庭の表示（背景・桜・飾り）。背景は固定カメラの庭で、桜と飾りを重ねて描きます（背景に木は描かれていません）。
 * 桜は根元を植える場所に合わせ、飾りは下端をマス目に合わせます。手前（下）にあるものほど前に描きます。
 *
 * 庭づくりのときは、マス目と植える場所を表示します。飾りは「選ぶ → 置く場所を押す」でも、ドラッグでも置けます。
 */
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { COPY, decoEntry, treeEntry, type DecoKind } from '../../core/garden/config';
import { anchorToCell, canPlace, cellAt, decoBox, footprintAt, GRID, CELL_H, CELL_W, ROOT_ZONES, SCENE, TREE_SLOTS, treeBox, type Placed } from '../../core/garden/layout';
import { decoRects, stageOf, type GardenState, type PlacedDeco } from '../../core/garden/state';
import { BACKGROUND_URL, decoSprite, treeSprite, type SpecialSprites } from './assets';

export interface PlacingTarget {
  kind: DecoKind;
  /** 置いてある飾りを動かすとき、その ID */
  decoId?: string;
}

interface Props {
  state: GardenState;
  garden: number;
  special: SpecialSprites | null;
  specialName: string | null;
  selectedTree: string | null;
  onSelectTree?: (id: string) => void;
  /** 庭づくりの表示 */
  edit?: boolean;
  placing?: PlacingTarget | null;
  onPlace?: (col: number, row: number) => void;
  selectedDeco?: string | null;
  onSelectDeco?: (id: string) => void;
  /** 庭づくりで植える場所を押したとき */
  onSlot?: (slot: number) => void;
  /** 満開の特別な桜の光（動きを減らす設定のときは出しません） */
  sparkle?: boolean;
}

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
const boxStyle = (b: Placed, z: number): CSSProperties => ({ left: pct(b.left), top: pct(b.top), width: pct(b.width), height: pct(b.height), zIndex: z });

export const treeName = (species: string, specialName: string | null): string => (species === 'special' ? (specialName ?? '') : treeEntry(species as never).name);

export function GardenScene(p: Props) {
  const { state, garden, special } = p;
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null);
  const [drag, setDrag] = useState<{ deco: PlacedDeco; pointer: number } | null>(null);
  const plot = state.gardens[garden]!;

  const items: { key: string; z: number; node: (z: number) => ReactElement }[] = [];
  plot.trees.forEach((id, slot) => {
    const t = id ? state.trees.find((x) => x.id === id) : null;
    if (!t) return;
    const stage = stageOf(t);
    const sprite = treeSprite(t.species, stage, special);
    if (!sprite) return;
    const b = treeBox(t.species, stage, slot, sprite.info);
    const name = treeName(t.species, p.specialName);
    const label = `${name}（${COPY.growth.stages[stage]}）`;
    const selected = p.selectedTree === t.id;
    items.push({
      key: `t-${t.id}`,
      z: b.z,
      node: (z) => (
        <button
          key={`t-${t.id}`}
          type="button"
          className={`gscene-item gscene-tree ${selected ? 'is-selected' : ''}`}
          style={boxStyle(b, z)}
          aria-label={`${label}${selected ? '（えらんでいます）' : 'をえらぶ'}`}
          aria-pressed={selected}
          onClick={() => p.onSelectTree?.(t.id)}
          data-testid={`scene-tree-${slot}`}
          data-species={t.species === 'special' ? undefined : t.species}
          data-stage={stage}
          tabIndex={p.edit ? -1 : 0}
        >
          <img src={sprite.url} alt="" draggable={false} />
          {p.sparkle && t.species === 'special' && stage === 'bloom' && <span className="gscene-sparkle" aria-hidden="true" />}
          {selected && !p.edit && <span className="gscene-badge">えらんでいます</span>}
        </button>
      ),
    });
  });
  for (const d of state.decos.filter((x) => x.garden === garden)) {
    const moving = drag?.deco.id === d.id || p.placing?.decoId === d.id;
    const b = decoBox(d.kind, d.col, d.row);
    const sprite = decoSprite(d.kind);
    const selected = p.selectedDeco === d.id;
    items.push({
      key: `d-${d.id}`,
      z: b.z,
      node: (z) =>
        p.edit ? (
          <button
            key={`d-${d.id}`}
            type="button"
            className={`gscene-item gscene-deco is-editable ${selected ? 'is-selected' : ''} ${moving ? 'is-moving' : ''}`}
            style={boxStyle(b, z)}
            aria-label={`${decoEntry(d.kind).name}${selected ? '（えらんでいます）' : 'をえらぶ'}`}
            aria-pressed={selected}
            onClick={() => p.onSelectDeco?.(d.id)}
            onPointerDown={(e) => startDrag(e, d)}
            data-testid={`scene-deco-${d.kind}`}
          >
            <img src={sprite.url} alt="" draggable={false} />
          </button>
        ) : (
          <div key={`d-${d.id}`} className="gscene-item gscene-deco" style={boxStyle(b, z)} data-testid={`scene-deco-${d.kind}`}>
            <img src={sprite.url} alt="" draggable={false} />
          </div>
        ),
    });
  }
  items.sort((a, b) => a.z - b.z);

  const toScene = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  };

  function startDrag(e: ReactPointerEvent, d: PlacedDeco) {
    if (!p.edit || e.button !== 0) return;
    setDrag({ deco: d, pointer: e.pointerId });
    p.onSelectDeco?.(d.id);
  }
  const target: PlacingTarget | null = drag ? { kind: drag.deco.kind, decoId: drag.deco.id } : (p.placing ?? null);
  const preview = target && hover ? anchorToCell(target.kind, hover.col, hover.row) : null;
  const previewOk = target && preview ? canPlace(footprintAt(target.kind, preview.col, preview.row), decoRects(state, garden, target.decoId)) === 'ok' : false;

  const onMove = (e: ReactPointerEvent) => {
    if (!target) return;
    const { x, y } = toScene(e.clientX, e.clientY);
    setHover(cellAt(x, y));
  };
  const onUp = (e: ReactPointerEvent) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const { x, y } = toScene(e.clientX, e.clientY);
    const c = cellAt(x, y);
    setDrag(null);
    if (c) {
      const a = anchorToCell(drag.deco.kind, c.col, c.row);
      if (a.col !== drag.deco.col || a.row !== drag.deco.row) p.onPlace?.(a.col, a.row);
    }
  };

  return (
    <div
      ref={ref}
      className={`gscene ${p.edit ? 'is-edit' : ''} ${target ? 'is-placing' : ''}`}
      style={{ aspectRatio: `${SCENE.w} / ${SCENE.h}` }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => !drag && setHover(null)}
      data-testid="garden-scene"
      data-garden={garden}
    >
      <img className="gscene-bg" src={BACKGROUND_URL} alt="" draggable={false} />
      {items.map((it, i) => it.node(10 + i))}
      {p.edit && (
        <>
          {!target && TREE_SLOTS.map((s, slot) => (
            <button
              key={`slot-${slot}`}
              type="button"
              className={`gscene-slot ${plot.trees[slot] ? 'is-used' : ''}`}
              style={{ left: pct(s.x), top: pct(s.y), zIndex: 400 }}
              onClick={() => p.onSlot?.(slot)}
              data-testid={`scene-slot-${slot}`}
            >
              {plot.trees[slot] ? `植える場所${slot + 1}（使用中）` : `植える場所${slot + 1}`}
            </button>
          ))}
          {target && (
            <div className="gscene-grid" style={{ left: pct(GRID.x0), top: pct(GRID.y0), width: pct(GRID.x1 - GRID.x0), height: pct(GRID.y1 - GRID.y0), zIndex: 300 }}>
              {Array.from({ length: GRID.rows }, (_, row) =>
                Array.from({ length: GRID.cols }, (_, col) => (
                  <button
                    key={`${col}-${row}`}
                    type="button"
                    className="gscene-cell"
                    style={{ left: pct(col / GRID.cols), top: pct(row / GRID.rows), width: pct(1 / GRID.cols), height: pct(1 / GRID.rows) }}
                    aria-label={`横${col + 1}・縦${row + 1}に置く`}
                    onPointerEnter={() => setHover({ col, row })}
                    onFocus={() => setHover({ col, row })}
                    onClick={() => {
                      const a = anchorToCell(target.kind, col, row);
                      p.onPlace?.(a.col, a.row);
                    }}
                    data-testid={`cell-${col}-${row}`}
                  />
                )),
              )}
              {ROOT_ZONES.map((z, i) => (
                <div
                  key={`root-${i}`}
                  className="gscene-root"
                  style={{ left: pct((z.col * CELL_W) / (GRID.x1 - GRID.x0)), top: pct((z.row * CELL_H) / (GRID.y1 - GRID.y0)), width: pct((z.cols * CELL_W) / (GRID.x1 - GRID.x0)), height: pct((z.rows * CELL_H) / (GRID.y1 - GRID.y0)) }}
                  aria-hidden="true"
                >
                  <span>桜の根元</span>
                </div>
              ))}
              {preview && (
                <div
                  className={`gscene-preview ${previewOk ? 'is-ok' : 'is-ng'}`}
                  style={{
                    left: pct((preview.col * CELL_W) / (GRID.x1 - GRID.x0)),
                    top: pct((preview.row * CELL_H) / (GRID.y1 - GRID.y0)),
                    width: pct((footprintAt(target.kind, 0, 0).cols * CELL_W) / (GRID.x1 - GRID.x0)),
                    height: pct((footprintAt(target.kind, 0, 0).rows * CELL_H) / (GRID.y1 - GRID.y0)),
                  }}
                  aria-hidden="true"
                >
                  <span>{previewOk ? '置けます' : '置けません'}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

