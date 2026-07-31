# HIIT

Treinador de intervalos para celular. Você monta o treino, ele cronometra,
avisa por som quando a fase vai virar e mostra em animação como cada
exercício é executado.

**By Renato Furriel**

---

## O que ele faz

- Treinos em circuito: uma lista de exercícios, um tempo de esforço, um de
  intervalo, N voltas e um descanso maior entre elas.
- Contagem regressiva sonora nos últimos 5 segundos de cada fase, com tons
  diferentes para o início do esforço e o início do descanso.
- Dez exercícios de peso corporal, cada um com sua animação.
- Funciona sem internet e mantém a tela acesa durante o treino.
- Nada sai do aparelho: os treinos ficam guardados no próprio celular.

## Sobre música

Não há integração com serviços de música, e isso é uma decisão, não uma
pendência. Uma integração com o Spotify chegou a ser construída e foi
removida: como o player web do Spotify não funciona em navegador de celular,
o app do Spotify precisava estar aberto e tocando de qualquer forma, e o que
sobrava não justificava o peso.

Toque sua música pelo app que preferir e deixe o HIIT por cima. Os bipes se
declaram como áudio de reprodução, então convivem com a música tocando.

## Rodando na sua máquina

```bash
npm install
npm run dev
```

Abra o endereço que o Vite mostrar. Para ver o app no celular pela mesma rede
Wi-Fi, rode `npm run dev -- --host` e use o endereço de rede.

`http://localhost:5273/App_HIT/preview.html` mostra todas as animações lado a
lado — é a página usada para ajustá-las. Ela não vai para o app publicado.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes do engine e do armazenamento |
| `npm run build` | Verificação de tipos e build de produção em `dist/` |
| `npm run icons` | Regera os ícones PNG do app |

## Publicando

O app é publicado no GitHub Pages automaticamente a cada push na `main`, pelo
fluxo em `.github/workflows/deploy.yml`. Para ligar isso na primeira vez:

1. Crie um repositório público no GitHub e envie este projeto para ele.
2. Em **Settings → Pages**, escolha **GitHub Actions** como origem.
3. Aguarde o fluxo terminar. O endereço aparece na própria aba Pages.

O caminho base é deduzido do nome do repositório, então nada precisa ser
ajustado no código.

## Instalando no celular

Abra o endereço publicado no navegador do celular e:

- **iPhone (Safari):** botão de compartilhar → *Adicionar à Tela de Início*.
- **Android (Chrome):** menu → *Instalar aplicativo*.

O app passa a abrir em tela cheia, com ícone próprio, e funciona sem internet.

## Como o código é organizado

```
src/
  engine/      máquina de estados do treino — pura, testada, sem DOM
  audio/       bipes sintetizados na hora pela Web Audio API
  exercises/   biblioteca de exercícios e suas animações SVG
  storage/     leitura e escrita no armazenamento do navegador
  ui/          as três telas e o roteamento
```

A regra que mantém isso separado: o engine não sabe que existem tela e som; a
tela e o som apenas reagem a ele. É o que permite testar toda a lógica de
tempo sem navegador.

O tempo é sempre calculado a partir do relógio, nunca somando um segundo a
cada tique. Por isso o cronômetro continua certo depois de o app passar um
tempo em segundo plano — e por isso, ao voltar, ele não dispara de uma vez
todos os bipes que perdeu.

O desenho completo do projeto, incluindo os riscos conhecidos e o registro da
integração com o Spotify que foi construída e removida, está em
[`docs/superpowers/specs/2026-07-30-app-hiit-design.md`](docs/superpowers/specs/2026-07-30-app-hiit-design.md).
