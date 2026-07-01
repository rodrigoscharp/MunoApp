// Nome do canal Broadcast, compartilhado entre cliente e servidor — sem
// dependências de servidor, seguro para importar em Client Components.
export function tenantChannelName(tenantId: string, channel: string): string {
  return `tenant:${tenantId}:${channel}`;
}
