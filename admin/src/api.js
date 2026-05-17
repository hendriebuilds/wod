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

export const api = {
  me: () => req('GET', '/auth/me'),
  logout: () => req('POST', '/auth/logout'),
  getVragen: () => req('GET', '/api/vragen'),
  addVraag: (type, tekst) => req('POST', '/api/vragen', { type, tekst }),
  updateVraag: (type, index, tekst) => req('PUT', `/api/vragen/${type}/${index}`, { tekst }),
  deleteVraag: (type, index) => req('DELETE', `/api/vragen/${type}/${index}`),
  getStats: () => req('GET', '/api/statistieken'),
  resetStats: () => req('POST', '/api/reset'),
  reload: () => req('POST', '/api/reload'),
  getInstellingen: () => req('GET', '/api/instellingen'),
  updateInstellingen: (data) => req('PUT', '/api/instellingen', data),
  getConfig: () => req('GET', '/api/config'),
  updateConfig: (data) => req('PUT', '/api/config', data),
};
