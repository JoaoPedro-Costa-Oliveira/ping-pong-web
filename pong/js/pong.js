/* =========================================================
   Pong - Dois Jogadores - Lógica do jogo (classes) + laço de animação
========================================================= */

const PONTOS_PARA_VENCER = 5;
const VELOCIDADE_RAQUETE = 6;
const VELOCIDADE_INICIAL_BOLA = 6;
// A cada quadro (~60/s) a bola acelera; zera a cada ponto e para no limite máximo
const ACELERACAO_BOLA_POR_QUADRO = 0.0008;
const MULTIPLICADOR_MAXIMO_BOLA = 2.5;

/* Representa uma raquete controlada por um jogador */
class Raquete {
  constructor(x, y, largura, altura) {
    this.x = x;
    this.y = y;
    this.largura = largura;
    this.altura = altura;
    this.pontos = 0;
  }

  mover(direcao, alturaMesa) {
    this.y += direcao * VELOCIDADE_RAQUETE;
    this.y = Math.max(0, Math.min(alturaMesa - this.altura, this.y));
  }

  get centroY() {
    return this.y + this.altura / 2;
  }
}

/* Representa a bola: posição, velocidade e raio */
class Bola {
  constructor(x, y, raio) {
    this.x = x;
    this.y = y;
    this.raio = raio;
    this.velocidadeX = 0;
    this.velocidadeY = 0;
    this.multiplicador = 1;
  }

  reiniciar(x, y, direcao) {
    this.x = x;
    this.y = y;
    this.multiplicador = 1;
    const anguloAleatorio = (Math.random() * 0.6 - 0.3) * Math.PI;
    this.velocidadeX = direcao * VELOCIDADE_INICIAL_BOLA * Math.cos(anguloAleatorio);
    this.velocidadeY = VELOCIDADE_INICIAL_BOLA * Math.sin(anguloAleatorio);
  }

  mover() {
    this.multiplicador = Math.min(
      MULTIPLICADOR_MAXIMO_BOLA,
      this.multiplicador + ACELERACAO_BOLA_POR_QUADRO
    );
    this.x += this.velocidadeX * this.multiplicador;
    this.y += this.velocidadeY * this.multiplicador;
  }
}

/* Orquestra o estado da partida: raquetes, bola, pontuação e regras.
   Mantida independente do desenho para facilitar, no futuro, uma versão online. */
class JogoPong {
  constructor(largura, altura) {
    this.largura = largura;
    this.altura = altura;

    const alturaRaquete = 90;
    const margem = 56;
    this.raqueteEsquerda = new Raquete(margem, altura / 2 - alturaRaquete / 2, 12, alturaRaquete);
    this.raqueteDireita = new Raquete(largura - margem - 12, altura / 2 - alturaRaquete / 2, 12, alturaRaquete);

    this.bola = new Bola(largura / 2, altura / 2, 8);
    this.bola.reiniciar(largura / 2, altura / 2, Math.random() < 0.5 ? -1 : 1);

    this.emAndamento = false;
    this.finalizado = false;
    this.vencedor = null;
    this.ultimoPontoDe = null;
  }

  atualizar() {
    if (!this.emAndamento || this.finalizado) {
      return;
    }

    this.bola.mover();

    // Colisão com as paredes superior/inferior
    if (this.bola.y - this.bola.raio <= 0 || this.bola.y + this.bola.raio >= this.altura) {
      this.bola.velocidadeY *= -1;
    }

    this._verificarColisaoRaquete(this.raqueteEsquerda, 1);
    this._verificarColisaoRaquete(this.raqueteDireita, -1);

    // Bola saiu pela esquerda: ponto do jogador 2
    if (this.bola.x + this.bola.raio < 0) {
      this._marcarPonto(this.raqueteDireita, "direita", -1);
    }

    // Bola saiu pela direita: ponto do jogador 1
    if (this.bola.x - this.bola.raio > this.largura) {
      this._marcarPonto(this.raqueteEsquerda, "esquerda", 1);
    }
  }

