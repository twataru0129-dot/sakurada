import { FINGER_LABEL, type Finger, type KeyTarget } from '../core/keyboardLayout';

/** 両手の指のガイド。次に押すキーと同じ色で指を示し、指の名前も文字で表示します */
export function Hands({ target }: { target: KeyTarget | null }) {
  const on = new Set<Finger>();
  if (target) {
    on.add(target.key.finger);
    if (target.shift) on.add(target.shift.finger);
  }
  // 指の位置（左手：小指→親指、右手：親指→小指）
  const left: Array<[Finger, number, number, number]> = [
    ['L5', 18, 52, 46], ['L4', 44, 30, 66], ['L3', 70, 20, 76], ['L2', 96, 32, 64], ['T', 124, 82, 40],
  ];
  const right: Array<[Finger, number, number, number]> = [
    ['T', 180, 82, 40], ['R2', 210, 32, 64], ['R3', 236, 20, 76], ['R4', 262, 30, 66], ['R5', 288, 52, 46],
  ];
  const finger = ([f, x, y, h]: [Finger, number, number, number], side: string) => (
    <rect
      key={side + f}
      className={`finger f-${f} ${on.has(f) && (f !== 'T' || target?.key.finger === 'T') ? 'on' : ''}`}
      x={x}
      y={y}
      width={22}
      height={h}
      rx={11}
    />
  );
  const label = target
    ? [FINGER_LABEL[target.key.finger], target.shift ? `${FINGER_LABEL[target.shift.finger]}（Shift）` : '']
        .filter(Boolean)
        .join(' ＋ ')
    : '';
  return (
    <div className="hands">
      <svg viewBox="0 0 330 170" aria-hidden="true">
        <rect className="palm" x={12} y={96} width={118} height={68} rx={24} />
        <rect className="palm" x={200} y={96} width={118} height={68} rx={24} />
        {left.map((d) => finger(d, 'l'))}
        {right.map((d) => finger(d, 'r'))}
        <text x={70} y={160} textAnchor="middle" fontSize="13" fill="#5f4f56">左手</text>
        <text x={260} y={160} textAnchor="middle" fontSize="13" fill="#5f4f56">右手</text>
      </svg>
      <div className="finger-label" aria-live="off">{label ? `使う指：${label}` : '　'}</div>
    </div>
  );
}
