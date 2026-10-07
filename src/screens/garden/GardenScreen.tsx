/**
 * ゲーム「桜ガーデン」。上に庭、下に練習の欄。庭づくり・桜を育てる・お店・図鑑・持ちものは下のメニューから開きます。
 *
 * - /game/garden：庭の鑑賞・配置と、練習の準備
 * - /game/garden/play：練習中（ゲームの操作のボタンは出しません。入力のキーを庭の操作に使いません）
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COPY, decoEntry, DECO_KINDS, fill, GARDEN_UNLOCKS, PROBLEM_COUNTS, STANDARD_SPECIES, treeEntry, type DecoKind } from '../../core/garden/config';
import { pickProblems } from '../../core/garden/problems';
import { canPlace, footprintAt } from '../../core/garden/layout';
import {
  cleanGardenName,
  decoCounts,
  decoRects,
  FIRST_EVENT_ID,
  FIRST_TREE_ID,
  newId,
  plantedAt,
  resumableSession,
  stageOf,
  unlockedGardenCount,
  type TreeInstance,
} from '../../core/garden/state';
import { navigate } from '../../state/router';
import { useGarden } from '../../state/GardenContext';
import { GardenScene, treeName, type PlacingTarget } from '../../ui/garden/GardenScene';
import { GrowCard } from '../../ui/garden/GrowCard';
import { GardenPractice } from '../../ui/garden/GardenPractice';
import { CollectionPanel, HelpPanel, InventoryPanel, ShopPanel, Sheet, type SpecialInfo } from '../../ui/garden/Panels';
import { treeSprite } from '../../ui/garden/assets';
import { gardenFileName, renderGardenBlob } from '../../ui/garden/exportImage';

type PanelKind = 'grow' | 'shop' | 'collection' | 'inventory' | 'help' | null;

function useCoarsePointer(): boolean {
  const q = '(pointer: coarse)';
  const [v, setV] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(q);
    const on = () => setV(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return v;
}

/** 特別な桜の文章と画像は、苗が届いたあとにだけ読み込みます */
function useSpecial(granted: boolean): SpecialInfo | null {
  const [info, setInfo] = useState<SpecialInfo | null>(null);
  useEffect(() => {
    if (!granted || info) return;
    let alive = true;
    void import('../../core/garden/special').then((m) => {
      if (!alive) return;
      setInfo({
        name: m.SPECIAL_TREE.name,
        reading: m.SPECIAL_TREE.name_reading,
        flowerColor: m.SPECIAL_TREE.flower_color,
        treeShape: m.SPECIAL_TREE.tree_shape,
        description: m.SPECIAL_TREE.description,
        sourceNote: m.SPECIAL_TREE.source_note,
        ui: m.SPECIAL_UI,
        sprites: m.SPECIAL_SPRITES,
      });
    });
    return () => {
      alive = false;
    };
  }, [granted, info]);
  return granted ? info : null;
}

