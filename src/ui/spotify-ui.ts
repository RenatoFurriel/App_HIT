import { h, icon, ICONS } from './dom'
import { openSheet, closeSheet } from './sheet'
import {
  beginLogin,
  getClientId,
  isLoggedIn,
  logout,
  redirectUri,
  setClientId,
} from '../spotify/auth'
import { fetchPlaylists, type Playlist } from '../spotify/api'
import type { AppContext } from './context'

/** Passo a passo que só o dono da conta pode executar, exibido dentro do app. */
function clientIdSheet(onSaved: () => void): void {
  const input = h('input', {
    class: 'field-input',
    attrs: {
      type: 'text',
      placeholder: 'Cole aqui o Client ID',
      value: getClientId() ?? '',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      'aria-label': 'Client ID do app do Spotify',
    },
  })

  const uri = redirectUri()

  const body = h(
    'div',
    { class: 'sheet-list' },
    h(
      'div',
      { class: 'sheet-note' },
      h('p', {
        text: 'O Spotify exige que cada app tenha um identificador próprio. Criar o seu leva uns cinco minutos e é feito uma única vez.',
      }),
      h('ol', {
        html: `
          <li>Abra <b>developer.spotify.com/dashboard</b> e entre com sua conta.</li>
          <li>Toque em <b>Create app</b>. Nome e descrição podem ser qualquer coisa.</li>
          <li>Em <b>Redirect URI</b>, cole exatamente:<br><code>${uri}</code></li>
          <li>Marque <b>Web API</b>, salve, e copie o <b>Client ID</b> da tela seguinte.</li>`,
      }),
    ),
    h('div', { class: 'sheet-item' }, input),
    h(
      'div',
      { class: 'sheet-item' },
      h('button', {
        class: 'primary-btn',
        text: 'Salvar identificador',
        on: {
          click: () => {
            setClientId(input.value)
            closeSheet()
            onSaved()
          },
        },
      }),
    ),
  )

  openSheet('Conectar ao Spotify', body)
}

/**
 * Linhas do Spotify nas Preferências. `rerender` reabre a folha para refletir
 * o novo estado — mais simples e menos sujeito a erro do que atualizar cada
 * linha no lugar.
 */
export function spotifySettingsRows(ctx: AppContext, rerender: () => void): HTMLElement[] {
  const rows: HTMLElement[] = [h('div', { class: 'sheet-section', text: 'Spotify' })]
  const hasClientId = getClientId() !== null

  if (!hasClientId) {
    rows.push(
      h(
        'button',
        { class: 'sheet-item', on: { click: () => clientIdSheet(rerender) } },
        icon(ICONS.music, 22),
        h(
          'span',
          {},
          h('span', { text: 'Conectar ao Spotify' }),
          h('span', { class: 'cue', text: 'Precisa de um identificador de app, criado uma vez' }),
        ),
      ),
    )
    return rows
  }

  if (!isLoggedIn()) {
    rows.push(
      h(
        'button',
        {
          class: 'sheet-item',
          on: {
            click: () => {
              void beginLogin()
            },
          },
        },
        icon(ICONS.music, 22),
        h('span', { text: 'Entrar com o Spotify' }),
      ),
      h('button', {
        class: 'sheet-item',
        text: 'Trocar o identificador do app',
        on: { click: () => clientIdSheet(rerender) },
      }),
    )
    return rows
  }

  const duckOn = ctx.getSettings().duckMusic

  rows.push(
    h(
      'div',
      { class: 'sheet-item' },
      icon(ICONS.music, 22),
      h(
        'span',
        {},
        h('span', { text: 'Conta conectada' }),
        h('span', { class: 'cue', text: 'A música só é comandada por você, nunca pelo treino' }),
      ),
    ),
    h(
      'button',
      {
        class: 'sheet-item',
        on: {
          click: () => {
            ctx.setSettings({ ...ctx.getSettings(), duckMusic: !duckOn })
            rerender()
          },
        },
      },
      icon(duckOn ? ICONS.sound : ICONS.muted, 22),
      h(
        'span',
        {},
        h('span', { text: duckOn ? 'Abaixar música no countdown' : 'Não mexer no volume' }),
        h('span', {
          class: 'cue',
          text: duckOn
            ? 'Nos últimos 5 s o volume cai e volta. A música nunca para.'
            : 'O volume fica intocado; os bipes podem sumir sob música alta.',
        }),
      ),
    ),
    h('button', {
      class: 'sheet-item danger',
      text: 'Sair da conta do Spotify',
      on: {
        click: () => {
          logout()
          rerender()
        },
      },
    }),
  )

  return rows
}

const FAILURE_TEXT: Record<string, string> = {
  'no-session': 'A sessão expirou. Entre de novo nas Preferências.',
  'no-device': 'Não foi possível falar com o Spotify agora.',
  forbidden: 'O Spotify recusou o pedido. O controle remoto exige conta Premium.',
  offline: 'Sem internet para buscar suas playlists.',
  error: 'O Spotify não respondeu como esperado.',
}

export function pickPlaylist(
  onPick: (playlist: Playlist | null) => void,
): void {
  const list = h('div', { class: 'sheet-list' })
  list.append(h('div', { class: 'empty', text: 'Buscando suas playlists…' }))
  openSheet('Playlist do treino', list)

  void fetchPlaylists().then((result) => {
    list.replaceChildren()

    if (!result.ok) {
      list.append(
        h('div', {
          class: 'empty',
          text: FAILURE_TEXT[result.reason] ?? FAILURE_TEXT['error'] ?? '',
        }),
      )
      return
    }

    list.append(
      h('button', {
        class: 'sheet-item',
        text: 'Sem playlist',
        on: {
          click: () => {
            onPick(null)
            closeSheet()
          },
        },
      }),
    )

    if (result.value.length === 0) {
      list.append(h('div', { class: 'empty', text: 'Nenhuma playlist encontrada na sua conta.' }))
      return
    }

    for (const playlist of result.value) {
      list.append(
        h(
          'button',
          {
            class: 'sheet-item',
            on: {
              click: () => {
                onPick(playlist)
                closeSheet()
              },
            },
          },
          h(
            'span',
            {},
            h('span', { text: playlist.name }),
            h('span', { class: 'cue', text: `${playlist.trackCount} faixas` }),
          ),
        ),
      )
    }
  })
}
