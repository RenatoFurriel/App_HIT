# HIIT — App de treino intervalado

**Autor:** Renato Furriel
**Data:** 2026-07-30
**Status:** Aprovado para planejamento

---

## 1. Objetivo

Um app de celular que conduz treinos HIIT de peso corporal: cronometra os
intervalos de esforço e descanso, avisa por som quando a fase vai virar, e
mostra em animação como o exercício da vez é executado.

O uso real é uma pessoa treinando em casa, com o celular apoiado no chão ou
numa bancada, a alguns metros de distância, suada e sem vontade de mexer no
aparelho. Toda decisão de interface abaixo serve a esse cenário.

---

## 2. Decisões tomadas

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Plataforma | PWA instalável | Funciona em iPhone e Android, instala na tela inicial, não depende de loja nem de conta de desenvolvedor |
| Stack | Vite + TypeScript, sem framework | Três telas e uma máquina de estados; um framework custaria ~110 KB de bundle sem ganho proporcional |
| Animações | SVG animado por CSS, desenhado em código | Leves, offline, extensíveis, sem depender de arquivos de terceiros |
| Estrutura de treino | Circuito uniforme | Um tempo de esforço e um de intervalo para todos os exercícios, mais N voltas — cobre a maior parte dos treinos HIIT com uma tela de criação simples |
| Exercícios | Peso do corpo, sem equipamento | Corresponde ao uso real |
| Som | Bipes sintéticos, nos últimos 5 segundos | Sem arquivos de áudio, instantâneos, offline |
| Armazenamento | `localStorage` no aparelho | Sem servidor, sem conta, sem privacidade a gerenciar |
| Hospedagem | GitHub Pages | Gratuito, HTTPS, endereço fixo — exigência tanto do PWA quanto do OAuth do Spotify |
| Spotify | Fase 2, controle remoto via Spotify Connect | O player web do Spotify não funciona em navegador de celular; o controle remoto funciona e exige Premium |

### Nome e crédito

O app se chama **HIIT**. O crédito **"By Renato Furriel"** aparece em três
lugares e é requisito, não enfeite:

1. Tela de abertura, abaixo do símbolo.
2. Rodapé da tela inicial.
3. Metadados do PWA — campos `name`, `description` e `author` do manifesto,
   visíveis nos detalhes do app instalado.

---

## 3. Escopo

### Fase 1 — Timer (app completo e utilizável)

Criar, salvar e executar treinos, com som e animações, funcionando offline.

### Fase 2 — Spotify

Login, vinculação de playlist ao treino, sincronização de reprodução e
redução de volume durante a contagem regressiva.

### Fora de escopo

Deliberadamente ausentes desta versão, e a ausência é uma decisão, não um
esquecimento: histórico de treinos, contas de usuário, sincronização entre
aparelhos, exercícios com equipamento, tempo diferente por exercício,
treinos em blocos, gráficos de evolução, compartilhamento de treinos,
integração com Apple Health ou Google Fit.

---

## 4. Arquitetura

Cinco módulos com fronteiras nítidas. A regra que os separa: **o engine não
sabe que existe tela nem som; a tela e o som apenas reagem a ele.**

```
src/
  engine/      máquina de estados do treino — pura, sem DOM, sem áudio
  audio/       síntese dos bipes via Web Audio API
  exercises/   biblioteca de exercícios e suas animações SVG
  storage/     leitura e escrita dos treinos salvos
  ui/          as três telas e o roteamento
```

Dependências permitidas: `ui` conhece todos os outros; `audio` e `storage`
não conhecem ninguém; `engine` não conhece ninguém. Nenhum módulo importa de
`ui`. Essa direção única é o que permite testar o engine sem navegador.

### 4.1 Engine

**Responsabilidade:** dada a configuração de um treino, saber a todo momento
em que fase ele está e quanto falta.

**Interface:**

```ts
createSession(workout: Workout, exercises: Exercise[]): Session

interface Session {
  start(): void
  pause(): void
  resume(): void
  skip(): void       // pula para o próximo segmento
  previous(): void   // volta ao início do segmento atual, ou ao anterior
  stop(): void
  getState(now: number): SessionState
  on(event: 'segmentChange' | 'finish', handler): void
}
```

**Timeline pré-calculada.** Ao criar a sessão, o engine gera a lista completa
de segmentos de uma vez, do início ao fim. Isso torna triviais três coisas
que de outro modo seriam cheias de casos especiais: a duração total do
treino, pular e voltar segmentos, e saber qual é "o próximo".