export function GardenScreen({ mode }: { mode: 'garden' | 'play' }) {
  const g = useGarden();
  const { state, act } = g;
  const openGarden = g.open;
  useEffect(() => openGarden(), [openGarden]);
  const special = useSpecial(state.specialGranted);
  const touch = useCoarsePointer();
  const [garden, setGarden] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelKind>(null);
  const [edit, setEdit] = useState(false);
  const [placing, setPlacing] = useState<PlacingTarget | null>(null);
  const [plantTree, setPlantTree] = useState<string | null>(null);
  const [selDeco, setSelDeco] = useState<string | null>(null);
  const [slotChooser, setSlotChooser] = useState<number | null>(null);
  const [transfer, setTransfer] = useState<{ tree: string; slot: number } | null>(null);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [viewing, setViewing] = useState<TreeInstance | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [revealSpecial, setRevealSpecial] = useState(false);
  const [unlockNotes, setUnlockNotes] = useState<string[]>([]);
  const completedAtStart = useRef<number | null>(null);
  const unlocked = unlockedGardenCount(state);
  const plot = state.gardens[garden]!;
  const specialSprites = special?.sprites ?? null;
  const visible = (t: TreeInstance) => t.species !== 'special' || !!special;

  // えらんでいる桜：えらんだ桜 → この庭に植えた桜 → 持っている桜
  const tree = useMemo(() => {
    const find = (id: string | null) => (id ? (state.trees.find((t) => t.id === id && visible(t)) ?? null) : null);
    return find(selected) ?? find(plot.trees.find((x) => x) ?? null) ?? state.trees.find(visible) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, state, plot, special]);

  const session = mode === 'play' ? ((sessionId ? state.sessions.get(sessionId) : null) ?? resumableSession(state)) : null;
  useEffect(() => {
    if (mode === 'play' && g.load === 'ready' && !session) navigate('/game/garden');
  }, [mode, g.load, session]);

  const startPractice = () => {
    const resume = resumableSession(state);
    if (resume) {
      setSessionId(resume.id);
    } else {
      const sid = newId('session');
      const list = pickProblems(state.problemCount, state.recent).map((p) => p.id);
      if (!act('session', { session: sid, problems: list }, `session:${sid}`)) return;
      setSessionId(sid);
    }
    completedAtStart.current = state.completed;
    setUnlockNotes([]);
    navigate('/game/garden/play');
  };
  const newPractice = () => {
    const resume = resumableSession(state);
    if (resume) act('end', { session: resume.id });
    const sid = newId('session');
    const list = pickProblems(state.problemCount, state.recent).map((p) => p.id);
    if (!act('session', { session: sid, problems: list }, `session:${sid}`)) return;
    setSessionId(sid);
    completedAtStart.current = state.completed;
    navigate('/game/garden/play');
  };

  // 練習で解放された品種・庭のお知らせ（練習が終わったあとにまとめて表示します）
  useEffect(() => {
    const from = completedAtStart.current;
    if (from === null || mode !== 'play') return;
    const notes: string[] = [];
    for (const sp of STANDARD_SPECIES) {
      const n = treeEntry(sp).unlock_completed_problems;
      if (n > from && n <= state.completed) notes.push(fill(COPY.shop.unlocked, { name: treeEntry(sp).name }));
    }
    if (GARDEN_UNLOCKS.some((n) => n > from && n <= state.completed)) notes.push(COPY.garden.garden_unlocked);
    setUnlockNotes(notes);
  }, [state.completed, mode]);

  const exitPractice = () => {
    setSessionId(null);
    completedAtStart.current = null;
    navigate('/game/garden');
  };

  const water = useCallback((t: TreeInstance, amount: number) => act('water', { tree: t.id, amount }), [act]);

  // 庭づくり
  const closeEdit = () => {
    setEdit(false);
    setPlacing(null);
    setPlantTree(null);
    setSelDeco(null);
    setEditMsg(null);
  };
  const openEdit = () => {
    setPanel(null);
    setEdit(true);
  };
  const place = (col: number, row: number) => {
    if (!placing) return;
    const check = canPlace(footprintAt(placing.kind, col, row), decoRects(state, garden, placing.decoId));
    if (check !== 'ok') {
      setEditMsg(check === 'outside' ? COPY.garden.outside_area : COPY.garden.occupied);
      return;
    }
    const ok = placing.decoId
      ? act('move', { deco: placing.decoId, garden, col, row })
      : act('place', { deco: newId('deco'), kind: placing.kind, garden, col, row });
    if (ok) {
      setEditMsg(`${decoEntry(placing.kind).name}を置きました。`);
      setPlacing(null);
    }
  };
  const moveDecoByDrag = (col: number, row: number) => {
    const d = state.decos.find((x) => x.id === selDeco);
    if (!d) return;
    const check = canPlace(footprintAt(d.kind, col, row), decoRects(state, garden, d.id));
    if (check !== 'ok') setEditMsg(check === 'outside' ? COPY.garden.outside_area : COPY.garden.occupied);
    else if (act('move', { deco: d.id, garden, col, row })) setEditMsg(`${decoEntry(d.kind).name}を動かしました。`);
  };
  const plantInto = (treeId: string, slot: number, confirmed = false) => {
    const at = plantedAt(state, treeId);
    if (at && at.garden !== garden && !confirmed) {
      setTransfer({ tree: treeId, slot });
      return;
    }
    if (act('plant', { tree: treeId, garden, slot })) {
      const t = state.trees.find((x) => x.id === treeId)!;
      setEditMsg(`${treeName(t.species, special?.name ?? null)}を植えました。`);
      setSelected(treeId);
    }
    setPlantTree(null);
    setSlotChooser(null);
    setTransfer(null);
  };
  const onSlot = (slot: number) => {
    if (plantTree) plantInto(plantTree, slot);
    else setSlotChooser(slot);
  };
  const rename = () => {
    if (nameDraft === null) return;
    const n = cleanGardenName(nameDraft);
    if (!n) {
      setEditMsg(nameDraft.trim() ? COPY.garden.name_too_long : COPY.garden.name_empty);
      return;
    }
    if (n === plot.name || act('rename', { garden, name: n })) {
      setNameDraft(null);
      setEditMsg(`庭の名前を「${n}」にしました。`);
    }
  };
  const [imageMsg, setImageMsg] = useState<string | null>(null);
  const saveImage = async () => {
    setImageMsg(null);
    try {
      const blob = await renderGardenBlob(state, garden, specialSprites);
      const fileName = gardenFileName(garden);
      const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
      if (file && touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: plot.name });
          setImageMsg(COPY.garden.image_saved);
          return;
        } catch {
          /* 共有をやめたときはダウンロードにします */
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // すぐに消すと、ブラウザによってはファイル名が使われないため、少し待ってから片付けます
      window.setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 30_000);
      setImageMsg(COPY.garden.image_download_started);
    } catch {
      setImageMsg(COPY.garden.image_failed);
    }
  };

  // 表示する庭が使えなくなることはありませんが、念のため範囲に収めます
  useEffect(() => {
    if (garden >= unlocked) setGarden(0);
  }, [garden, unlocked]);

  const saveLine = (() => {
    if (g.local) return g.save === 'failed' ? COPY.save.local_failed : null;
    if (g.failure === 'missing_table') return 'アカウントの保存先が準備されていないため、記録を保存できません。先生・管理者に連絡してください。';
    if (g.save === 'saving') return COPY.save.cloud_syncing;
    if (g.save === 'saved') return COPY.save.cloud_synced;
    if (g.save === 'failed') return 'アカウントに保存できていない変更があります。';
    return null;
  })();

  if (g.load !== 'ready') {
    return (
      <main className="garden-main garden-loading" data-testid="garden-main">
        <p>
          {g.load === 'loading'
            ? '庭を読み込んでいます…'
            : g.failure === 'incompatible'
              ? 'この記録は新しい版のアプリで保存されています。アプリを最新にしてください。'
              : g.failure === 'missing_table'
                ? 'アカウントの保存先が準備されていないため、桜ガーデンを読み込めません。先生・管理者に連絡してください。'
                : '庭を読み込めませんでした。通信を確かめて、もう一度試してください。'}
        </p>
        {g.load === 'error' && g.failure !== 'incompatible' && (
          <button type="button" className="btn gbtn" onClick={g.reload}>
            もう一度読み込む
          </button>
        )}
        <button type="button" className="btn gbtn" onClick={() => navigate('/game')}>
          {COPY.navigation.back}
        </button>
      </main>
    );
  }

  const playing = mode === 'play' && session;
  const resume = resumableSession(state);
  const availableDecos = DECO_KINDS.filter((k) => decoCounts(state, k).available > 0);
  const selectedDeco = state.decos.find((d) => d.id === selDeco && d.garden === garden) ?? null;
  // ほかの画面（お店など）を閉じてから知らせます
  const showArrival = state.specialGranted && !state.specialSeen && !!special && !playing && panel === null && slotChooser === null && !transfer && !viewing;

  const growCard = (
    <GrowCard
      state={state}
      tree={tree}
      special={specialSprites}
      specialName={special?.name ?? null}
      onWater={water}
      onView={setViewing}
      onReceiveFirst={() => {
        // 最初の苗は、受け取るとすぐに最初の庭の空いている場所に植えます（持ちものからいつでも動かせます）
        if (!act('first', {}, FIRST_EVENT_ID)) return;
        const slot = state.gardens[0]!.trees.findIndex((x) => !x);
        if (slot >= 0) act('plant', { tree: FIRST_TREE_ID, garden: 0, slot });
        setSelected(FIRST_TREE_ID);
      }}
      specialBloomText={special ? `${special.ui.bloom_title} ${special.ui.bloom_body}` : null}
    />
  );

  return (
    <main className={`garden-main ${playing ? 'is-playing' : ''} ${edit ? 'is-editing' : ''}`} data-testid="garden-main">
      <div className="garden-bar">
        <span className="garden-title">
          <span className="garden-title-ja">桜ガーデン</span>
          <span className="garden-title-en">SAKURA TYPE</span>
        </span>
        <span className="garden-res" data-testid="garden-water" aria-label={`${COPY.labels.water} ${state.water}`}>
          <span className="garden-res-icon is-water" aria-hidden="true" />
          {COPY.labels.water} <strong>{state.water}</strong>
        </span>
        <span className="garden-res" data-testid="garden-petals" aria-label={`${COPY.labels.petals} ${state.petals}枚`}>
          <span className="garden-res-icon is-petal" aria-hidden="true" />
          {COPY.labels.petals} <strong>{state.petals}</strong>
        </span>
        {unlocked > 1 && !playing && (
          <label className="garden-select">
            <span className="sr-only">{COPY.labels.garden_name}</span>
            <select value={garden} onChange={(e) => setGarden(Number(e.target.value))} data-testid="garden-switch">
              {state.gardens.slice(0, unlocked).map((p, i) => (
                <option key={i} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="spacer" />
        {saveLine && (
          <span className={`garden-save ${g.save === 'failed' || g.failure ? 'is-ng' : ''}`} aria-live="polite" data-testid="garden-save">
            {saveLine}
            {(g.save === 'failed' || g.failure === 'network') && (
              <button type="button" className="btn btn-small" onClick={g.retry} data-testid="garden-retry">
                もう一度保存する
              </button>
            )}
          </span>
        )}
        {!playing && (
          <>
            <button type="button" className="btn gbtn" onClick={() => setPanel('help')} data-testid="garden-help">
              遊び方
            </button>
            <button type="button" className="btn gbtn" onClick={() => navigate('/game')} data-testid="garden-back">
              {COPY.navigation.back}
            </button>
          </>
        )}
      </div>

      <div className="garden-stage">
        <div className="garden-scene-wrap">
          <GardenScene
            state={state}
            garden={garden}
            special={specialSprites}
            specialName={special?.name ?? null}
            selectedTree={playing ? null : (tree?.id ?? null)}
            onSelectTree={(id) => setSelected(id)}
            edit={edit && !playing}
            placing={placing}
            onPlace={placing ? place : moveDecoByDrag}
            selectedDeco={selDeco}
            onSelectDeco={(id) => setSelDeco(id)}
            onSlot={onSlot}
            sparkle
          />
        </div>
        {!playing && !edit && <div className="garden-card-wrap">{growCard}</div>}
      </div>

      {edit && !playing && (
        <section className="gedit" aria-label={COPY.navigation.garden} data-testid="garden-edit">
          <div className="gedit-row">
            <strong>{COPY.navigation.garden}</strong>
            <span className="hint">{fill(COPY.labels.placement_count, { placed: plot.trees.filter(Boolean).length })}</span>
            {unlocked < GARDEN_UNLOCKS.length && <span className="hint">{fill(COPY.garden.unlock_hint, { count: GARDEN_UNLOCKS[unlocked]! })}</span>}
            <span className="spacer" />
            <button type="button" className="btn gbtn" onClick={() => void saveImage()} data-testid="garden-save-image">
              {COPY.buttons.save_image}
            </button>
            <button type="button" className="btn btn-primary gbtn" onClick={closeEdit} data-testid="garden-edit-done">
              庭づくりを終わる
            </button>
          </div>
          {imageMsg && (
            <p className="gcard-msg" aria-live="polite" data-testid="garden-image-msg">
              {imageMsg}
            </p>
          )}
          <div className="gedit-row">
            <label className="gedit-name">
              {COPY.labels.garden_name}
              <input type="text" value={nameDraft ?? plot.name} onChange={(e) => setNameDraft(e.target.value)} data-testid="garden-name" />
            </label>
            <button type="button" className="btn gbtn" onClick={rename} disabled={nameDraft === null} data-testid="garden-rename">
              {COPY.buttons.rename_garden}
            </button>
          </div>
          <div className="gedit-row">
            {placing ? (
              <>
                <span>
                  {decoEntry(placing.kind).name}：{COPY.garden.place_prompt}
                </span>
                <button type="button" className="btn gbtn" onClick={() => setPlacing(null)}>
                  {COPY.buttons.cancel}
                </button>
              </>
            ) : plantTree ? (
              <>
                <span>{plot.trees.every(Boolean) ? COPY.garden.tree_slot_full : '植える場所を選んでね'}</span>
                <button type="button" className="btn gbtn" onClick={() => setPlantTree(null)}>
                  {COPY.buttons.cancel}
                </button>
              </>
            ) : selectedDeco ? (
              <>
                <span>{decoEntry(selectedDeco.kind).name}（ドラッグでも動かせます）</span>
                <button type="button" className="btn gbtn" onClick={() => setPlacing({ kind: selectedDeco.kind, decoId: selectedDeco.id })} data-testid="deco-move">
                  {COPY.buttons.move}
                </button>
                <button
                  type="button"
                  className="btn gbtn"
                  onClick={() => {
                    if (act('stow', { deco: selectedDeco.id })) setEditMsg(COPY.garden.put_away_note);
                    setSelDeco(null);
                  }}
                  data-testid="deco-stow"
                >
                  {COPY.buttons.put_away}
                </button>
                <button type="button" className="btn gbtn" onClick={() => setSelDeco(null)}>
                  {COPY.buttons.cancel}
                </button>
              </>
            ) : (
              <>
                <span>飾りを置く：</span>
                {availableDecos.length === 0 && <span className="hint">{COPY.garden.empty_inventory}</span>}
                {availableDecos.map((k) => (
                  <button key={k} type="button" className="btn gbtn" onClick={() => setPlacing({ kind: k })} data-testid={`edit-place-${k}`}>
                    {decoEntry(k).name}（{decoCounts(state, k).available}）
                  </button>
                ))}
                <span className="hint">桜は、庭の「植える場所」を押して植えます。</span>
              </>
            )}
          </div>
          {editMsg && (
            <p className="gcard-msg" aria-live="polite" data-testid="garden-edit-msg">
              {editMsg}
            </p>
          )}
        </section>
      )}

      {playing ? (
        <GardenPractice key={session.id} state={state} session={session} act={act} touch={touch} onExit={exitPractice} />
      ) : (
        !edit && (
          <section className="gpractice gpractice-idle" aria-label="練習" data-testid="garden-idle">
            <p className="gpractice-intro">{COPY.practice.intro}</p>
            {unlockNotes.length > 0 && (
              <ul className="gnotes" aria-live="polite">
                {unlockNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <fieldset className="gcount">
              <legend>{COPY.labels.problem_count}</legend>
              {PROBLEM_COUNTS.map((n) => (
                <label key={n} className={`gcount-opt ${state.problemCount === n ? 'is-on' : ''}`}>
                  <input type="radio" name="garden-count" checked={state.problemCount === n} onChange={() => act('count', { count: n })} data-testid={`garden-count-${n}`} />
                  {n}問
                </label>
              ))}
            </fieldset>
            <div className="gpractice-actions">
              <button type="button" className="btn btn-primary gbtn" onClick={startPractice} data-testid="garden-start">
                {resume ? `続きから始める（${resume.solved.size} / ${resume.problems.length}）` : COPY.buttons.start}
              </button>
              {resume && (
                <button type="button" className="btn gbtn" onClick={newPractice} data-testid="garden-start-new">
                  新しく始める
                </button>
              )}
            </div>
            <p className="hint">{COPY.practice.typing_hint}</p>
          </section>
        )
      )}

      {!playing && !edit && (
        <nav className="garden-menu" aria-label="桜ガーデンのメニュー">
          <button type="button" className="gmenu-btn" onClick={openEdit} data-testid="menu-garden">
            {COPY.navigation.garden}
          </button>
          <button type="button" className="gmenu-btn" onClick={() => setPanel('grow')} data-testid="menu-grow">
            {COPY.navigation.grow}
          </button>
          <button type="button" className="gmenu-btn" onClick={() => setPanel('shop')} data-testid="menu-shop">
            {COPY.navigation.shop}
          </button>
          <button type="button" className="gmenu-btn" onClick={() => setPanel('collection')} data-testid="menu-collection">
            {COPY.navigation.collection}
          </button>
          <button type="button" className="gmenu-btn" onClick={() => setPanel('inventory')} data-testid="menu-inventory">
            {COPY.navigation.inventory}
          </button>
        </nav>
      )}

      {panel === 'grow' && (
        <Sheet title={COPY.navigation.grow} onClose={() => setPanel(null)} testId="grow-panel">
          <p>{COPY.growth.select}</p>
          <div className="gchips" role="group" aria-label="育てる桜">
            {state.trees.filter(visible).map((t) => (
              <button key={t.id} type="button" className={`gchip ${tree?.id === t.id ? 'is-on' : ''}`} aria-pressed={tree?.id === t.id} onClick={() => setSelected(t.id)} data-testid={`grow-pick-${t.id}`}>
                {treeName(t.species, special?.name ?? null)}（{COPY.growth.stages[stageOf(t)]}）
              </button>
            ))}
          </div>
          {growCard}
        </Sheet>
      )}
      {panel === 'shop' && <ShopPanel state={state} act={act} onClose={() => setPanel(null)} />}
      {panel === 'collection' && <CollectionPanel state={state} special={special} onClose={() => setPanel(null)} />}
      {panel === 'help' && <HelpPanel onClose={() => setPanel(null)} />}
      {panel === 'inventory' && (
        <InventoryPanel
          state={state}
          special={special}
          act={act}
          onClose={() => setPanel(null)}
          onGrow={(t) => {
            setSelected(t.id);
            setPanel('grow');
          }}
          onPlantTree={(t) => {
            openEdit();
            setPlantTree(t.id);
          }}
          onPlaceDeco={(k: DecoKind) => {
            openEdit();
            setPlacing({ kind: k });
          }}
        />
      )}

      {slotChooser !== null && (
        <Sheet title={`植える場所${slotChooser + 1}`} onClose={() => setSlotChooser(null)} testId="slot-chooser">
          {plot.trees[slotChooser] && (
            <p>
              いま植えている桜：{treeName(state.trees.find((t) => t.id === plot.trees[slotChooser])!.species, special?.name ?? null)}
              <button
                type="button"
                className="btn gbtn"
                onClick={() => {
                  act('unplant', { tree: plot.trees[slotChooser] });
                  setEditMsg(COPY.garden.put_away_note);
                  setSlotChooser(null);
                }}
                data-testid="slot-unplant"
              >
                {COPY.buttons.put_away}
              </button>
            </p>
          )}
          <p>{plot.trees[slotChooser] ? '入れ替える桜を選んでね。' : '植える桜を選んでね。'}</p>
          {state.trees.filter((t) => visible(t) && t.id !== plot.trees[slotChooser]).length === 0 && <p className="hint">{COPY.garden.empty_inventory}</p>}
          <ul className="glist">
            {state.trees
              .filter((t) => visible(t) && t.id !== plot.trees[slotChooser])
              .map((t) => {
                const at = plantedAt(state, t.id);
                const s = treeSprite(t.species, stageOf(t), specialSprites);
                return (
                  <li key={t.id} className="gitem">
                    {s && <img src={s.url} alt="" className="gitem-img" />}
                    <div className="gitem-body">
                      <p className="gitem-name">{treeName(t.species, special?.name ?? null)}</p>
                      <p className="gitem-meta">
                        {COPY.growth.stages[stageOf(t)]}・{at ? `「${state.gardens[at.garden]!.name}」に植えています` : '持ちもの'}
                      </p>
                    </div>
                    <button type="button" className="btn gbtn" onClick={() => plantInto(t.id, slotChooser)} data-testid={`slot-plant-${t.id}`}>
                      ここに植える
                    </button>
                  </li>
                );
              })}
          </ul>
        </Sheet>
      )}
      {transfer && (
        <Sheet title="桜を移す" onClose={() => setTransfer(null)} testId="transfer">
          <p>{fill(COPY.garden.tree_elsewhere, { garden: state.gardens[plantedAt(state, transfer.tree)?.garden ?? 0]!.name })}</p>
          <div className="row">
            <button type="button" className="btn btn-primary gbtn" onClick={() => plantInto(transfer.tree, transfer.slot, true)} data-testid="transfer-yes">
              {COPY.garden.transfer_confirm}
            </button>
            <button type="button" className="btn gbtn" onClick={() => setTransfer(null)}>
              {COPY.buttons.cancel}
            </button>
          </div>
        </Sheet>
      )}
      {viewing && (
        <Sheet title={treeName(viewing.species, special?.name ?? null)} onClose={() => setViewing(null)} testId="viewing">
          {(() => {
            const s = treeSprite(viewing.species, 'bloom', specialSprites);
            return s && <img src={s.url} alt={`満開の${treeName(viewing.species, special?.name ?? null)}のイラスト`} className="gview-img" />;
          })()}
          <p>{viewing.species === 'special' ? special?.description : treeEntry(viewing.species).description}</p>
          <p className="hint">{COPY.growth.already_bloomed}</p>
        </Sheet>
      )}
      {showArrival && (
        <Sheet title={special!.ui.arrival_title} onClose={() => act('seen', { what: 'special' })} testId="special-arrival">
          <p>{special!.ui.arrival_body}</p>
          {revealSpecial ? (
            <div className="greveal">
              <img src={special!.sprites.sapling.url} alt={`${special!.name}の苗のイラスト`} />
              <p className="gcard-name">{special!.name}</p>
              <p>{special!.ui.reveal_body}</p>
            </div>
          ) : (
            <button type="button" className="btn btn-primary gbtn" onClick={() => setRevealSpecial(true)} data-testid="special-reveal">
              {special!.ui.receive_button}
            </button>
          )}
        </Sheet>
      )}
    </main>
  );
}
