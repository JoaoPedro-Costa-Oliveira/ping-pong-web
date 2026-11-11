# 🏓 Pong Online (AV2)

Pong multiplayer em **computadores diferentes**. O **back-end** (Node + TypeScript + Socket.IO) controla todo o jogo —
física, regras, pontuação, de quem é a vez de sacar — e o **front-end** (React + TypeScript + Vite) só envia comandos e
desenha o estado recebido.

> Os arquivos `index.html`, `css/` e `js/` na raiz desta pasta são a versão da 1ª unidade (JS puro, mesma tela). Esta versão está em `server/` e `client/`.

## Como rodar

Requer Node 20+.

```bash
npm install
npm run dev        # servidor em :3001 + front-end em http://localhost:5173
```

Para jogar em dois computadores da mesma rede:

1. No computador que executa o servidor, rode `ipconfig` no terminal e procure o endereço IPv4 da rede (por exemplo, `192.168.1.10`).
2. Nos dois computadores, abra `http://<IPv4>:5173` no navegador. Não use `localhost` no computador convidado.
3. Informe os nomes: um jogador cria a sala e compartilha o código de 4 caracteres; o outro entra com esse código.
4. Se a página não abrir no outro computador, verifique se ambos estão na mesma rede e se o firewall permite conexões à porta 5173.

Para jogar pela internet, o servidor precisa ser publicado num endereço acessível aos dois jogadores; o IP local
`192.168...` não funciona fora da rede. Em produção, o servidor entrega o React e o Socket.IO na mesma porta:

Produção (um único processo/porta, o servidor entrega o front-end compilado):

```bash
npm run build
npm start          # http://localhost:3001
```

Outros comandos: `npm test` (regras + integração com 2 clientes Socket.IO) e `npm run typecheck`.

## Controles

| Ação | Teclas |
| --- | --- |
| Mover a raquete | `W` / `S` ou `↑` / `↓` (ou botões ▲▼ em telas de toque) |
| Sacar (quando for a sua vez) | `Espaço` / `Enter` ou botão **Sacar** |

As raquetes têm uma área de impacto maior e se movem mais rápido. Durante a partida, o menu **Áudio** permite ligar/desligar a música e os efeitos sonoros, além de ajustar os volumes. O áudio começa após a primeira interação com o jogo e as preferências ficam salvas neste navegador.

Regras: primeiro a 5 pontos vence. **Quem sofre o ponto saca a próxima bola** ("passar a vez"); se não sacar em 8 s o
servidor saca automaticamente. Durante cada jogada, a bola acelera com o tempo e a cada rebatida, até um limite;
a velocidade volta ao valor inicial no saque seguinte.

## Arquitetura

```
server/src
  protocol.ts     contrato de mensagens (só tipos; o cliente o importa com `import type`)
  game.ts         classes Paddle, Ball e PongGame: física, colisões, pontos, vez de sacar
  room.ts         Room: jogadores, loop de 60 ticks/s, pausa/reconexão, revanche, log e histórico
  roomManager.ts  criação de salas (código), validação de nome/código
  server.ts       Express + Socket.IO: valida entradas e encaminha para a sala
client/src
  hooks/useGame.ts      única conexão com o servidor (estado da sala + snapshot)
  hooks/useControls.ts  teclado/toque -> comandos
  components/           Lobby (página inicial), GameScreen, Court (SVG), Scoreboard, SidePanels
```

Fluxo de mensagens:

| Cliente → Servidor | Servidor → Cliente |
| --- | --- |
| `room:create`, `room:join`, `room:rejoin`, `room:leave` | `room:info` (jogadores, fase, vez, tabela de pontos, lista de eventos) — só quando algo muda |
| `player:input` (`-1/0/1`, apenas quando muda), `player:serve`, `player:rematch` | `game:state` (bola, raquetes, placar) — 60×/s |

O servidor ignora `serve` de quem não tem a vez, valida todos os payloads e só aceita comandos do socket dono do jogador.
Se um jogador cai, a partida pausa por 30 s; ele volta automaticamente (sessão guardada em `sessionStorage`).
Passado o prazo, o oponente vence por desistência.

## Requisitos da unidade 1 mantidos

- Animação com figuras (raquetes e bola em SVG) · placar com nomes e pontos · classes (`Paddle`, `Ball`, `PongGame`, `Room`).
- **Tabela dinâmica**: linhas inseridas a cada ponto e removidas na revanche (`PointsTable`).
- **Lista dinâmica**: eventos inseridos e os mais antigos removidos (`EventLog`).
- **Estilos dinâmicos**: painel e raquete de quem tem a vez ficam verdes e brilham; vencedor, desconectado etc. mudam via classes.
- Duas telas (inicial com nome e sala → jogo), CSS em arquivo separado, sem bibliotecas de UI/CSS de terceiros.

## "Sem usar o DOM do JS"

Nenhum `getElementById`/`querySelector`/`innerHTML`/`canvas`: toda a interface é JSX declarativo e os eventos são os
do React (`onKeyDown`, `onClick`…). As únicas referências diretas ao DOM são `createRoot(...)` em `main.tsx`
(montagem do React) e um `ref` em `GameScreen` para dar foco ao teclado.