  _verificarColisaoRaquete(raquete, direcaoSaida) {
    const dentroVertical = this.bola.y >= raquete.y && this.bola.y <= raquete.y + raquete.altura;
    const tocandoHorizontal =
      direcaoSaida === 1
        ? this.bola.x - this.bola.raio <= raquete.x + raquete.largura && this.bola.x > raquete.x
        : this.bola.x + this.bola.raio >= raquete.x && this.bola.x < raquete.x + raquete.largura;

    const indoNaDirecaoDaRaquete =
      direcaoSaida === 1 ? this.bola.velocidadeX < 0 : this.bola.velocidadeX > 0;

    if (dentroVertical && tocandoHorizontal && indoNaDirecaoDaRaquete) {
      this.bola.velocidadeX *= -1;
      const impacto = (this.bola.y - raquete.centroY) / (raquete.altura / 2);
      this.bola.velocidadeY = impacto * VELOCIDADE_INICIAL_BOLA;
    }
  }

  _marcarPonto(raqueteQuePontuou, lado, direcaoNovaBola) {
    raqueteQuePontuou.pontos++;
    this.ultimoPontoDe = lado;

    if (raqueteQuePontuou.pontos >= PONTOS_PARA_VENCER) {
      this.finalizado = true;
      this.emAndamento = false;
      this.vencedor = lado;
    } else {
      this.bola.reiniciar(this.largura / 2, this.altura / 2, direcaoNovaBola);
    }
  }
}

