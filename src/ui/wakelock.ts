type Sentinel = { released: boolean; release(): Promise<void> }
type WakeLockApi = { request(type: 'screen'): Promise<Sentinel> }

function api(): WakeLockApi | null {
  const nav = navigator as Navigator & { wakeLock?: WakeLockApi }
  return nav.wakeLock ?? null
}

/**
 * Mantém a tela acesa durante o treino. O navegador solta o bloqueio sozinho
 * quando o app vai para segundo plano, então ele é pedido de novo ao voltar.
 */
export function createWakeLock() {
  let sentinel: Sentinel | null = null

  return {
    isSupported(): boolean {
      return api() !== null
    },

    async request(): Promise<void> {
      const wakeLock = api()
      if (!wakeLock || (sentinel && !sentinel.released)) return
      try {
        sentinel = await wakeLock.request('screen')
      } catch {
        // Negado pelo sistema (bateria fraca, por exemplo). O treino segue.
        sentinel = null
      }
    },

    async release(): Promise<void> {
      if (!sentinel || sentinel.released) return
      try {
        await sentinel.release()
      } catch {
        // Já liberado.
      }
      sentinel = null
    },
  }
}