```ts
type SegmentKind = 'prepare' | 'work' | 'rest' | 'roundRest'

interface Segment {
  kind: SegmentKind
  durationSec: number
  exerciseId?: string   // presente em 'work'; em 'rest', o exercício que vem
  round: number         // 1-indexado
  indexInRound: number  // posição do exercício na volta, 1-indexado
}
```

Regras de geração, e são elas que definem o comportamento observável:

- Um único `prepare` abre o treino.
- Cada volta é `work, rest, work, rest, …`, **sem `rest` depois do último
  exercício da volta** — ali entra `roundRest`.
- **Não há `roundRest` depois da última volta** — o treino termina.
- Se `roundRestSec` for zero, o segmento não é gerado.
- Duração total é a soma das durações. É exibida no editor enquanto o
  usuário mexe nos números.

**Contagem de tempo por timestamp, nunca por acumulação.** O engine guarda
`segmentStartedAt` (epoch em ms) e `pausedAccumMs`. O tempo restante é
sempre recalculado:

```
elapsed   = now - segmentStartedAt - pausedAccumMs
remaining = durationSec * 1000 - elapsed
```

Nada soma "menos um segundo" a cada tique. Isso é o que garante que, se o
navegador congelar a aba por oito segundos ou o telefone for para o bolso, o
cronômetro esteja certo quando voltar — inclusive avançando vários segmentos
de uma vez se o tempo passado exigir.

A interface consulta o engine a cada 200 ms. O intervalo é apenas um gatilho
de redesenho; ele não é a fonte da verdade sobre o tempo.

### 4.2 Áudio

**Responsabilidade:** emitir os avisos sonoros no instante correto.

Web Audio API, sem arquivos. Um único `AudioContext`, criado no primeiro
gesto do usuário — o toque no botão de iniciar o treino — porque iOS e
Android bloqueiam áudio sem interação prévia.

**Desenho sonoro:**

| Momento | Som |
| --- | --- |
| 5, 4, 3, 2, 1 segundos antes de qualquer virada | Bipe curto, 880 Hz, 120 ms |
| Início de um segmento de esforço | Bipe duplo ascendente, 660 → 990 Hz |
| Início de um descanso (`rest` ou `roundRest`) | Bipe grave, 440 Hz, 450 ms |
| Fim do treino | Três tons ascendentes |

Cada tom tem envelope de ataque e decaimento curtos, para não estalar.

**Agendamento no relógio do áudio.** Ao começar um segmento, o módulo agenda
todos os bipes daquele segmento usando `ctx.currentTime`, não `setTimeout`.
O relógio do Web Audio é preciso e não sofre com a thread principal ocupada.
As referências aos osciladores agendados ficam guardadas e são canceladas em
pausa, pulo ou parada.

**Configurações:** volume e mudo, persistidos.

### 4.3 Biblioteca de exercícios

**Responsabilidade:** dizer o que cada exercício é e como ele se parece em
movimento.

```ts
interface Exercise {
  id: string
  name: string
  cue: string              // uma frase de execução, exibida durante o esforço
  createAnimation(): SVGElement
}
```

Um arquivo por exercício. Adicionar um exercício novo é criar um arquivo e
registrá-lo no índice — nenhum outro módulo muda.

**Dez exercícios iniciais:** polichinelo, agachamento, flexão, burpee,
prancha, abdominal, mountain climber, corrida parada, afundo, ponte de
glúteo.

Mais uma **pose de descanso** genérica, exibida nos segmentos `rest` e
`roundRest`.

As animações são silhuetas em traço, animadas por `@keyframes` CSS sobre
elementos SVG. Cada uma é um laço contínuo de 0,5 a 1,5 segundo.

### 4.4 Armazenamento

**Responsabilidade:** guardar e recuperar os treinos e as preferências.

```ts
interface Workout {
  id: string
  name: string
  exerciseIds: string[]
  prepareSec: number      // padrão 10
  workSec: number         // padrão 40
  restSec: number         // padrão 20
  rounds: number          // padrão 3
  roundRestSec: number    // padrão 60
  spotifyPlaylistUri?: string   // Fase 2
  createdAt: number
  updatedAt: number
}
```

Chaves em `localStorage`: `hiit.workouts.v1` e `hiit.settings.v1`. O sufixo
de versão existe para permitir migração se o formato mudar. Leitura de dado
corrompido ou ausente devolve o padrão em vez de quebrar o app.

### 4.5 Interface

Roteamento por hash — `#/`, `#/edit/:id`, `#/run/:id` — porque funciona em
GitHub Pages sem nenhuma configuração de servidor.

**Tela inicial.** Lista dos treinos salvos, cada um mostrando número de
exercícios, tempos, voltas e duração total. Toque no cartão inicia o treino;
toque no nome abre a edição. Botão de criar treino. Rodapé com o crédito.

