import { api } from './api';

export async function fetchLanBase(): Promise<string | null> {
  try {
    const health = await api<{ interfaces: { address: string }[]; port: number }>('/health');
    const ip = health.interfaces[0]?.address;
    return ip ? `http://${ip}:${health.port}` : null;
  } catch {
    return null;
  }
}
