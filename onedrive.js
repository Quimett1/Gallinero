const CloudExcel = (() => {
  const clientId = 'b0b4b2b0-c648-41e7-ba03-c4b653819dd5';
  const scopes = ['User.Read', 'Files.ReadWrite'];
  const graph = 'https://graph.microsoft.com/v1.0';
  const app = window.msal ? new msal.PublicClientApplication({ auth: { clientId, authority: 'https://login.microsoftonline.com/common', redirectUri: `${window.location.origin}/` }, cache: { cacheLocation: 'localStorage' } }) : null;
  let account = null; let fileId = localStorage.getItem('gallines-onedrive-file-id');

  // Excel puede entregar las fechas como número, texto o fecha real según el
  // lector usado por OneDrive. Normalizarlas aquí evita que se pierda la puesta.
  const excelDate = value => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') {
      const plain = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
      if (plain) return plain;
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    }
    const serial = Number(value);
    return Number.isFinite(serial) && serial > 0
      ? new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
      : null;
  };
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
    // Al reemplazar un Excel, OneDrive puede asignarle un identificador nuevo.
    // Buscamos siempre el archivo actual en vez de reutilizar uno guardado.
    const files = await call('/me/drive/root/children?$select=id,name,lastModifiedDateTime');
    const found = files.value
      ?.filter(file => file.name?.toLowerCase() === 'gallines.xlsx')
      .sort((a, b) => String(b.lastModifiedDateTime || '').localeCompare(String(a.lastModifiedDateTime || '')))[0];
    if (!found) throw new Error('No se encontró GALLINES.xlsx en la carpeta principal de OneDrive.');
    fileId = found.id;
    localStorage.setItem('gallines-onedrive-file-id', fileId);
    const sheets = await call(`/me/drive/items/${fileId}/workbook/worksheets`); return { sheets: Object.fromEntries(sheets.value.map(sheet => [sheet.name, sheet.id])) };
  }
  async function values(sheetName) { const { sheets } = await workbook(); const range = await call(`/me/drive/items/${fileId}/workbook/worksheets/${sheets[sheetName]}/usedRange(valuesOnly=true)`); return range.values || []; }
  async function rangeValues(sheetName, address) { const { sheets } = await workbook(); const range = await call(`/me/drive/items/${fileId}/workbook/worksheets/${sheets[sheetName]}/range(address='${address}')`); return range.values || []; }
  async function downloadValues() {
    if (!window.XLSX) throw new Error('No se pudo cargar el lector del Excel.');
    await workbook();
    const accessToken = await token();
    const response = await fetch(`${graph}/me/drive/items/${fileId}/content`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error('No se pudo descargar GALLINES.xlsx desde OneDrive.');
    const book = window.XLSX.read(await response.arrayBuffer(), { type: 'array', cellDates: false });
    return Object.fromEntries(book.SheetNames.map(name => [name, window.XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: true, defval: null })]));
  }
  async function load() {
    const sheets = await downloadValues();
    // Algunos Excels conservan los acentos de forma distinta. Localizamos la
    // hoja por un nombre normalizado en vez de depender de un carácter exacto.
    const normal = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const sheet = (...names) => Object.entries(sheets).find(([name]) => names.some(candidate => normal(name) === normal(candidate)))?.[1] || [];
    const eggsSheet = sheet('POSTA_DIÀRIA_MIDES', 'POSTA_DIARIA_MIDES');
    const eggHeaders = eggsSheet[0] || [];
    const column = (headers, ...names) => headers.findIndex(value => names.some(name => normal(value) === normal(name)));
    // SheetJS recorta la primera columna vacía de esta hoja (la A). Por ello
    // se localizan las columnas por su encabezado, en lugar de usar B/C/D.
    const eggDateColumn = column(eggHeaders, 'DATA', 'FECHA');
    const eggWeightColumn = eggHeaders.findIndex(value => normal(value).startsWith('PES'));
    const eggSizeColumn = column(eggHeaders, 'MIDA', 'TALLA');
    const eggsRaw = eggsSheet.slice(1);
    const salesRaw = sheet('VENTES');
    const expensesRaw = sheet('DESPESES');
    const dailyRaw = sheet('PRODUCCIÓ_DIÀRIA', 'PRODUCCIO_DIARIA').slice(1);
    const eggs = eggsRaw
      .map((row, index) => {
        const weight = Number(row[eggWeightColumn] || 0);
        return { row: index + 2, date: excelDate(row[eggDateColumn]), weight, size: row[eggSizeColumn] || classifyWeight(weight) };
      })
      .filter(row => row.date && row.weight > 0);
    const daily = dailyRaw
      .map(row => ({ date: excelDate(row[0]), total: Number(row[1] || 0) }))
      .filter(row => row.date && row.total > 0);
    return {
      eggs,
      sales: salesRaw.slice(1).map((row, index) => ({ row: index + 2, date: excelDate(row[0]), client: row[1], type: row[2], dozens: row[3], total: row[5] ?? Number(row[3] || 0) * Number(row[4] || 0) })).filter(row => row.date),
      expenses: expensesRaw.slice(1).map((row, index) => ({ row: index + 2, date: excelDate(row[0]), feed: row[1], bedding: row[2], straw: row[3], other: row[4], concept: row[5], total: row[9] ?? 0 })).filter(row => row.date),
      daily
    };
  }
  const classifyWeight = weight => Number(weight) < 53 ? 'S' : Number(weight) < 63 ? 'M' : Number(weight) < 73 ? 'L' : 'XL';
  async function writeRange(sheetName, address, body) { const { sheets } = await workbook(); return call(`/me/drive/items/${fileId}/workbook/worksheets/${sheets[sheetName]}/range(address='${address}')`, { method: 'PATCH', body: JSON.stringify(body) }); }
  async function appendEggs(payload) { const raw = await values('POSTA_DIÀRIA_MIDES'); const first = raw.length + 1; const serial = serialDate(payload.date); const weights = payload.weights.map(Number); const last = first + weights.length - 1; await writeRange('POSTA_DIÀRIA_MIDES', `B${first}:C${last}`, { values: weights.map(weight => [serial, weight]) }); await writeRange('POSTA_DIÀRIA_MIDES', `D${first}:H${last}`, { formulas: weights.map((_, index) => { const row = first + index; return [`=IF(ISBLANK(C${row}),"",IF(C${row}<53,"S",IF(C${row}<63,"M",IF(C${row}<73,"L","XL"))))`, `=TEXT(--B${row},"aaaamm")`, `=YEAR(B${row})`, `=MONTH(B${row})`, `=WEEKNUM(B${row},2)`]; }) }); }
  async function appendSale(payload) { const raw = await values('VENTES'); const row = raw.length + 1; const serial = serialDate(payload.date); await writeRange('VENTES', `A${row}:D${row}`, { values: [[serial, payload.client, payload.type, Number(payload.dozens)]] }); await writeRange('VENTES', `E${row}:G${row}`, { formulas: [[`=IF(ISBLANK(A${row}),"",IF(A${row}<DATE(2025,11,1),3.5,4))`, `=IF(OR(ISBLANK(A${row}),ISBLANK(D${row}),ISBLANK(E${row})),"",D${row}*E${row})`, `=IF(ISBLANK(A${row}),"",DATE(YEAR(A${row}),MONTH(A${row}),1))`]] }); }
  async function appendExpense(payload) { const raw = await values('DESPESES'); const row = raw.length + 1; const serial = serialDate(payload.date); await writeRange('DESPESES', `A${row}:F${row}`, { values: [[serial, Number(payload.feed) || null, Number(payload.bedding) || null, Number(payload.straw) || null, Number(payload.other) || null, payload.concept]] }); await writeRange('DESPESES', `G${row}:K${row}`, { formulas: [[`=IF(B${row}="","",B${row}*11)`, `=IF(C${row}="","",C${row}*7.5)`, `=IF(D${row}="","",D${row}*4)`, `=IF(A${row}="","",SUM(E${row},G${row}:I${row}))`, `=TEXT(A${row},"aaaa-mm")`]] }); }
  async function deleteRow(sheetName, row, firstColumn, lastColumn) { const { sheets } = await workbook(); return call(`/me/drive/items/${fileId}/workbook/worksheets/${sheets[sheetName]}/range(address='${firstColumn}${row}:${lastColumn}${row}')/clear`, { method: 'POST', body: JSON.stringify({ applyTo: 'All' }) }); }
  async function signIn() { await restoreSession(); if (account) return true; await app.loginRedirect({ scopes }); return false; }
  return { signIn, initialize: async () => Boolean(await restoreSession()), load, appendEggs, appendSale, appendExpense, deleteEgg: row => deleteRow('POSTA_DIÀRIA_MIDES', row, 'B', 'H'), deleteSale: row => deleteRow('VENTES', row, 'A', 'G'), deleteExpense: row => deleteRow('DESPESES', row, 'A', 'K'), isAvailable: () => Boolean(app), account: () => account };
})();