**Editor.** Nome do treino; os cinco números (preparação, esforço, intervalo,
voltas, descanso entre voltas); a lista ordenável de exercícios com um
seletor para adicionar; a duração total recalculada a cada mudança. Os
números são ajustados por seletor de rolagem, não por teclado numérico —
mais rápido com a mão suada e impossível de digitar errado.

**Execução.** O contador é o maior elemento da tela, legível a alguns metros.
Ao redor dele, um anel de progresso da fase atual. Abaixo, a animação do
exercício com nome e frase de execução. No topo, volta atual e posição no
circuito. Embaixo, o que vem a seguir. Três botões: sair, pausar/retomar,
pular.

**A cor de fundo e do anel muda por fase** — verde no esforço, âmbar no
descanso. É o que permite saber em que fase se está de relance, do outro
lado da sala, sem ler nada.

Sair no meio do treino pede confirmação. Tema escuro, alvos de toque
generosos, tipografia grande.

---

## 5. PWA, offline e publicação

**Manifesto:** `name` e `short_name` "HIIT", `description` incluindo o
crédito, `display: standalone`, `theme_color` escuro, ícones 192 e 512 px
gerados a partir do símbolo do app.

**Service Worker:** todos os arquivos são estáticos e o app inteiro pesa
poucas dezenas de KB, então a estratégia é pré-cachear tudo na instalação e
servir do cache primeiro. Resultado: o app abre e funciona sem internet
nenhuma. Um novo deploy invalida o cache pela versão.

**Wake Lock:** ao iniciar um treino o app solicita `navigator.wakeLock` para
manter a tela acesa, e re-solicita ao voltar de segundo plano. Onde não
houver suporte, um aviso discreto sugere aumentar o tempo de bloqueio do
aparelho.

**Publicação:** GitHub Pages a partir de repositório público, com deploy
automático por GitHub Actions a cada push — build do Vite, publicação de
`dist/`. O Vite é configurado com o `base` correspondente ao caminho do
repositório.

---

## 6. Fase 2 — Spotify

### O princípio que rege esta fase

**A música é independente do treino.** O app dá o pontapé inicial e nada
mais: uma vez tocando, ela continua até que o usuário a pause ou a desligue.
Pausar o treino não pausa a música. Terminar o treino não para a música. Sair
da tela não para a música.

Isso não é só preferência de uso — elimina toda a sincronização de estado
entre duas máquinas que rodam em relógios diferentes, que era a parte mais
frágil do desenho anterior.

A única coisa que o app mexe sozinho é o volume, por cinco segundos, e mesmo
isso é desligável.

### Fluxo

**Autenticação:** OAuth 2.0 com PKCE, que é o fluxo próprio para aplicações
que rodam no navegador e não podem guardar segredo. O app gera um
`code_verifier`, envia o desafio SHA-256, e troca o código por token
diretamente. Nenhum segredo no código-fonte — o que é necessário, já que o
repositório é público.

Escopos: `playlist-read-private`, `playlist-read-collaborative`,
`user-read-playback-state`, `user-modify-playback-state`.

Tokens ficam em `localStorage` e são renovados pelo `refresh_token`.

O identificador do app do Spotify é informado uma vez nas Preferências e
guardado no aparelho. Ele não é segredo — no fluxo PKCE o identificador é
público por desenho —, mas mantê-lo fora do código evita que o app dependa de
um novo build para funcionar.

**No editor:** um campo de playlist que lista as playlists da conta.

**Na execução:**

| Gatilho | Chamada ao Spotify |
| --- | --- |
| Iniciar o treino | `PUT /me/player/play` com o `context_uri` da playlist |
| Botão de pausar música | `PUT /me/player/pause` |
| Botão de retomar música | `PUT /me/player/play` |
| Botão de desligar música | `PUT /me/player/pause` e some com os controles |
| Botão de pular faixa | `POST /me/player/next` |
| Entrar nos últimos 5 s | `PUT /me/player/volume` para 30% do valor atual |
| Virar a fase | `PUT /me/player/volume` restaurando o valor anterior |
| A cada 8 s, com a tela aberta | `GET /me/player` para o nome da faixa e o volume |

Nada mais mexe na reprodução. Em particular, **pausar, pular, voltar,
terminar ou sair do treino não emitem nenhuma chamada ao Spotify.**

**Redução de volume:** liga e desliga nas Preferências, e vem ligada. Ela
abaixa, nunca interrompe — a música continua tocando durante a contagem.

**Sem dispositivo ativo:** se `GET /me/player` não retornar dispositivo, o
app instrui a abrir o Spotify e tocar qualquer música uma vez, em vez de
falhar em silêncio.

