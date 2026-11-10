import { GameScreen } from "./components/GameScreen";
import { Lobby } from "./components/Lobby";
import { useGame } from "./hooks/useGame";

export function App() {
  const game = useGame();
  const { session, room, snapshot } = game;

  if (session && room && snapshot) {
    return <GameScreen game={game} room={room} snapshot={snapshot} mySide={session.side} />;
  }

  return (
    <Lobby
      connected={game.connected}
      busy={game.busy}
      error={game.error}
      onCreate={game.createRoom}
      onJoin={game.joinRoom}
      onTyping={game.clearError}
    />
  );
}
