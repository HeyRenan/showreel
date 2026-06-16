# Showreel

**Transforme uma URL + seletores CSS num visual pronto — screenshots anotados, GIFs de fluxo, gravações cinematográficas e capturas de terminal. Um comando cada. O agente nunca chuta pixel; toda saída é verificada pixel a pixel antes de salvar.**

[![ci](https://github.com/HeyRenan/showreel/actions/workflows/ci.yml/badge.svg)](https://github.com/HeyRenan/showreel/actions/workflows/ci.yml)
[![version](https://img.shields.io/badge/version-1.0.0-blue)](showreel/.claude-plugin/plugin.json)
[![tests](https://img.shields.io/badge/tests-247%20passing-brightgreen)](#testes)
[![license](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)
[![claude code](https://img.shields.io/badge/Claude%20Code-plugin-d97757)](https://claude.com/claude-code)

[English](README.md) · [Português](README.pt-BR.md)

## Showcase

[![Veja o showcase completo](assets/showcase-poster.png)](https://github.com/HeyRenan/showreel/releases/download/v1.0.0/showcase.mp4)

*Um take só, cada recurso — drawer, câmera, lupa, spotlight, blur ao vivo, formulário digitado, escolha de região, deploy de um clique. Gerado inteiramente pelo plugin na página demo embutida. ([clique pra tocar o MP4 completo](https://github.com/HeyRenan/showreel/releases/download/v1.0.0/showcase.mp4))*

> Toda imagem deste README foi gerada pelo próprio Showreel, na página demo "Lumen" embutida. Rode os mesmos comandos, saem os mesmos arquivos.

## O que é

Plugin de [Claude Code](https://claude.com/claude-code) para **documentação visual**: explicar uma mudança, um bug, uma feature ou um passo de tutorial com uma imagem em vez de um parágrafo.

Você aponta pra uma página e nomeia elementos por **seletor CSS**. O Showreel mede o DOM, desenha a anotação exata no alvo, e **valida o resultado antes de sair** — uma captura ruim é erro, nunca um arquivo entregue. Sem loop de screenshot → olhar → tentar de novo, sem coordenada de pixel, sem queimar token chutando.

- **Autossuficiente** — embute o próprio Chromium headless; sem MCP de browser, sem credencial, nada enviado pra lugar nenhum.
- **Determinístico** — mesmos seletores entram, mesmos pixels saem. A posição é calculada, não chutada.
- **Barato** — `--batch` renderiza várias capturas num único launch do browser.

## Início rápido

```bash
# instalar
claude plugin marketplace add HeyRenan/showreel
claude plugin install showreel@showreel

# uma vez: checa a máquina + pré-aquece o motor (~90MB de Chromium, uma vez)
bash ~/.claude/plugins/showreel/showreel/scripts/preflight.sh
node ~/.claude/plugins/showreel/showreel/scripts/ensure-deps.mjs
```

Reinicie o Claude Code e invoque **`/showreel`** descrevendo o que capturar. Ou rode um script direto:

```bash
# anota um elemento, autovalidado
node scripts/prove.mjs https://example.com ".cards .card:first-child" out.png --label "Card de serviço verificado"
```

`/showreel:guide` abre um guia visual de setup. Instalação por pasta local e caminhos completos em [INSTALL.md](INSTALL.md).

## O que ele faz

Cada recurso, um comando. Todos os scripts ficam em `showreel/scripts/`. O agente sempre fala em **seletor + texto**, nunca em pixel.

| Recurso | Script | O que sai |
|---|---|---|
| **Prova anotada** | `prove.mjs` | Retângulo exato no DOM + callout + seta, verificado pixel a pixel (`vcheck`) — sai 0 só no PASS. Flags: `--circle`, `--blur "<sel>"`, `--zoom`, `--batch jobs.json`. |
| **Primitivas de anotação** | `demo.mjs` | Um conceito por imagem: `rect`, `circle`, `arrow`, `badge`, `blur`, `zoom`, `callout`, `label`. `--batch` = 8 capturas num launch só. |
| **Gravação de fluxo** | `rec.mjs` | GIF/MP4 narrado a partir de steps JSON — cursor, ripples, scroll, modais de narração, contador de passos. O GIF do topo é uma chamada só. |
| **Câmera cinematográfica** | `rec.mjs` | Movimento real de viewport: a página desliza + escala sob um transform animado. `camera` enquadra um elemento, `follow` persegue o cursor, `inset` é uma lupa. |
| **Spotlight / câmera lenta / auto-anotação** | `rec.mjs` | `spotlight` escurece tudo menos o alvo; `speed` por passo deixa uma animação lenta; `--auto-annotate` contorna um `click`/`fill` cru de graça. |
| **Render offline** | `rec.mjs --offline` | Renderiza no relógio virtual da página — pausas de leitura colapsam, takes com muito texto terminam numa fração do tempo. Mesmos steps, mesma saída. |
| **Gravação de terminal** | `tape.mjs` | Prova de CLI via [vhs](https://github.com/charmbracelet/vhs): steps JSON → `.tape` → GIF. O GIF do preflight abaixo é uma chamada só. |
| **Comparação before/after** | `compose.mjs`, `lh-ba.sh` | Dois PNGs ou dois GIFs lado a lado com rótulos. `lh-ba.sh` roda Lighthouse real nos dois branches. |
| **Otimizador de tamanho** | `shrink.mjs` | Re-encoda gif/png sem perda visível; `--target-kb` percorre uma escada de qualidade. Toda imagem daqui passou por ele. |
| **Corte justo** | `shot.mjs` | Só o elemento, sem anotação. |

### Gravação: como os steps funcionam

`rec.mjs` recebe steps JSON — cada um nomeia um elemento e o que fazer. O script cuida de todo o movimento.

```bash
node scripts/rec.mjs <url> --steps-json '[
 {"click":"#menu","note":"Drawer abre","badge":1,"screen":"Dashboard"},
 {"scrollTo":".cards","rect":true,"glide":true,"note":"Serviços ativos","badge":2},
 {"fill":"#email","text":"dana@example.com"},
 {"camera":{"sel":".kpis","zoom":1.3},"note":"Enquadrando os KPIs"},
 {"click":"#deploy","follow":1.6,"note":"Câmera persegue o cursor"}
]' out.gif
```

**31 chaves de step** (chave desconhecida é rejeitada na entrada): `click, scrollTo, wait, note, arrow, badge, rect, circle, blur, hide, glide, modal, marks, screen, zoom, topbar, bottombar, fill, text, delay, select, option, camera, glossary, stagger, accent, inset, follow, fade, spotlight, speed`.

**Escreva rápido:** `--dry` resolve cada seletor na página viva em <1s (`[ok]`/`[MISS]` por step, sem gravar) — corrija os misses, grave uma vez. `--pace fast` corta as pausas ~45% pra rascunho. `--contact-sheet` escreve um mosaico de ~24 frames pra o take se revisar sozinho.

### Veja cada um

Cada recurso, demonstrado — toda imagem gerada pelo plugin na página demo.

| | | |
|:---:|:---:|:---:|
| ![prove](assets/prove.png) | ![camera](assets/camera.gif) | ![marks](assets/marks.gif) |
| **prove** — prova anotada | **camera** — movimento de viewport | **marks** — sub-badges |
| ![modal](assets/modal.gif) | ![bars](assets/bars.gif) | ![spotlight](assets/spotlight.gif) |
| **modal** — narração | **bars** — contexto topo/base | **spotlight** — escurece tudo menos o alvo |
| ![speed](assets/speed.gif) | ![auto-annotate](assets/auto-annotate.gif) | ![stamp](assets/stamp.gif) |
| **speed** — câmera lenta por passo | **auto-annotate** — contorno de graça | **stamp** — contador de passos |
| ![fill](assets/fill.gif) | ![select](assets/select.gif) | ![inset](assets/inset.gif) |
| **fill** — input digitado | **select** — escolha em dropdown | **inset** — lupa |
| ![glossary](assets/glossary.gif) | ![hide](assets/hide.gif) | ![glide](assets/glide.gif) |
| **glossary** — painel de legendas | **hide** — some com um elemento | **glide** — scroll animado |
| ![compose](assets/compose-motion.gif) | ![terminal](assets/terminal.gif) | ![compose-static](assets/compose.png) |
| **compose** — before/after (movimento) | **tape** — captura de terminal | **compose** — before/after (estático) |

### Primitivas de anotação (`demo.mjs`)

Oito estilos de callout, um conceito por imagem — as oito de um único launch `demo --batch`:

| | | | |
|:---:|:---:|:---:|:---:|
| ![rect](assets/primitives/p1-rect.png) | ![circle](assets/primitives/p2-circle.png) | ![arrow](assets/primitives/p3-arrow.png) | ![badge](assets/primitives/p4-badge.png) |
| **rect** | **circle** | **arrow** | **badge** |
| ![blur](assets/primitives/p5-blur.png) | ![zoom](assets/primitives/p6-zoom.png) | ![callout](assets/primitives/p7-callout.png) | ![label](assets/primitives/p8-label.png) |
| **blur** | **zoom** | **callout** | **label** |

## Por que é rápido

Medido neste código (Apple Silicon, motor quente):

| | Ingênuo | Showreel |
|---|---|---|
| 8 capturas anotadas | 8 launches de browser ≈ 60 s | `demo --batch` ≈ **6 s**, um launch |
| Posição da anotação | ler PNG → chutar pixel → repetir | `autoplace` determinístico, **0 retries** |
| Contraste em página clara/escura | escolher cor na mão | **adaptativo** pela luminância da página |
| Anotações sobrepostas | empurrar na mão | **ciente de colisão**, nunca cobre o alvo |

## Como funciona

O agente manda seletor + texto. O motor (Chromium próprio em `scripts/.deps/`) mede o DOM, posiciona cada anotação de forma determinística (`lib/autoplace.mjs`), e autovalida (`vcheck`) antes de salvar — então não há loop de chute/retry. Capturas web passam pelo Chromium; capturas de terminal pelo `vhs`. O `rec.mjs` é modular: módulos de responsabilidade única (`rec-steps`, `cam-inject`, `rec-camera`, `rec-motion`, `rec-annotate`, `rec-input`, `rec-encode`, `rec-page`) sobre um `clock` que faz de realtime e offline duas implementações do mesmo contrato de tempo.

## Requisitos

node 18+. Opcionais: `ffmpeg` (melhor qualidade de GIF), `vhs` (gravação de terminal). Sem git, sem token, nada pra configurar. `preflight.sh` imprime os comandos exatos de setup pro que faltar. Matriz completa em [INSTALL.md](INSTALL.md), histórico de versão em [CHANGELOG.md](CHANGELOG.md).

## Testes

```bash
cd showreel && node --test 'scripts/__tests__/*.test.mjs'   # 247 testes, sem rede nem browser
```

## Licença

[MIT](LICENSE)
