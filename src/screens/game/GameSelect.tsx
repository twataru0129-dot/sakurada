import { GAMES, type GameEntry } from '../../core/game/registry';
import { useApp } from '../../state/AppContext';
import { navigate } from '../../state/router';
import { BackLink } from '../../ui/common';
import { loadVolume } from '../../ui/bowie/audio';
import { startTitleCall } from '../../ui/bowie/TitleCall';

/** ゲームの選択（遊べるゲームだけを並べます） */
export function GameSelect() {
  const { settings } = useApp();
  // 決定（クリック・タップ・Enter／スペース）のときだけ呼ばれます。ポインターを重ねる・フォーカスを移すだけでは何もしません
  const open = (g: GameEntry) => {
    // ボウイの爆弾遊戯：タイトルコールと白・黒の幕を通ってゲーム画面へ（演出中にもう一度押しても二重になりません）
    if (g.id === 'bowie-bomb') startTitleCall({ muted: !settings.sound, volume: loadVolume() });
    else navigate(g.path);
  };
  return (
    <main>
      <BackLink to="/home">ホームにもどる</BackLink>
      <h1 style={{ marginTop: 12 }}>ゲームモード</h1>
      <p>遊ぶゲームをえらんでください。</p>
      <div className="grid grid-2">
        {GAMES.map((g) => (
          <button key={g.id} type="button" className="card-button game-card" onClick={() => open(g)} data-testid={`game-card-${g.id}`}>
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
