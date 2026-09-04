const $ = id => document.getElementById(id);
const today = new Date().toISOString().slice(0, 10);
['eggDate', 'saleDate', 'expenseDate'].forEach(id => $(id).value = today);
let data = Store.load();
let productionChart, sizeChart;
let calendarMonth = new Date(`${today}T12:00:00`); calendarMonth.setDate(1);
let selectedDate = today;
let selectedMonth = today.slice(0, 7);
let selectedEggs = new Set();

const euro = value => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
const date = value => value ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : '—';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const inSelectedMonth = value => value?.slice(0, 7) === selectedMonth;
const monthLabel = month => {
  const label = new Date(`${month}-01T12:00:00`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};
let eggCountByDate = new Map();
let dailyByDate = new Map();
function reindexEggs() {
  eggCountByDate = new Map();
  for (const row of data.eggs) eggCountByDate.set(row.date, (eggCountByDate.get(row.date) || 0) + 1);
  dailyByDate = new Map(data.daily.map(row => [row.date, row.total]));
}
const eggCountFor = dateKey => eggCountByDate.get(dateKey) || Number(dailyByDate.get(dateKey) || 0);
const RECENT_LIMIT = 150;
const sortByDateDesc = rows => rows.slice().sort((a, b) => b.date.localeCompare(a.date));
const persist = () => { Store.save(data); Cloud.push(data); };
function setSyncStatus(state) {
  const node = $('syncStatus');
  node.className = `sync-status ${state}`;
  node.textContent = state === 'synced' ? 'Sincronizado en todos tus dispositivos' : state === 'offline' ? 'Guardado solo en este dispositivo' : 'Guardado en este dispositivo';
}
function updatePinUI() {
  $('pinStatus').textContent = Cloud.hasPin() ? 'PIN configurado en este dispositivo.' : 'Sin PIN: tus datos solo se guardan en este dispositivo.';
}

function toast(message, error = false) {
  const node = $('toast'); node.textContent = message; node.className = `${error ? 'error ' : ''}show`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.className = '', 3600);
}
function weightsFromInput() {
  return $('eggWeights').value.split(/[\s,;]+/).filter(Boolean).map(Number).filter(value => Number.isFinite(value) && value > 0);
}
const eggRowSelectable = row => `<tr><td><input type="checkbox" class="egg-select" data-select-egg="${row.id}" ${selectedEggs.has(row.id) ? 'checked' : ''}></td><td>${date(row.date)}</td><td>${row.weight} g</td><td><b>${esc(row.size)}</b></td><td><button class="small-button delete" data-delete-egg="${row.id}">Eliminar</button></td></tr>`;
function renderRows(id, rows, render, empty) {
  $(id).innerHTML = rows.map(render).join('') || `<tr><td colspan="8">${empty}</td></tr>`;
}
function render() {
  reindexEggs();
  const todayEggs = eggCountFor(today);
  const sales = data.sales.filter(row => inSelectedMonth(row.date));
  const expenses = data.expenses.filter(row => inSelectedMonth(row.date));
  const income = sales.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const expenseTotalSum = expenses.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const label = monthLabel(selectedMonth);
  const isCurrentMonth = selectedMonth === today.slice(0, 7);
  ['dashMonthLabel', 'salesMonthLabel', 'expensesMonthLabel'].forEach(id => $(id).textContent = label);
  $('eggsToday').textContent = todayEggs;
  $('eggsTodayDetail').textContent = todayEggs ? `Registrados el ${date(today)}` : 'Todavía no hay registros';
  $('dozensMonth').textContent = sales.reduce((sum, row) => sum + Number(row.dozens || 0), 0);
  $('dozensMonthLabel').textContent = isCurrentMonth ? 'Este mes' : label;
  $('incomeMonth').textContent = euro(income);
  $('incomeMonthLabel').textContent = isCurrentMonth ? 'Este mes' : label;
  $('profitMonth').textContent = euro(income - expenseTotalSum);
  $('profitMonthLabel').textContent = `Ingresos − gastos · ${label}`;
  $('salesMonthValue').textContent = euro(income);
  $('salesMonthDetail').textContent = `${sales.reduce((sum, row) => sum + Number(row.dozens || 0), 0)} docenas vendidas en ${label.toLowerCase()}`;
  $('expensesMonthValue').textContent = euro(expenseTotalSum);
  $('expensesMonthDetail').textContent = `${expenses.length} gastos registrados en ${label.toLowerCase()}`;
  const eggRow = row => `<tr><td>${date(row.date)}</td><td>${row.weight} g</td><td><b>${esc(row.size)}</b></td><td><button class="small-button delete" data-delete-egg="${row.id}">Eliminar</button></td></tr>`;
  const eggsSorted = sortByDateDesc(data.eggs);
  renderRows('recentEggs', eggsSorted.slice(0, RECENT_LIMIT), eggRow, 'No hay huevos registrados.');
  const eggIds = new Set(data.eggs.map(row => row.id));
  selectedEggs.forEach(id => { if (!eggIds.has(id)) selectedEggs.delete(id); });
  renderRows('productionTable', eggsSorted.slice(0, RECENT_LIMIT), eggRowSelectable, 'No hay huevos registrados.');
  $('productionLimitNote').textContent = data.eggs.length > RECENT_LIMIT ? `Mostrando los ${RECENT_LIMIT} más recientes de ${data.eggs.length}. Exporta a Excel para ver el histórico completo.` : '';
  updateEggSelectionUI();
  renderRows('salesTable', sortByDateDesc(data.sales).slice(0, RECENT_LIMIT), row => `<tr><td>${date(row.date)}</td><td>${esc(row.client)}</td><td>${esc(row.type)}</td><td>${row.dozens}</td><td>${euro(row.total)}</td><td><button class="small-button delete" data-delete-sale="${row.id}">Eliminar</button></td></tr>`, 'No hay ventas registradas.');
  renderRows('expensesTable', sortByDateDesc(data.expenses), row => `<tr><td>${date(row.date)}</td><td>${row.feed || 0}</td><td>${row.bedding || 0}</td><td>${row.straw || 0}</td><td>${euro(row.other)}</td><td>${esc(row.concept)}</td><td>${euro(row.total)}</td><td><button class="small-button delete" data-delete-expense="${row.id}">Eliminar</button></td></tr>`, 'No hay gastos registrados.');
  drawCharts();
  renderCalendar();
}
function updateEggSelectionUI() {
  $('eggSelectedCount').textContent = `${selectedEggs.size} seleccionados`;
  $('deleteSelectedEggs').disabled = selectedEggs.size === 0;
}
function renderCalendar() {
  const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth();
  $('calendarTitle').textContent = calendarMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const start = (new Date(year, month, 1).getDay() + 6) % 7; const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: start }, () => '<div class="calendar-day empty"></div>');
  for (let day = 1; day <= days; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const eggs = eggCountFor(key); const sales = data.sales.filter(row => row.date === key);
    const marks = `${eggs ? '<i class="mark egg"></i>' : ''}${sales.length ? '<i class="mark sale"></i>' : ''}`;
    cells.push(`<button class="calendar-day ${key === today ? 'today' : ''} ${key === selectedDate ? 'selected' : ''}" data-date="${key}"><span class="day-number">${day}</span>${eggs ? `<span class="day-total">${eggs} 🥚</span>` : ''}<span class="calendar-marks">${marks}</span></button>`);
  }
  $('calendarGrid').innerHTML = cells.join(''); renderDayPanel();
}
function renderDayPanel() {
  const eggs = data.eggs.filter(row => row.date === selectedDate); const eggTotal = eggCountFor(selectedDate); const sales = data.sales.filter(row => row.date === selectedDate);
  const sizes = ['S', 'M', 'L', 'XL']; const income = sales.reduce((sum, row) => sum + Number(row.total || 0), 0); const dozens = sales.reduce((sum, row) => sum + Number(row.dozens || 0), 0);
  $('dayPanel').innerHTML = `<p class="section-label">${selectedDate === today ? 'HOY' : 'DETALLE DIARIO'}</p><h2>${date(selectedDate)}</h2><div class="daily-kpis"><div><span>Huevos</span><b>${eggTotal}</b></div><div><span>Docenas vendidas</span><b>${dozens}</b></div><div><span>Facturado</span><b>${euro(income)}</b></div></div><h3>Tallas de huevo</h3><div class="daily-sizes">${sizes.map(size => `<span>${size}: ${eggs.filter(row => row.size === size).length}</span>`).join('')}</div><h3>Ventas del día</h3><ul class="daily-list">${sales.length ? sales.map(row => `<li><b>${esc(row.client)}</b> · ${row.dozens} doc. · ${euro(row.total)}</li>`).join('') : '<li>No hay ventas registradas.</li>'}</ul><button class="primary" id="planSale" type="button">Preparar venta para este día</button>`;
}
function drawCharts() {
  if (!window.Chart) return;
  const labels = []; const quantities = [];
  const [selYear, selMonthNum] = selectedMonth.split('-').map(Number); const year = selYear; const month = selMonthNum - 1;
  const isCurrentMonth = selectedMonth === today.slice(0, 7);
  const totalDays = isCurrentMonth ? new Date().getDate() : new Date(year, month + 1, 0).getDate();
  for (let dayNumber = 1; dayNumber <= totalDays; dayNumber++) { const day = new Date(year, month, dayNumber, 12); const key = day.toISOString().slice(0, 10); labels.push(day.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })); quantities.push(eggCountFor(key)); }
  productionChart?.destroy(); sizeChart?.destroy();
  productionChart = new Chart($('productionChart'), { type: 'bar', data: { labels, datasets: [{ data: quantities, backgroundColor: '#2a8757', borderRadius: 5 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#e8eee8' } }, x: { grid: { display: false } } } } });
  const monthEggs = data.eggs.filter(row => inSelectedMonth(row.date)); const sizes = ['S', 'M', 'L', 'XL'];
  sizeChart = new Chart($('sizeChart'), { type: 'doughnut', data: { labels: sizes, datasets: [{ data: sizes.map(size => monthEggs.filter(row => row.size === size).length), backgroundColor: ['#e7b04a', '#6ea778', '#3f8a6a', '#285744'], borderWidth: 0 }] }, options: { cutout: '64%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } } });
}
function switchView(view) { document.querySelectorAll('.view').forEach(node => node.classList.toggle('active', node.id === view)); document.querySelectorAll('.nav').forEach(node => node.classList.toggle('active', node.dataset.view === view)); }
document.querySelectorAll('[data-view]').forEach(node => node.addEventListener('click', () => switchView(node.dataset.view)));
$('previousMonth').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() - 1); renderCalendar(); });
$('nextMonth').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() + 1); renderCalendar(); });
document.querySelectorAll('[data-month-nav]').forEach(button => button.addEventListener('click', () => {
  const [year, month] = selectedMonth.split('-').map(Number);
  const shifted = new Date(year, month - 1 + (button.dataset.monthNav === 'next' ? 1 : -1), 1);
  selectedMonth = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
  render();
}));
$('monthNavToday').addEventListener('click', () => { selectedMonth = today.slice(0, 7); render(); });
$('calendarGrid').addEventListener('click', event => { const cell = event.target.closest('[data-date]'); if (!cell) return; selectedDate = cell.dataset.date; renderCalendar(); });
$('dayPanel').addEventListener('click', event => { if (event.target.id !== 'planSale') return; $('saleDate').value = selectedDate; switchView('sales'); });
$('eggWeights').addEventListener('input', () => { const weights = weightsFromInput(); $('sizePreview').textContent = weights.length ? weights.map(weight => `${weight} g → ${classifyWeight(weight)}`).join(' · ') : 'Escribe los pesos para ver las tallas.'; });
$('eggForm').addEventListener('submit', event => {
  event.preventDefault();
  const weights = weightsFromInput();
  if (!weights.length) return toast('Introduce al menos un peso válido.', true);
  if (!confirm(`¿Seguro que quieres guardar ${weights.length} huevo(s) en la producción?`)) return;
  const eggDate = $('eggDate').value;
  weights.forEach(weight => data.eggs.push({ id: newId(), date: eggDate, weight, size: classifyWeight(weight) }));
  persist();
  $('eggWeights').value = ''; $('sizePreview').textContent = 'Escribe los pesos para ver las tallas.';
  toast(`${weights.length} huevo(s) guardado(s).`);
  render();
});
['recentEggs', 'productionTable'].forEach(id => $(id).addEventListener('click', event => {
  const button = event.target.closest('[data-delete-egg]'); if (!button || !confirm('¿Eliminar este huevo?')) return;
  data.eggs = data.eggs.filter(row => row.id !== button.dataset.deleteEgg);
  persist(); toast('Huevo eliminado.'); render();
}));
$('productionTable').addEventListener('change', event => {
  const checkbox = event.target.closest('[data-select-egg]'); if (!checkbox) return;
  const id = checkbox.dataset.selectEgg;
  if (checkbox.checked) selectedEggs.add(id); else selectedEggs.delete(id);
  updateEggSelectionUI();
});
$('deleteSelectedEggs').addEventListener('click', () => {
  if (!selectedEggs.size) return;
  if (!confirm(`¿Eliminar ${selectedEggs.size} huevo(s) seleccionado(s)?`)) return;
  data.eggs = data.eggs.filter(row => !selectedEggs.has(row.id));
  const count = selectedEggs.size; selectedEggs.clear();
  persist(); toast(`${count} huevo(s) eliminado(s).`); render();
});
$('saleForm').addEventListener('submit', event => {
  event.preventDefault();
  const saleDate = $('saleDate').value; const dozens = Number($('saleDozens').value); const price = salePrice(saleDate);
  data.sales.push({ id: newId(), date: saleDate, client: $('saleClient').value.trim(), type: $('saleType').value.trim(), dozens, price, total: dozens * price });
  persist(); event.target.reset(); $('saleDate').value = today; toast('Venta guardada.'); render();
});
$('expenseForm').addEventListener('submit', event => {
  event.preventDefault();
  const payload = { date: $('expenseDate').value, feed: Number($('expenseFeed').value), bedding: Number($('expenseBedding').value), straw: Number($('expenseStraw').value), other: Number($('expenseOther').value), concept: $('expenseConcept').value.trim(), feedPrice: Number($('expenseFeedPrice').value) || 0, beddingPrice: Number($('expenseBeddingPrice').value) || 0, strawPrice: Number($('expenseStrawPrice').value) || 0 };
  data.expenses.push({ id: newId(), ...payload, total: expenseTotal(payload) });
  persist(); event.target.reset(); $('expenseDate').value = today; ['expenseFeed', 'expenseBedding', 'expenseStraw', 'expenseOther'].forEach(id => $(id).value = 0);
  toast('Gasto guardado.'); render();
});
function resizeImageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
      img.onload = () => {
        const maxSize = 1280;
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ base64: canvas.toDataURL('image/jpeg', 0.82).split(',')[1], mimeType: 'image/jpeg' });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
$('expensePhoto').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const label = document.querySelector('label[for="expensePhoto"]');
  const originalLabel = label.textContent;
  label.classList.add('busy'); label.textContent = 'Leyendo ticket…';
  try {
    const { base64, mimeType } = await resizeImageToBase64(file);
    const response = await fetch('/api/scan-expense', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64, mimeType }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'No se pudo leer el ticket.');
    if (result.date) $('expenseDate').value = result.date;
    $('expenseFeed').value = result.feed || 0;
    $('expenseBedding').value = result.bedding || 0;
    $('expenseStraw').value = result.straw || 0;
    $('expenseOther').value = result.other || 0;
    if (result.feedPrice) $('expenseFeedPrice').value = result.feedPrice;
    if (result.beddingPrice) $('expenseBeddingPrice').value = result.beddingPrice;
    if (result.strawPrice) $('expenseStrawPrice').value = result.strawPrice;
    if (result.concept) $('expenseConcept').value = result.concept;
    toast('Ticket leído. Revisa los datos y guarda el gasto.');
  } catch (error) { toast(error.message, true); }
  finally { label.classList.remove('busy'); label.textContent = originalLabel; event.target.value = ''; }
});
$('salesTable').addEventListener('click', event => {
  const button = event.target.closest('[data-delete-sale]'); if (!button || !confirm('¿Eliminar esta venta?')) return;
  data.sales = data.sales.filter(row => row.id !== button.dataset.deleteSale);
  persist(); toast('Venta eliminada.'); render();
});
$('expensesTable').addEventListener('click', event => {
  const button = event.target.closest('[data-delete-expense]'); if (!button || !confirm('¿Eliminar este gasto?')) return;
  data.expenses = data.expenses.filter(row => row.id !== button.dataset.deleteExpense);
  persist(); toast('Gasto eliminado.'); render();
});
$('exportBtn').addEventListener('click', () => {
  try { ExcelIO.exportFile(data, `GALLINES_backup_${today}.xlsx`); toast('Copia de seguridad descargada.'); }
  catch (error) { toast(error.message, true); }
});
$('changePinBtn').addEventListener('click', async () => {
  let pin = '';
  try { pin = (prompt('Introduce el PIN que quieres usar (mín. 4 caracteres). Debe coincidir en todos los dispositivos que quieras sincronizar juntos:') || '').trim(); }
  catch { return toast('No se pudo abrir el cuadro de PIN.', true); }
  if (pin.length < 4) return toast('El PIN debe tener al menos 4 caracteres.', true);
  toast('Conectando…');
  const connected = await Cloud.setPin(pin);
  updatePinUI();
  if (!connected) { setSyncStatus('offline'); return toast('No se pudo conectar con ese PIN.', true); }
  const remote = await Cloud.pull();
  data = { eggs: remote?.eggs || [], sales: remote?.sales || [], expenses: remote?.expenses || [], daily: remote?.daily || [] };
  Store.save(data); selectedEggs.clear(); render();
  setSyncStatus('synced');
  toast('PIN actualizado. Datos sincronizados.');
});
$('resetDataBtn').addEventListener('click', () => {
  if (!confirm('Esto borrará TODOS los huevos, ventas y gastos (también en la nube, en todos tus dispositivos). ¿Seguro? Esta acción no se puede deshacer.')) return;
  data = Store.empty();
  Store.save(data);
  if (Cloud.isReady()) Cloud.push(data);
  selectedEggs.clear();
  render();
  toast('Todos los datos se han borrado.');
});
$('importFile').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const imported = await ExcelIO.importFile(file);
    data.eggs.push(...imported.eggs); data.sales.push(...imported.sales); data.expenses.push(...imported.expenses); data.daily.push(...imported.daily);
    persist();
    toast(`Importado: ${imported.eggs.length} huevos, ${imported.sales.length} ventas, ${imported.expenses.length} gastos.`);
    render();
  } catch (error) { toast('No se pudo leer el Excel: ' + error.message, true); }
  finally { event.target.value = ''; }
});
render();
(async () => {
  let connected = false;
  try {
    if (!Cloud.hasPin()) {
      const pin = (prompt('Crea un PIN para proteger y sincronizar tus datos en la nube (mín. 4 caracteres). Usa el mismo PIN en todos tus dispositivos para verlos sincronizados; solo quien conozca este PIN podrá acceder a ellos.') || '').trim();
      connected = pin.length >= 4 ? await Cloud.setPin(pin) : false;
    } else {
      connected = await Cloud.init();
    }
  } catch { connected = false; }
  updatePinUI();
  if (!connected) { setSyncStatus('offline'); return; }
  const remote = await Cloud.pull();
  if (remote && (remote.eggs?.length || remote.sales?.length || remote.expenses?.length)) {
    data = { eggs: remote.eggs || [], sales: remote.sales || [], expenses: remote.expenses || [], daily: remote.daily || [] };
    Store.save(data);
    selectedEggs.clear();
    render();
  } else {
    Cloud.push(data);
  }
  setSyncStatus('synced');
  Cloud.listen(remoteData => {
    data = { eggs: remoteData.eggs || [], sales: remoteData.sales || [], expenses: remoteData.expenses || [], daily: remoteData.daily || [] };
    Store.save(data);
    selectedEggs.clear();
    render();
    toast('Datos actualizados desde otro dispositivo.');
  });
})();