**Degradação:** sem internet, sem Premium, sem identificador de app ou sem
login, a seção do Spotify some da tela e o timer funciona exatamente igual.
**O Spotify nunca é dependência para treinar.**

---

## 7. Riscos conhecidos

Registrados aqui porque afetam o que pode ser prometido, e nenhum deles é
resolvível por código melhor.

**1. Controle de volume no cliente iOS do Spotify.** A API de volume do
Spotify não funciona quando a reprodução está no próprio app do iPhone — é
limitação documentada do cliente deles. Funciona normalmente em caixa de som,
Spotify Connect ou desktop.
*Tratamento:* o app detecta a rejeição, desliga a redução de volume para a
sessão, avisa uma única vez e compensa aumentando o ganho dos bipes.

**2. OAuth em PWA instalado no iOS.** O retorno do login do Spotify pode
abrir no Safari em vez de voltar ao app instalado, perdendo o contexto.
*Tratamento:* validar no aparelho real antes de construir o resto da Fase 2;
se falhar, o login passa a ser feito uma vez pelo Safari, com o token
compartilhado pelo mesmo domínio.

**3. Áudio com a tela bloqueada.** Se o usuário bloquear a tela
deliberadamente, os bipes de uma PWA no iOS provavelmente não tocam. O
cronômetro se recompõe corretamente ao voltar, mas os avisos perdidos não
soam.
*Tratamento:* o Wake Lock mantém a tela acesa durante o treino, o que evita o
caso na prática. Documentado como limitação aceita do formato PWA — foi a
contrapartida conhecida da escolha de plataforma.

**4. Wake Lock em navegadores antigos.** Disponível no Safari a partir do
iOS 16.4. *Tratamento:* aviso discreto onde não houver.

---

## 8. Testes

O engine é a única parte com lógica densa o bastante para justificar teste
automatizado, e é também a parte onde um erro estraga o treino inteiro.
Vitest, com relógio controlado:

- Geração da timeline: ausência de `rest` no fim da volta, ausência de
  `roundRest` no fim do treino, `roundRestSec` zero, treino de um exercício
  e uma volta.
- Cálculo da duração total.
- Transições de segmento na virada exata.
- Pausa e retomada preservando o tempo restante.
- Pular e voltar, inclusive nas bordas — pular no último segmento termina o
  treino; voltar no primeiro não sai do lugar.
- Recuperação por timestamp: um salto de tempo que atravessa vários
  segmentos leva ao segmento correto, não ao seguinte.

O armazenamento é testado no ciclo completo de gravar e ler, incluindo dado
ausente e dado corrompido.

Áudio e animações são verificados no uso, no aparelho real — automatizá-los
custaria mais do que vale.

---

## 9. Critérios de aceitação da Fase 1

O app está pronto quando, num iPhone, tudo isto é verdade:

1. O app está instalado na tela inicial com ícone e nome próprios, e abre em
   tela cheia, sem barra de navegador.
2. Aberto em modo avião, funciona por completo.
3. É possível criar um treino, salvá-lo, fechar o app, reabri-lo e encontrá-lo
   lá.
4. O editor mostra a duração total correta e ela muda ao ajustar os números.
5. Ao iniciar um treino: há preparação, o esforço começa com som próprio, os
   bipes soam nos cinco últimos segundos de cada fase, o descanso tem som
   distinto e a tela muda de cor.
6. A animação do exercício da vez está em movimento e corresponde ao
   exercício nomeado.
7. Pausar congela o cronômetro; retomar continua do ponto exato.
8. Pular avança um segmento; voltar retrocede.
9. A tela não apaga sozinha durante o treino.
10. Trocar de app por trinta segundos e voltar mostra o cronômetro no ponto
    correto, não atrasado.
11. O treino termina com o som de conclusão e volta à tela inicial.
12. "By Renato Furriel" aparece na abertura, no rodapé da tela inicial e nos
    detalhes do app instalado.

---

## 10. Ordem de construção

1. Engine e seus testes — o coração, antes de qualquer pixel.
2. Armazenamento.
3. Telas inicial e de edição.
4. Tela de execução com o engine ligado.
5. Áudio.
6. Animações dos dez exercícios.
7. Manifesto, Service Worker, Wake Lock.
8. Publicação no GitHub Pages e instalação no aparelho.
9. **Fase 1 concluída — uso real por alguns treinos antes de seguir.**
10. Fase 2: autenticação do Spotify, validada primeiro no iPhone.
11. Fase 2: playlist no editor, sincronização de reprodução, redução de
    volume com degradação.
