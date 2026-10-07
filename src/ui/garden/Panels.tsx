/**
 * 桜ガーデンの画面（お店・図鑑・持ちもの・遊び方）。どれも庭の上に重ねて開き、「閉じる」か Esc で閉じます。
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  COPY,
  DECO_CATALOG,
  DECO_KINDS,
  fill,
  HELP_PAGES,
  STANDARD_SPECIES,
  TREE_CATALOG,
  treeEntry,
  type DecoKind,
  type StandardSpecies,
} from '../../core/garden/config';
import {
  decoCounts,
  decoPrice,
  FIRST_EVENT_ID,
  isSpeciesUnlocked,
  newId,
  plantedAt,
  stageOf,
  treePrice,
  type GardenEventType,
  type GardenState,
  type TreeInstance,
} from '../../core/garden/state';
import { decoSprite, treeSprite, type SpecialSprites } from './assets';
import { treeName } from './GardenScene';

export interface SpecialInfo {
  name: string;
  reading: string;
  flowerColor: string;
  treeShape: string;
  description: string;
  sourceNote: string;
  /** 型だけを参照します（実際の読み込みは届いたあとの import()） */
  ui: typeof import('../../core/garden/special').SPECIAL_UI;
  sprites: SpecialSprites;
}

type Act = (type: GardenEventType, data?: Record<string, unknown>, id?: string) => boolean;

