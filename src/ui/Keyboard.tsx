import { useState } from 'react';
import { compactRows, FINGER_LABEL, KEY_ROWS, type KeyDef, type KeyTarget } from '../core/keyboardLayout';

interface Props {
  target: KeyTarget | null;
  /** 次に入力する文字（狭い画面用の配列で、記号キーを強調するため） */
  targetChar?: string | null;
  /** 色分け（指のガイド） */
  colored: boolean;
  /** 画面タップ入力。指定するとキーが押せるボタンになります */
  onType?: (ch: string) => void;
  compact?: boolean;
}

/**
 * 画面のキーボード。
 * 実物のキーボードを使うときは表示だけ（押せません）。画面タップのときは各キーがボタンになります。
 * 次に押すキーは、指と同じ色・太い枠・「▼」で示します（色だけに頼りません）。
 */
export function Keyboard({ target, targetChar, colored, onType, compact }: Props) {
  const [shift, setShift] = useState(false);
  const rows = compact ? compactRows() : KEY_ROWS;
  const interactive = !!onType;

  const press = (key: KeyDef) => {
    if (!onType) return;
    if (key.special === 'shiftL' || key.special === 'shiftR') {
      setShift((s) => !s);
      return;
    }
    if (key.special === 'backspace' || key.special === 'enter') return;
    const ch = shift && key.shift ? key.shift : key.char;
    setShift(false);
    onType(ch);
  };

  const isTarget = (key: KeyDef) => {
    if (!target) return false;
    if (compact) return !key.special && !!targetChar && key.char === targetChar.toLowerCase();
    return target.key.id === key.id || target.shift?.id === key.id;
  };

  return (
    <div
      className={`kb ${colored ? '' : 'kb-plain'} ${interactive ? 'kb-touch' : ''}`}
      role={interactive ? 'group' : 'img'}
      aria-label={interactive ? '画面のキーボード' : target ? `次は ${describe(target)}` : 'キーボード'}
    >
      {rows.map((row, i) => (
        <div className="kb-row" key={i}>
          {row.map((key) => {
            const cls = `key f-${key.finger} ${key.home ? 'home' : ''} ${isTarget(key) ? 'target' : ''} ${
              (key.special === 'shiftL' || key.special === 'shiftR') && shift ? 'shift-on' : ''
            }`;
            const style = { ['--w' as string]: String(key.width ?? 1) } as React.CSSProperties;
            const content = (
              <>
                {key.shiftLabel && !compact && <span className="shift-label">{key.shiftLabel}</span>}
                <span>{key.label}</span>
              </>
            );
            if (interactive && key.special !== 'backspace' && key.special !== 'enter') {
              return (
                <button
                  type="button"
                  key={key.id}
                  className={cls}
                  style={style}
                  tabIndex={-1}
                  aria-label={keyAria(key)}
                  aria-pressed={key.special?.startsWith('shift') ? shift : undefined}
                  onPointerDown={(e) => {
                    // ソフトウェアキーボードが出ないよう、フォーカスを移しません
                    e.preventDefault();
                    press(key);
                  }}
                  onKeyDown={(e) => e.preventDefault()}
                >
                  {content}
                </button>
              );
            }
            return (
              <div key={key.id} className={cls} style={style} aria-hidden="true">
                {content}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function keyAria(key: KeyDef): string {
  if (key.special === 'space') return 'スペース';
  if (key.special?.startsWith('shift')) return 'シフト';
  return key.label;
}

export function describe(t: KeyTarget): string {
  const name = t.key.special === 'enter' ? 'Enter' : t.key.special === 'space' ? 'スペース' : t.key.label;
  const shift = t.shift ? `（${FINGER_LABEL[t.shift.finger]}で Shift を押しながら）` : '';
  return `「${name}」キー・${FINGER_LABEL[t.key.finger]}${shift}`;
}
