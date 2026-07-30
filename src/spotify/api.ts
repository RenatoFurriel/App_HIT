import { accessToken } from './auth'

const API = 'https://api.spotify.com/v1'

export type Failure =
  | 'no-session' // sem login válido
  | 'no-device' // Spotify aberto em lugar nenhum
  | 'forbidden' // conta grátis, ou operação não suportada pelo aparelho
  | 'offline'
  | 'error'

export type Result<T> = { ok: true; value: T } | { ok: false; reason: Failure }

export interface Playlist {
  uri: string
  name: string
  trackCount: number
}

export interface PlayerState {
  isPlaying: boolean
  /** Nome da faixa com o artista, pronto para exibir. Null se nada tocando. */
  track: string | null
  /** Volume do dispositivo, de 0 a 100. Null quando o aparelho não informa. */
  volume: number | null
  deviceName: string | null
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<Result<Response>> {
  const token = await accessToken()
  if (!token) return { ok: false, reason: 'no-session' }

  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
  } catch {
    return { ok: false, reason: 'offline' }
  }

  if (response.ok) return { ok: true, value: response }
  if (response.status === 401) return { ok: false, reason: 'no-session' }
  // 404 nas rotas de player significa "nenhum dispositivo ativo", não
  // "rota inexistente" — é assim que o Spotify sinaliza isso.
  if (response.status === 404) return { ok: false, reason: 'no-device' }
  if (response.status === 403) return { ok: false, reason: 'forbidden' }
  return { ok: false, reason: 'error' }
}

export async function fetchPlaylists(): Promise<Result<Playlist[]>> {
  const result = await request('/me/playlists?limit=50')
  if (!result.ok) return result

  const data = (await result.value.json()) as {
    items?: { uri?: string; name?: string; tracks?: { total?: number } }[]
  }

  const playlists = (data.items ?? [])
    .filter((item): item is { uri: string; name: string; tracks?: { total?: number } } =>
      typeof item.uri === 'string' && typeof item.name === 'string',
    )
    .map((item) => ({
      uri: item.uri,
      name: item.name,
      trackCount: item.tracks?.total ?? 0,
    }))

  return { ok: true, value: playlists }
}

export async function fetchPlayerState(): Promise<Result<PlayerState | null>> {
  const result = await request('/me/player')
  if (!result.ok) return result

  // 204 significa "nada tocando em lugar nenhum".
  if (result.value.status === 204) return { ok: true, value: null }

  const data = (await result.value.json()) as {
    is_playing?: boolean
    device?: { volume_percent?: number | null; name?: string }
    item?: { name?: string; artists?: { name?: string }[] }
  }

  const artists = (data.item?.artists ?? [])
    .map((a) => a.name)
    .filter((name): name is string => typeof name === 'string')
    .join(', ')

  const trackName = data.item?.name
  const track = trackName ? (artists ? `${trackName} · ${artists}` : trackName) : null

  return {
    ok: true,
    value: {
      isPlaying: data.is_playing === true,
      track,
      volume: typeof data.device?.volume_percent === 'number' ? data.device.volume_percent : null,
      deviceName: data.device?.name ?? null,
    },
  }
}

/** Sem `contextUri` o comando apenas retoma de onde a música parou. */
export async function play(contextUri?: string): Promise<Result<null>> {
  const result = await request('/me/player/play', {
    method: 'PUT',
    ...(contextUri ? { body: JSON.stringify({ context_uri: contextUri }) } : {}),
  })
  return result.ok ? { ok: true, value: null } : result
}

export async function pause(): Promise<Result<null>> {
  const result = await request('/me/player/pause', { method: 'PUT' })
  return result.ok ? { ok: true, value: null } : result
}

export async function nextTrack(): Promise<Result<null>> {
  const result = await request('/me/player/next', { method: 'POST' })
  return result.ok ? { ok: true, value: null } : result
}

export async function setVolume(percent: number): Promise<Result<null>> {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const result = await request(`/me/player/volume?volume_percent=${clamped}`, { method: 'PUT' })
  return result.ok ? { ok: true, value: null } : result
}