export function Sheet({ title, onClose, children, testId }: { title: string; onClose: () => void; children: ReactNode; testId: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // 開いたときに画面の中へ移り、閉じたら元の場所へ戻ります（開いている間の再描画では動かしません）
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="gsheet-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="gsheet modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-testid={testId}>
        <div className="gsheet-head">
          <h2>{title}</h2>
          <button type="button" className="btn gbtn" onClick={onClose} data-testid="sheet-close">
            {COPY.buttons.close}
          </button>
        </div>
        <div className="gsheet-body">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- お店

type Offer = { kind: 'tree'; species: StandardSpecies; id: string } | { kind: 'deco'; deco: DecoKind; id: string };

export function ShopPanel({ state, act, onClose }: { state: GardenState; act: Act; onClose: () => void }) {
  const [tab, setTab] = useState<'tree' | 'deco'>('tree');
  /** 確認中の交換（ID は確認を開いたときに1つだけ作ります。二度押しても1回だけ交換されます） */
  const [offer, setOffer] = useState<Offer | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const confirm = () => {
    if (!offer || done === offer.id) return;
    setDone(offer.id);
    const ok = offer.kind === 'tree' ? act('buy_tree', { species: offer.species, tree: newId('tree') }, offer.id) : act('buy_deco', { kind: offer.deco }, offer.id);
    const name = offer.kind === 'tree' ? treeEntry(offer.species).name : DECO_CATALOG.find((d) => d.id === offer.deco)!.name;
    setMessage(ok ? fill(COPY.shop.exchanged, { name }) : '交換できませんでした。');
    setOffer(null);
  };
  const offerName = offer ? (offer.kind === 'tree' ? treeEntry(offer.species).name : DECO_CATALOG.find((d) => d.id === offer.deco)!.name) : '';
  const offerPrice = offer ? (offer.kind === 'tree' ? (treePrice(state, offer.species) as number) : decoPrice(offer.deco)) : 0;

  return (
    <Sheet title={COPY.navigation.shop} onClose={onClose} testId="shop">
      <p>{COPY.shop.intro}</p>
      <p className="gsheet-balance">
        {COPY.labels.petals} <strong data-testid="shop-petals">{state.petals}</strong>枚
      </p>
      <div className="gtabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'tree'} className={`gtab ${tab === 'tree' ? 'is-on' : ''}`} onClick={() => setTab('tree')} data-testid="shop-tab-tree">
          {COPY.shop.tree_tab}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'deco'} className={`gtab ${tab === 'deco' ? 'is-on' : ''}`} onClick={() => setTab('deco')} data-testid="shop-tab-deco">
          {COPY.shop.decoration_tab}
        </button>
      </div>
      <p className="gcard-msg" aria-live="polite" data-testid="shop-message">
        {message}
      </p>
      <ul className="glist">
        {tab === 'tree'
          ? TREE_CATALOG.map((t) => {
              const unlocked = isSpeciesUnlocked(state, t.id);
              const price = treePrice(state, t.id);
              const owned = state.trees.filter((x) => x.species === t.id).length;
              const sprite = treeSprite(t.id, 'sapling', null);
              const short = typeof price === 'number' ? price - state.petals : 0;
              return (
                <li key={t.id} className="gitem" data-testid={`shop-tree-${t.id}`}>
                  {sprite && <img src={sprite.url} alt="" className="gitem-img" />}
                  <div className="gitem-body">
                    <p className="gitem-name">
                      {t.name}
                      <span className="hint">（{t.name_reading}）</span>
                    </p>
                    <p className="gitem-desc">{unlocked ? t.shop_description : fill(COPY.labels.unlock_condition, { count: t.unlock_completed_problems })}</p>
                    <p className="gitem-meta">
                      {price === 'free' ? COPY.shop.initial_tree : fill(COPY.labels.price, { count: price })}　{COPY.labels.owned} {owned}
                    </p>
                    {unlocked && price !== 'free' && short > 0 && <p className="gitem-short">{fill(COPY.shop.shortage, { shortage: short })}</p>}
                  </div>
                  {price === 'free' ? (
                    <button type="button" className="btn btn-primary gbtn" onClick={() => act('first', {}, FIRST_EVENT_ID) && setMessage(COPY.shop.received)} data-testid="shop-receive">
                      {COPY.shop.receive}
                    </button>
                  ) : (
                    <button type="button" className="btn gbtn" disabled={!unlocked || short > 0} onClick={() => setOffer({ kind: 'tree', species: t.id, id: newId('buy') })} data-testid={`shop-buy-${t.id}`}>
                      {unlocked ? COPY.buttons.exchange : 'まだ交換できません'}
                    </button>
                  )}
                </li>
              );
            })
          : DECO_KINDS.map((k) => {
              const d = DECO_CATALOG.find((x) => x.id === k)!;
              const c = decoCounts(state, k);
              const short = d.price_petals - state.petals;
              return (
                <li key={k} className="gitem" data-testid={`shop-deco-${k}`}>
                  <img src={decoSprite(k).url} alt="" className="gitem-img" />
                  <div className="gitem-body">
                    <p className="gitem-name">{d.name}</p>
                    <p className="gitem-desc">{d.description}</p>
                    <p className="gitem-meta">
                      {fill(COPY.labels.price, { count: d.price_petals })}　{COPY.labels.owned} <span data-testid={`owned-${k}`}>{c.owned}</span>
                    </p>
                    {short > 0 && <p className="gitem-short">{fill(COPY.shop.shortage, { shortage: short })}</p>}
                  </div>
                  <button type="button" className="btn gbtn" disabled={short > 0} onClick={() => setOffer({ kind: 'deco', deco: k, id: newId('buy') })} data-testid={`shop-buy-${k}`}>
                    {COPY.buttons.exchange}
                  </button>
                </li>
              );
            })}
      </ul>
      {offer && (
        <div className="gconfirm" role="alertdialog" aria-modal="true" aria-label="交換の確認" data-testid="shop-confirm">
          <p>{fill(COPY.shop.confirm, { price: offerPrice, name: offerName })}</p>
          <div className="row">
            <button type="button" className="btn btn-primary gbtn" onClick={confirm} disabled={done === offer.id} autoFocus data-testid="shop-confirm-yes">
              {COPY.buttons.exchange}
            </button>
            <button type="button" className="btn gbtn" onClick={() => setOffer(null)}>
              {COPY.buttons.cancel}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- 図鑑

export function CollectionPanel({ state, special, onClose }: { state: GardenState; special: SpecialInfo | null; onClose: () => void }) {
  const [open, setOpen] = useState<StandardSpecies | 'special' | null>(null);
  const [zoom, setZoom] = useState(false);
  const done = STANDARD_SPECIES.filter((s) => state.bloomed.has(s)).length;
  const showSpecial = !!special && state.bloomed.has('special');
  if (open) {
    const isSpecial = open === 'special';
    const e = isSpecial ? null : treeEntry(open);
    const bloomed = state.bloomed.has(open);
    const sprite = isSpecial ? special!.sprites.bloom : treeSprite(open, bloomed ? 'bloom' : 'sapling', null);
    return (
      <Sheet title={isSpecial ? special!.ui.collection_section : COPY.navigation.collection} onClose={onClose} testId="collection-detail">
        <button type="button" className="btn gbtn" onClick={() => (zoom ? setZoom(false) : setOpen(null))}>
          ← もどる
        </button>
        <div className={`gdetail ${zoom ? 'is-zoom' : ''}`}>
          {sprite && (bloomed || !zoom) && <img src={sprite.url} alt={`${isSpecial ? special!.name : e!.name}の${bloomed ? '満開の' : ''}イラスト`} className="gdetail-img" />}
          {!zoom && (
            <div>
              <h3 data-testid="collection-name">
                {isSpecial ? special!.name : e!.name}
                <span className="hint">（{isSpecial ? special!.reading : e!.name_reading}）</span>
              </h3>
              <dl className="gdl">
                <dt>{COPY.collection.flower_color}</dt>
                <dd>{isSpecial ? special!.flowerColor : e!.flower_color}</dd>
                <dt>{COPY.collection.tree_shape}</dt>
                <dd>{isSpecial ? special!.treeShape : e!.tree_shape}</dd>
                <dt>{COPY.collection.description}</dt>
                <dd>{isSpecial ? special!.description : e!.description}</dd>
              </dl>
              {isSpecial && <p className="hint">{special!.sourceNote}</p>}
              <p className="gitem-meta">{bloomed ? COPY.labels.bloomed : state.trees.some((t) => t.species === open) ? COPY.labels.not_bloomed : COPY.labels.not_acquired}</p>
              {bloomed && (
                <button type="button" className="btn gbtn" onClick={() => setZoom(true)} data-testid="collection-zoom">
                  {COPY.collection.enlarge}
                </button>
              )}
              <p className="hint">{COPY.collection.illustration_note}</p>
            </div>
          )}
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title={COPY.navigation.collection} onClose={onClose} testId="collection">
      <p>{COPY.collection.intro}</p>
      <p className="gsheet-balance" data-testid="collection-count">
        {fill(COPY.labels.collection_count, { completed: done })}
      </p>
      {done === STANDARD_SPECIES.length && <p className="msg msg-ok">{COPY.collection.all_standard_complete}</p>}
      <ul className="ggrid">
        {TREE_CATALOG.map((t) => {
          const bloomed = state.bloomed.has(t.id);
          const owned = state.trees.some((x) => x.species === t.id);
          const sprite = treeSprite(t.id, bloomed ? 'bloom' : 'sapling', null);
          return (
            <li key={t.id}>
              <button type="button" className={`gtile ${bloomed ? 'is-bloomed' : ''}`} onClick={() => setOpen(t.id)} data-testid={`collection-${t.id}`}>
                {sprite && <img src={sprite.url} alt="" className={bloomed ? '' : 'is-dim'} />}
                <span className="gtile-name">{t.name}</span>
                <span className="gtile-status">{bloomed ? COPY.labels.bloomed : owned ? COPY.labels.not_bloomed : !isSpeciesUnlocked(state, t.id) ? fill(COPY.labels.unlock_condition, { count: t.unlock_completed_problems }) : COPY.labels.not_acquired}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {showSpecial && (
        <section className="gspecial" aria-label={special!.ui.collection_section} data-testid="collection-special">
          <h3>{special!.ui.collection_section}</h3>
          <button type="button" className="gtile is-bloomed" onClick={() => setOpen('special')}>
            <img src={special!.sprites.bloom.url} alt="" />
            <span className="gtile-name">{special!.name}</span>
            <span className="gtile-status">{special!.ui.collection_note}</span>
          </button>
        </section>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- 持ちもの

export function InventoryPanel({
  state,
  special,
  onGrow,
  onPlantTree,
  onPlaceDeco,
  act,
  onClose,
}: {
  state: GardenState;
  special: SpecialInfo | null;
  onGrow: (t: TreeInstance) => void;
  onPlantTree: (t: TreeInstance) => void;
  onPlaceDeco: (k: DecoKind) => void;
  act: Act;
  onClose: () => void;
}) {
  const decos = DECO_KINDS.filter((k) => state.decoOwned[k] > 0);
  const visibleTrees = state.trees.filter((t) => t.species !== 'special' || special);
  return (
    <Sheet title={COPY.navigation.inventory} onClose={onClose} testId="inventory">
      {visibleTrees.length === 0 && decos.length === 0 && <p>{COPY.garden.empty_inventory}</p>}
      {visibleTrees.length > 0 && (
        <>
          <h3>桜</h3>
          <p className="hint">{COPY.garden.unplaced_trees}</p>
          <ul className="glist">
            {visibleTrees.map((t) => {
              const stage = stageOf(t);
              const sprite = treeSprite(t.species, stage, special?.sprites ?? null);
              const at = plantedAt(state, t.id);
              return (
                <li key={t.id} className="gitem" data-testid={`inv-tree-${t.id}`}>
                  {sprite && <img src={sprite.url} alt="" className="gitem-img" />}
                  <div className="gitem-body">
                    <p className="gitem-name">{treeName(t.species, special?.name ?? null)}</p>
                    <p className="gitem-meta">
                      {COPY.growth.stages[stage]}・{at ? `「${state.gardens[at.garden]!.name}」に植えています` : '持ちもの'}
                    </p>
                  </div>
                  <div className="gitem-actions">
                    <button type="button" className="btn gbtn" onClick={() => onGrow(t)} data-testid="inv-grow">
                      育てる
                    </button>
                    {at ? (
                      <button type="button" className="btn gbtn" onClick={() => act('unplant', { tree: t.id })} data-testid="inv-unplant">
                        {COPY.buttons.put_away}
                      </button>
                    ) : (
                      <button type="button" className="btn gbtn" onClick={() => onPlantTree(t)} data-testid="inv-plant">
                        {COPY.buttons.place}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {decos.length > 0 && (
        <>
          <h3>庭の飾り</h3>
          <ul className="glist">
            {decos.map((k) => {
              const c = decoCounts(state, k);
              return (
                <li key={k} className="gitem" data-testid={`inv-deco-${k}`}>
                  <img src={decoSprite(k).url} alt="" className="gitem-img" />
                  <div className="gitem-body">
                    <p className="gitem-name">{DECO_CATALOG.find((d) => d.id === k)!.name}</p>
                    <p className="gitem-meta" data-testid={`inv-count-${k}`}>
                      {COPY.labels.owned} {c.owned}（庭に置いている数 {c.placed}・持ちもの {c.available}）
                    </p>
                  </div>
                  <button type="button" className="btn gbtn" disabled={c.available <= 0} onClick={() => onPlaceDeco(k)} data-testid={`inv-place-${k}`}>
                    {COPY.buttons.place}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- 遊び方

export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="遊び方" onClose={onClose} testId="help">
      {HELP_PAGES.map((h) => (
        <section key={h.title} className="ghelp">
          <h3>{h.title}</h3>
          <p>{h.body}</p>
        </section>
      ))}
    </Sheet>
  );
}
