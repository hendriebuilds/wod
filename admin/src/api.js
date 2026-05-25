async function req(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function reqText(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  me: () => req('GET', '/auth/me'),
  logout: () => req('POST', '/auth/logout'),
  getGuilds: () => req('GET', '/api/guilds'),
  setActiveGuild: (guildId) => req('POST', '/api/guild', { guildId }),
  getVragen: () => req('GET', '/api/vragen'),
  addVraag: (type, tekst, categorie, dmModus) => req('POST', '/api/vragen', { type, tekst, categorie, dmModus }),
  updateVraag: (id, tekst, categorie, dmModus) => req('PUT', `/api/vragen/${id}`, { tekst, categorie, dmModus }),
  deleteVraag: (id) => req('DELETE', `/api/vragen/${id}`),
  importVragen: (csvText) => reqText('POST', '/api/vragen/import', csvText),
  getStats: () => req('GET', '/api/statistieken'),
  resetStats: () => req('POST', '/api/reset'),
  reload: () => req('POST', '/api/reload'),
  getInstellingen: () => req('GET', '/api/instellingen'),
  updateInstellingen: (data) => req('PUT', '/api/instellingen', data),
  getConfig: () => req('GET', '/api/config'),
  updateConfig: (data) => req('PUT', '/api/config', data),
  getNooit: () => req('GET', '/api/nooit'),
  addNooit: (tekst) => req('POST', '/api/nooit', { tekst }),
  updateNooit: (id, tekst) => req('PUT', `/api/nooit/${id}`, { tekst }),
  deleteNooit: (id) => req('DELETE', `/api/nooit/${id}`),
  getChannelCategorie: () => req('GET', '/api/channel-categorie'),
  setChannelCategorie: (channelId, categorie) => req('POST', '/api/channel-categorie', { channelId, categorie }),
  deleteChannelCategorie: (channelId) => req('DELETE', `/api/channel-categorie/${channelId}`),
  getKanalen: () => req('GET', '/api/kanalen'),
  getCategorieen: () => req('GET', '/api/categorieen'),
  createCategorieMappen: () => req('POST', '/api/categoriemappen/aanmaken'),
  resetConfig: () => req('POST', '/api/reset-config'),
  getSessies: () => req('GET', '/api/sessies'),
  deleteSessie: (id) => req('DELETE', `/api/sessies/${id}`),
  getServers: () => req('GET', '/api/servers'),
  leaveServer: (guildId) => req('DELETE', `/api/servers/${guildId}`),
};
