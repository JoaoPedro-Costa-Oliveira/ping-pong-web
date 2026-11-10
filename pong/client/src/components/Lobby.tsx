import { useState, type FormEvent } from "react";

interface LobbyProps {
  connected: boolean;
  busy: boolean;
  error: string | null;
  onCreate(name: string): void;
  onJoin(name: string, code: string): void;
  onTyping(): void;
}

/* Página inicial: configurações mínimas (nome) e entrada em uma sala */
export function Lobby({ connected, busy, error, onCreate, onJoin, onTyping }: LobbyProps) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const disabled = !connected || busy;

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    onCreate(name);
  }

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    onJoin(name, code);
  }

  return (
    <main className="lobby">
      <header className="lobby-header">
        <h1>🏓 Pong Online</h1>
        <p>Dois jogadores, dois computadores. O servidor é o juiz da partida.</p>
      </header>

      <section className="card">
        <label className="field">
          <span>Seu nome</span>
          <input
            value={name}
            maxLength={16}
            placeholder="Ex.: Ana"
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              onTyping();
            }}
          />
        </label>

        <form className="lobby-action" onSubmit={handleCreate}>
          <h2>Criar uma sala</h2>
          <p className="hint">Você recebe um código para passar ao seu oponente.</p>
          <button type="submit" className="btn btn-primary" disabled={disabled}>
            Criar sala
          </button>
        </form>

        <div className="divider">ou</div>

        <form className="lobby-action" onSubmit={handleJoin}>
          <h2>Entrar numa sala</h2>
          <label className="field">
            <span>Código da sala</span>
            <input
              className="code-input"
              value={code}
              maxLength={4}
              placeholder="ABCD"
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                onTyping();
              }}
            />
          </label>
          <button type="submit" className="btn btn-secondary" disabled={disabled}>
            Entrar
          </button>
        </form>

        <p className="error" role="alert">
          {error}
        </p>
        <p className={connected ? "connection ok" : "connection off"}>
          <span className="dot" /> {connected ? "Conectado ao servidor" : "Conectando ao servidor…"}
        </p>
      </section>
    </main>
  );
}
