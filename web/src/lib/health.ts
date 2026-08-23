import { api } from './api';

export async function fetchLanBase(): Promise<string | null> {
  try {
    const health = await api<{ interfaces: { address: string }[] }>('/health');
    const ip = health.interfaces[0]?.address;
    return ip ? `http://${ip}:4000` : null;
  } catch {
    return null;
  }
}
