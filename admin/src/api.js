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
};
