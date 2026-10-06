import { GAMES } from '../../core/game/registry';
import { navigate } from '../../state/router';
import { BackLink } from '../../ui/common';

/** ゲームの選択（遊べるゲームだけを並べます） */
export function GameSelect() {
  return (
    <main>
      <BackLink to="/home">ホームにもどる</BackLink>
      <h1 style={{ marginTop: 12 }}>ゲームモード</h1>
      <p>遊ぶゲームをえらんでください。</p>
      <div className="grid grid-2">
        {GAMES.map((g) => (
          <button key={g.id} type="button" className="card-button game-card" onClick={() => navigate(g.path)} data-testid={`game-card-${g.id}`}>
            <img src={g.image} alt={g.imageAlt} width={1536} height={1024} className="game-card-img" />
            <span className="title">{g.title}</span>
            <span>{g.description}</span>
            <span className="badge badge-ok">遊べます</span>
          </button>
        ))}
      </div>
    </main>
  );
}
