import type { CSSProperties } from 'react';
import { GAME_KEY_ROWS, GAME_KEYS, GAME_KEYS_WIDTH } from '../../core/game/gameKeyboard';

/** キーの上に小さく添える、そのキーで入力するかな記号 */
const SUB: Record<string, string> = { '-': 'ー', '/': '・', ',': '、', '.': '。' };

/**
 * ゲーム画面のキーボード（このゲームで使うキーだけ。実物の位置関係のまま、全体を中央に置きます）。
 * 通常のタイピングモードのキーボード（ui/Keyboard.tsx）は変えていません。
 * onType を指定すると、画面のキーをタップして入力できます。
 */
export function GameKeyboard({ nextKey, colored, highlight, onType }: { nextKey: string | null; colored: boolean; highlight: boolean; onType?: (ch: string) => void }) {
  const target = highlight && nextKey ? nextKey.toLowerCase() : null;
  return (
    <div
      className={`gkb ${colored ? '' : 'kb-plain'} ${onType ? 'gkb-touch' : ''}`}
      style={{ ['--cols' as string]: String(GAME_KEYS_WIDTH), ['--rows' as string]: String(GAME_KEY_ROWS) } as CSSProperties}
      role={onType ? 'group' : 'img'}
      aria-label={onType ? '画面のキーボード' : target ? `次は「${target.toUpperCase()}」キー` : 'キーボード'}
      data-testid="game-keyboard"
    >
      <div className="gkb-keys">
        {GAME_KEYS.map((k) => {
          const c = k.def.char;
          const cls = `key gkb-key f-${k.def.finger} ${k.def.home ? 'home' : ''} ${target === c ? 'target' : ''}`;
          const style = { ['--x' as string]: String(k.x), ['--row' as string]: String(k.row) } as CSSProperties;
          const content = (
            <>
              {SUB[c] && <span className="shift-label">{SUB[c]}</span>}
              <span>{k.def.label}</span>
            </>
          );
          return onType ? (
            <button
              type="button"
              key={k.def.id}
              className={cls}
              style={style}
              tabIndex={-1}
              aria-label={k.def.label}
              data-key={c}
              onPointerDown={(e) => {
                // 端末のソフトウェアキーボードが出ないよう、フォーカスを移しません
                e.preventDefault();
                onType(c);
              }}
              onKeyDown={(e) => e.preventDefault()}
            >
              {content}
            </button>
          ) : (
            <div key={k.def.id} className={cls} style={style} aria-hidden="true" data-key={c}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