/* =========================================================
   Controle de tela: liga a lógica do JogoPong ao canvas e à interface
========================================================= */
document.addEventListener("DOMContentLoaded", function () {
  const canvas = document.getElementById("mesaPong");
  const contexto = canvas.getContext("2d");

  const elementos = {
    pontosJogador1: document.getElementById("pontosJogador1"),
    pontosJogador2: document.getElementById("pontosJogador2"),
    painelJogador1: document.getElementById("painelJogador1"),
    painelJogador2: document.getElementById("painelJogador2"),
    mensagemVencedor: document.getElementById("mensagemVencedor"),
    btnIniciarPausar: document.getElementById("btnIniciarPausar"),
    btnReiniciar: document.getElementById("btnReiniciar"),
  };

  let jogo = new JogoPong(canvas.width, canvas.height);
  const teclasPressionadas = {};

  function desenharMesa() {
    // Mesa laranja com faixa central clara (estilo cartoon)
    contexto.fillStyle = "#ff7f5c";
    contexto.fillRect(0, 0, canvas.width, canvas.height);

    contexto.fillStyle = "#ffa77f";
    contexto.fillRect(0, canvas.height / 2 - 8, canvas.width, 16);

    // Rede: linha branca com contorno preto
    const xRede = canvas.width / 2;
    contexto.fillStyle = "#111111";
    contexto.fillRect(xRede - 8, 0, 16, canvas.height);
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(xRede - 4, 0, 8, canvas.height);
  }

  function desenharRaquete(raquete, corPa, ladoDireito) {
    const sentido = ladoDireito ? 1 : -1; // o cabo aponta para fora da mesa
    const raioX = 24;
    // A borda interna da pá coincide com a face de colisão da raquete
    const cx = raquete.x + raquete.largura / 2 - sentido * (raioX - raquete.largura / 2);
    const cy = raquete.centroY;

    contexto.lineWidth = 4;
    contexto.strokeStyle = "#111111";
    contexto.lineJoin = "round";

    // Cabo de madeira
    contexto.fillStyle = "#e8a04c";
    contexto.beginPath();
    contexto.roundRect(sentido === 1 ? cx + raioX - 6 : cx - raioX - 12, cy - 6, 18, 12, 4);
    contexto.fill();
    contexto.stroke();

    // Pá
    contexto.fillStyle = corPa;
    contexto.beginPath();
    contexto.ellipse(cx, cy, raioX, raquete.altura / 2, 0, 0, Math.PI * 2);
    contexto.fill();
    contexto.stroke();

    // Brilho
    contexto.strokeStyle = "rgba(255, 255, 255, 0.55)";
    contexto.lineWidth = 4;
    contexto.lineCap = "round";
    contexto.beginPath();
    contexto.moveTo(cx - 8, cy - raquete.altura / 2 + 16);
    contexto.lineTo(cx - 8, cy - raquete.altura / 2 + 34);
    contexto.stroke();
    contexto.lineCap = "butt";
  }

  // Rastro da bola: últimas posições, desenhadas com tamanho e opacidade decrescentes
  let rastro = [];

  function atualizarRastro(bola) {
    const ultimo = rastro[rastro.length - 1];
    if (ultimo && Math.hypot(bola.x - ultimo.x, bola.y - ultimo.y) > 80) {
      rastro = [];
    }
    if (!ultimo || ultimo.x !== bola.x || ultimo.y !== bola.y) {
      rastro.push({ x: bola.x, y: bola.y });
    }
    if (rastro.length > 10) {
      rastro.shift();
    }
  }

  function desenharBola(bola) {
    atualizarRastro(bola);

    rastro.forEach(function (ponto, indice) {
      const proporcao = (indice + 1) / rastro.length;
      contexto.beginPath();
      contexto.arc(ponto.x, ponto.y, bola.raio * proporcao * 0.9, 0, Math.PI * 2);
      contexto.fillStyle = "rgba(255, 255, 255, " + (proporcao * 0.45).toFixed(2) + ")";
      contexto.fill();
    });

    contexto.beginPath();
    contexto.arc(bola.x, bola.y, bola.raio, 0, Math.PI * 2);
    contexto.fillStyle = "#ffffff";
    contexto.fill();
    contexto.lineWidth = 3;
    contexto.strokeStyle = "#111111";
    contexto.stroke();
  }

  function desenharCena() {
    desenharMesa();
    desenharRaquete(jogo.raqueteEsquerda, "#1fb5ae", false);
    desenharRaquete(jogo.raqueteDireita, "#f0647a", true);
    desenharBola(jogo.bola);
  }

  function atualizarPlacar() {
    elementos.pontosJogador1.textContent = String(jogo.raqueteEsquerda.pontos);
    elementos.pontosJogador2.textContent = String(jogo.raqueteDireita.pontos);

    // Mudança dinâmica de estilo: destaca por instantes o painel de quem pontuou
    elementos.painelJogador1.classList.toggle("marcou", jogo.ultimoPontoDe === "esquerda");
    elementos.painelJogador2.classList.toggle("marcou", jogo.ultimoPontoDe === "direita");
  }

  function processarMovimentoRaquetes() {
    if (teclasPressionadas["w"]) jogo.raqueteEsquerda.mover(-1, canvas.height);
    if (teclasPressionadas["s"]) jogo.raqueteEsquerda.mover(1, canvas.height);
    if (teclasPressionadas["arrowup"]) jogo.raqueteDireita.mover(-1, canvas.height);
    if (teclasPressionadas["arrowdown"]) jogo.raqueteDireita.mover(1, canvas.height);
  }

  function exibirVencedor() {
    const nomeVencedor = jogo.vencedor === "esquerda" ? "Jogador 1" : "Jogador 2";
    elementos.mensagemVencedor.textContent = "🏆 " + nomeVencedor + " venceu a partida!";
    elementos.btnIniciarPausar.textContent = "Iniciar";
    elementos.btnIniciarPausar.disabled = true;
  }

  function laco() {
    processarMovimentoRaquetes();
    jogo.atualizar();
    desenharCena();
    atualizarPlacar();

    if (jogo.finalizado) {
      exibirVencedor();
      return;
    }

    requestAnimationFrame(laco);
  }

  function alternarIniciarPausar() {
    if (jogo.finalizado) {
      return;
    }

    jogo.emAndamento = !jogo.emAndamento;
    elementos.btnIniciarPausar.textContent = jogo.emAndamento ? "Pausar" : "Continuar";

    if (jogo.emAndamento) {
      requestAnimationFrame(laco);
    }
  }

  function reiniciarJogo() {
    jogo = new JogoPong(canvas.width, canvas.height);
    elementos.mensagemVencedor.textContent = "";
    elementos.btnIniciarPausar.disabled = false;
    elementos.btnIniciarPausar.textContent = "Iniciar";
    elementos.painelJogador1.classList.remove("marcou");
    elementos.painelJogador2.classList.remove("marcou");
    atualizarPlacar();
    desenharCena();
  }

  // Teclas que controlam o jogo: impede a rolagem padrão da página ao usá-las
  const TECLAS_DO_JOGO = ["w", "s", "arrowup", "arrowdown"];

  window.addEventListener("keydown", function (evento) {
    const tecla = evento.key.toLowerCase();
    if (TECLAS_DO_JOGO.includes(tecla)) {
      evento.preventDefault();
    }
    teclasPressionadas[tecla] = true;
  });

  window.addEventListener("keyup", function (evento) {
    const tecla = evento.key.toLowerCase();
    if (TECLAS_DO_JOGO.includes(tecla)) {
      evento.preventDefault();
    }
    teclasPressionadas[tecla] = false;
  });

  elementos.btnIniciarPausar.addEventListener("click", alternarIniciarPausar);
  elementos.btnReiniciar.addEventListener("click", reiniciarJogo);

  desenharCena();
  atualizarPlacar();
});
