const CloudExcel = (() => {
  const clientId = 'b0b4b2b0-c648-41e7-ba03-c4b653819dd5';
  const scopes = ['User.Read', 'Files.ReadWrite'];
  const graph = 'https://graph.microsoft.com/v1.0';
  const app = window.msal ? new msal.PublicClientApplication({ auth: { clientId, authority: 'https://login.microsoftonline.com/common', redirectUri: `${window.location.origin}/` }, cache: { cacheLocation: 'localStorage' } }) : null;
  let account = null; let fileId = localStorage.getItem('gallines-onedrive-file-id');

  const excelDate = value => value ? new Date(Date.UTC(1899, 11, 30) + Number(value) * 86400000).toISOString().slice(0, 10) : null;
  const serialDate = value => Math.floor((Date.parse(`${value}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000);
  async function restoreSession() {
    if (!app) return null;
    const response = await app.handleRedirectPromise();
    account ||= response?.account || app.getActiveAccount() || app.getAllAccounts()[0];
    if (account) app.setActiveAccount(account);
    return account;
  }
  async function token(interactive = false) {
    if (!app) throw new Error('No se pudo cargar la conexión con Microsoft.');
    await restoreSession();
    if (!account) { if (!interactive) throw new Error('Inicia sesión con OneDrive.'); await app.loginRedirect({ scopes }); return null; }
    try { return (await app.acquireTokenSilent({ account, scopes })).accessToken; }
    catch { if (!interactive) throw new Error('Inicia sesión con OneDrive.'); await app.acquireTokenRedirect({ scopes }); return null; }
  }
  async function call(path, options = {}) {
    const accessToken = await token(); const response = await fetch(`${graph}${path}`, { ...options, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.error?.message || 'No se pudo actualizar OneDrive.'); }
    return response.status === 204 ? null : response.json();
  }
  async function workbook() {
    if (!fileId) {
      const files = await call('/me/drive/root/children?$select=id,name');
      const found = files.value?.find(file => file.name?.toLowerCase() === 'gallines.xlsx');
      if (!found) throw new Error('No se encontró GALLINES.xlsx en la carpeta principal de OneDrive.');
      fileId = found.id; localStorage.setItem('gallines-onedrive-file-id', fileId);
    }
    const sheets = await call(`/me/drive/items/${fileId}/workbook/worksheets`); return { sheets: Object.fromEntries(sheets.value.map(sheet => [sheet.name, sheet.id])) };
  }
  async function values(sheetName) { const { sheets } = await workbook(); const range = await call(`/me/drive/items/${fileId}/workbook/worksheets/${sheets[sheetName]}/usedRange(valuesOnly=true)`); return range.values || []; }
  async function rangeValues(sheetName, address) { const { sheets } = await workbook(); const range = await call(`/me/drive/items/${fileId}/workbook/worksheets/${sheets[sheetName]}/range(address='${address}')`); return range.values || []; }
  async function load() {
    const [eggsRaw, salesRaw, expensesRaw, dailyRaw] = await Promise.all([rangeValues('POSTA_DIÀRIA_MIDES', 'B2:D5000'), values('VENTES'), values('DESPESES'), rangeValues('PRODUCCIÓ_DIÀRIA', 'A2:B1000')]);
    return {
      eggs: eggsRaw.filter(row => row[0]).map(row => ({ date: excelDate(row[0]), weight: row[1], size: row[2] || classifyWeight(row[1]) })),
      sales: salesRaw.slice(1).filter(row => row[0]).map(row => ({ date: excelDate(row[0]), client: row[1], type: row[2], dozens: row[3], total: row[5] ?? Number(row[3] || 0) * Number(row[4] || 0) })),
      expenses: expensesRaw.slice(1).filter(row => row[0]).map(row => ({ date: excelDate(row[0]), feed: row[1], bedding: row[2], straw: row[3], other: row[4], concept: row[5], total: row[9] ?? 0 })),
      daily: dailyRaw.filter(row => row[0]).map(row => ({ date: excelDate(row[0]), total: Number(row[1] || 0) }))
    };
  }
  const classifyWeight = weight => Number(weight) < 53 ? 'S' : Number(weight) < 63 ? 'M' : Number(weight) < 73 ? 'L' : 'XL';
  async function writeRange(sheetName, address, body) { const { sheets } = await workbook(); return call(`/me/drive/items/${fileId}/workbook/worksheets/${sheets[sheetName]}/range(address='${address}')`, { method: 'PATCH', body: JSON.stringify(body) }); }
  async function appendEggs(payload) { const raw = await values('POSTA_DIÀRIA_MIDES'); const first = raw.length + 1; const serial = serialDate(payload.date); const weights = payload.weights.map(Number); const last = first + weights.length - 1; await writeRange('POSTA_DIÀRIA_MIDES', `B${first}:C${last}`, { values: weights.map(weight => [serial, weight]) }); await writeRange('POSTA_DIÀRIA_MIDES', `D${first}:H${last}`, { formulas: weights.map((_, index) => { const row = first + index; return [`=IF(ISBLANK(C${row}),"",IF(C${row}<53,"S",IF(C${row}<63,"M",IF(C${row}<73,"L","XL"))))`, `=TEXT(--B${row},"aaaamm")`, `=YEAR(B${row})`, `=MONTH(B${row})`, `=WEEKNUM(B${row},2)`]; }) }); }
  async function appendSale(payload) { const raw = await values('VENTES'); const row = raw.length + 1; const serial = serialDate(payload.date); await writeRange('VENTES', `A${row}:D${row}`, { values: [[serial, payload.client, payload.type, Number(payload.dozens)]] }); await writeRange('VENTES', `E${row}:G${row}`, { formulas: [[`=IF(ISBLANK(A${row}),"",IF(A${row}<DATE(2025,11,1),3.5,4))`, `=IF(OR(ISBLANK(A${row}),ISBLANK(D${row}),ISBLANK(E${row})),"",D${row}*E${row})`, `=IF(ISBLANK(A${row}),"",DATE(YEAR(A${row}),MONTH(A${row}),1))`]] }); }
  async function appendExpense(payload) { const raw = await values('DESPESES'); const row = raw.length + 1; const serial = serialDate(payload.date); await writeRange('DESPESES', `A${row}:F${row}`, { values: [[serial, Number(payload.feed) || null, Number(payload.bedding) || null, Number(payload.straw) || null, Number(payload.other) || null, payload.concept]] }); await writeRange('DESPESES', `G${row}:K${row}`, { formulas: [[`=IF(B${row}="","",B${row}*11)`, `=IF(C${row}="","",C${row}*7.5)`, `=IF(D${row}="","",D${row}*4)`, `=IF(A${row}="","",SUM(E${row},G${row}:I${row}))`, `=TEXT(A${row},"aaaa-mm")`]] }); }
  async function signIn() { await restoreSession(); if (account) return true; await app.loginRedirect({ scopes }); return false; }
  return { signIn, initialize: async () => Boolean(await restoreSession()), load, appendEggs, appendSale, appendExpense, isAvailable: () => Boolean(app), account: () => account };
})();
