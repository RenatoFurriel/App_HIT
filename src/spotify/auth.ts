/**
 * Autenticação no Spotify pelo fluxo PKCE — o fluxo próprio para aplicações
 * que rodam no navegador e, por isso, não têm onde esconder um segredo.
 * O app prova sua identidade com um valor aleatório que só ele conhece, em
 * vez de uma senha embutida no código.
 */

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const VERIFIER_KEY = 'hiit.spotify.verifier'
const TOKENS_KEY = 'hiit.spotify.tokens.v1'
const CLIENT_ID_KEY = 'hiit.spotify.clientId'

const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ')

interface Tokens {
  accessToken: string
  refreshToken: string
  /** Instante em milissegundos a partir do qual o token precisa ser renovado. */
  expiresAt: number
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Gravação bloqueada: a sessão vale só até fechar o app.
  }
}

function drop(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Nada a fazer.
  }
}

/**
 * O endereço para onde o Spotify devolve o usuário. Precisa bater exatamente
 * com o que estiver cadastrado no painel do Spotify — inclusive a barra final.
 */
export function redirectUri(): string {
  return `${location.origin}${location.pathname}`
}

export function getClientId(): string | null {
  const stored = localStorage.getItem(CLIENT_ID_KEY)
  return stored && stored.trim() !== '' ? stored.trim() : null
}

export function setClientId(id: string): void {
  const trimmed = id.trim()
  if (trimmed === '') drop(CLIENT_ID_KEY)
  else localStorage.setItem(CLIENT_ID_KEY, trimmed)
}

function randomVerifier(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = crypto.getRandomValues(new Uint8Array(64))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function base64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(digest)
}

/** Manda o usuário para a tela de permissão do Spotify. */
export async function beginLogin(): Promise<void> {
  const clientId = getClientId()
  if (!clientId) throw new Error('Identificador do app do Spotify não configurado')

  const verifier = randomVerifier()
  localStorage.setItem(VERIFIER_KEY, verifier)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    scope: SCOPES,
  })

  location.assign(`${AUTHORIZE_URL}?${params.toString()}`)
}

async function exchange(body: Record<string, string>): Promise<Tokens | null> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  if (!response.ok) return null

  const data = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!data.access_token) return null

  const previous = read<Tokens>(TOKENS_KEY)
  const tokens: Tokens = {
    accessToken: data.access_token,
    // Numa renovação o Spotify nem sempre devolve um refresh novo.
    refreshToken: data.refresh_token ?? previous?.refreshToken ?? '',
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
  }
  write(TOKENS_KEY, tokens)
  return tokens
}

/**
 * Trata o retorno do Spotify, se for o caso, e limpa o endereço para que um
 * recarregamento não tente usar o mesmo código duas vezes.
 */
export async function completeLoginIfReturning(): Promise<'ok' | 'error' | 'none'> {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const error = params.get('error')
  if (!code && !error) return 'none'

  const clean = (): void => {
    history.replaceState(null, '', `${location.pathname}${location.hash}`)
  }

  if (error || !code) {
    clean()
    return 'error'
  }

  const verifier = localStorage.getItem(VERIFIER_KEY)
  const clientId = getClientId()
  drop(VERIFIER_KEY)
  clean()

  if (!verifier || !clientId) return 'error'

  const tokens = await exchange({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: clientId,
    code_verifier: verifier,
  })

  return tokens ? 'ok' : 'error'
}

export function isLoggedIn(): boolean {
  const tokens = read<Tokens>(TOKENS_KEY)
  return tokens !== null && tokens.refreshToken !== ''
}

export function logout(): void {
  drop(TOKENS_KEY)
  drop(VERIFIER_KEY)
}

let refreshing: Promise<Tokens | null> | null = null

/** Devolve um token válido, renovando se necessário. Null significa "sem sessão". */
export async function accessToken(): Promise<string | null> {
  const tokens = read<Tokens>(TOKENS_KEY)
  if (!tokens) return null
  if (Date.now() < tokens.expiresAt) return tokens.accessToken

  const clientId = getClientId()
  if (!clientId || !tokens.refreshToken) return null

  // Uma renovação por vez: várias chamadas simultâneas esperariam a mesma.
  refreshing ??= exchange({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    client_id: clientId,
  }).finally(() => {
    refreshing = null
  })

  const renewed = await refreshing
  return renewed?.accessToken ?? null
}
