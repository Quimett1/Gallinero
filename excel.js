const ExcelIO = (() => {
  const normal = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const findColumn = (headers, ...names) => headers.findIndex(value => names.some(name => normal(value) === normal(name)));
  const findColumnPrefix = (headers, prefix) => headers.findIndex(value => normal(value).startsWith(prefix));
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
  function sheetsFromWorkbook(book) {
    return Object.fromEntries(book.SheetNames.map(name => [name, XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, raw: true, defval: null })]));
  }
  function findSheet(sheets, ...names) {
    return Object.entries(sheets).find(([name]) => names.some(candidate => normal(name) === normal(candidate)))?.[1] || [];
  }
  function parseEggs(rows) {
    const headers = rows[0] || [];
    const dateCol = findColumn(headers, 'DATA', 'FECHA');
    const weightCol = findColumnPrefix(headers, 'PES');
    const sizeCol = findColumn(headers, 'MIDA', 'TALLA', 'SIZE');
    return rows.slice(1).map(row => {
      const date = excelDate(row[dateCol]);
      const weight = Number(row[weightCol] || 0);
      if (!date || !(weight > 0)) return null;
      return { id: newId(), date, weight, size: row[sizeCol] || classifyWeight(weight) };
    }).filter(Boolean);
  }
  function parseSales(rows) {
    const headers = rows[0] || [];
    const dateCol = findColumn(headers, 'DATA', 'FECHA');
    const clientCol = findColumn(headers, 'CLIENT', 'CLIENTE');
    const typeCol = findColumn(headers, 'TIPUS', 'TIPO');
    const dozensCol = findColumn(headers, 'DOCENES', 'DOCENAS');
    const priceCol = findColumn(headers, 'PREU', 'PRECIO');
    const totalCol = findColumn(headers, 'TOTAL');
    const hasHeaders = dateCol >= 0 && dozensCol >= 0;
    return rows.slice(1).map(row => {
      const date = excelDate(hasHeaders ? row[dateCol] : row[0]);
      const dozens = Number((hasHeaders ? row[dozensCol] : row[3]) || 0);
      if (!date || !dozens) return null;
      const client = (hasHeaders ? row[clientCol] : row[1]) || '';
      const type = (hasHeaders ? row[typeCol] : row[2]) || '';
      const price = Number((hasHeaders && priceCol >= 0 ? row[priceCol] : row[4]) || 0) || salePrice(date);
      const total = Number((hasHeaders && totalCol >= 0 ? row[totalCol] : row[5]) || 0) || dozens * price;
      return { id: newId(), date, client, type, dozens, price, total };
    }).filter(Boolean);
  }
  function parseExpenses(rows) {
    const headers = rows[0] || [];
    const dateCol = findColumn(headers, 'DATA', 'FECHA');
    const feedCol = findColumn(headers, 'PINSO', 'PIENSO');
    const beddingCol = findColumn(headers, 'BIRUTA');
    const strawCol = findColumn(headers, 'PALLA', 'PAJA');
    const otherCol = findColumn(headers, 'ALTRES', 'OTROS');
    const conceptCol = findColumn(headers, 'CONCEPTE', 'CONCEPTO');
    const totalCol = findColumn(headers, 'TOTAL');
    const feedPriceCol = findColumn(headers, 'PREU PINSO', 'PRECIO PIENSO');
    const beddingPriceCol = findColumn(headers, 'PREU BIRUTA', 'PRECIO BIRUTA');
    const strawPriceCol = findColumn(headers, 'PREU PALLA', 'PRECIO PAJA');
    const hasHeaders = dateCol >= 0;
    return rows.slice(1).map(row => {
      const date = excelDate(hasHeaders ? row[dateCol] : row[0]);
      if (!date) return null;
      const feed = Number((hasHeaders && feedCol >= 0 ? row[feedCol] : row[1]) || 0);
      const bedding = Number((hasHeaders && beddingCol >= 0 ? row[beddingCol] : row[2]) || 0);
      const straw = Number((hasHeaders && strawCol >= 0 ? row[strawCol] : row[3]) || 0);
      const other = Number((hasHeaders && otherCol >= 0 ? row[otherCol] : row[4]) || 0);
      const concept = (hasHeaders && conceptCol >= 0 ? row[conceptCol] : row[5]) || '';
      if (!feed && !bedding && !straw && !other) return null;
      const feedPrice = feedPriceCol >= 0 ? Number(row[feedPriceCol]) || undefined : undefined;
      const beddingPrice = beddingPriceCol >= 0 ? Number(row[beddingPriceCol]) || undefined : undefined;
      const strawPrice = strawPriceCol >= 0 ? Number(row[strawPriceCol]) || undefined : undefined;
      const total = Number((hasHeaders && totalCol >= 0 ? row[totalCol] : row[9]) || 0) || expenseTotal({ feed, bedding, straw, other, feedPrice, beddingPrice, strawPrice });
      return { id: newId(), date, feed, bedding, straw, other, concept, feedPrice, beddingPrice, strawPrice, total };
    }).filter(Boolean);
  }
  function parseDaily(rows) {
    return rows.slice(1)
      .map(row => ({ date: excelDate(row[0]), total: Number(row[1] || 0) }))
      .filter(row => row.date && row.total > 0);
  }
  async function importFile(file) {
    if (!window.XLSX) throw new Error('No se pudo cargar el lector de Excel.');
    const buffer = await file.arrayBuffer();
    const book = XLSX.read(buffer, { type: 'array', cellDates: false });
    const sheets = sheetsFromWorkbook(book);
    return {
      eggs: parseEggs(findSheet(sheets, 'POSTA_DIÀRIA_MIDES', 'POSTA_DIARIA_MIDES', 'PRODUCCION', 'HUEVOS')),
      sales: parseSales(findSheet(sheets, 'VENTES', 'VENTAS', 'SALES')),
      expenses: parseExpenses(findSheet(sheets, 'DESPESES', 'GASTOS', 'EXPENSES')),
      daily: parseDaily(findSheet(sheets, 'PRODUCCIÓ_DIÀRIA', 'PRODUCCIO_DIARIA'))
    };
  }
  function buildBalanceRows(data) {
    const months = new Set();
    data.sales.forEach(row => months.add(row.date.slice(0, 7)));
    data.expenses.forEach(row => months.add(row.date.slice(0, 7)));
    data.eggs.forEach(row => months.add(row.date.slice(0, 7)));
    const sumTotal = rows => rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const rows = [...months].sort().map(month => {
      const sales = data.sales.filter(row => row.date.slice(0, 7) === month);
      const expenses = data.expenses.filter(row => row.date.slice(0, 7) === month);
      const eggsCount = data.eggs.filter(row => row.date.slice(0, 7) === month).length;
      const income = sumTotal(sales), expense = sumTotal(expenses);
      return [month, eggsCount, income, expense, income - expense];
    });
    const totalIncome = sumTotal(data.sales), totalExpense = sumTotal(data.expenses);
    rows.push(['TOTAL', data.eggs.length, totalIncome, totalExpense, totalIncome - totalExpense]);
    return [['MES', 'HUEVOS', 'INGRESOS', 'GASTOS', 'BENEFICIO'], ...rows];
  }
  function exportFile(data, filename) {
    if (!window.XLSX) throw new Error('No se pudo cargar el generador de Excel.');
    const sorted = rows => rows.slice().sort((a, b) => a.date.localeCompare(b.date));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(buildBalanceRows(data)), 'BALANÇ');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['DATA', 'PES', 'MIDA'],
      ...sorted(data.eggs).map(row => [row.date, row.weight, row.size])
    ]), 'POSTA_DIÀRIA_MIDES');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['DATA', 'CLIENT', 'TIPUS', 'DOCENES', 'PREU', 'TOTAL'],
      ...sorted(data.sales).map(row => [row.date, row.client, row.type, row.dozens, row.price, row.total])
    ]), 'VENTES');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['DATA', 'PINSO', 'PREU PINSO', 'BIRUTA', 'PREU BIRUTA', 'PALLA', 'PREU PALLA', 'ALTRES', 'CONCEPTE', 'TOTAL'],
      ...sorted(data.expenses).map(row => [row.date, row.feed, row.feedPrice ?? '', row.bedding, row.beddingPrice ?? '', row.straw, row.strawPrice ?? '', row.other, row.concept, row.total])
    ]), 'DESPESES');
    if (data.daily.length) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['DATA', 'TOTAL'],
      ...sorted(data.daily).map(row => [row.date, row.total])
    ]), 'PRODUCCIÓ_DIÀRIA');
    XLSX.writeFile(book, filename);
  }
  return { importFile, exportFile };
})();
