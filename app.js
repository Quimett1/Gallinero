const $ = id => document.getElementById(id);
const today = new Date().toISOString().slice(0, 10);
['eggDate', 'saleDate', 'expenseDate', 'orderDate'].forEach(id => $(id).value = today);
let data = { eggs: [], sales: [], expenses: [], daily: [] };
let productionChart, sizeChart;
let cloudConnected = false;
let calendarMonth = new Date(`${today}T12:00:00`); calendarMonth.setDate(1);
let selectedDate = today;
let orders = JSON.parse(localStorage.getItem('gallines-orders-v1') || '[]');

const euro = value => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
const date = value => value ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : '—';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const sameMonth = value => value?.slice(0, 7) === today.slice(0, 7);
const eggCountFor = dateKey => data.eggs.filter(row => row.date === dateKey).length || Number(data.daily.find(row => row.date === dateKey)?.total || 0);
const saveOrders = () => localStorage.setItem('gallines-orders-v1', JSON.stringify(orders));

function toast(message, error = false) {
  const node = $('toast'); node.textContent = message; node.className = `${error ? 'error ' : ''}show`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.className = '', 3600);
}
function classify(weight) { return weight < 53 ? 'S' : weight < 63 ? 'M' : weight < 73 ? 'L' : 'XL'; }
function weightsFromInput() {
  return $('eggWeights').value.split(/[\s,;]+/).filter(Boolean).map(Number).filter(value => Number.isFinite(value) && value > 0);
}
function renderRows(id, rows, render, empty) {
  $(id).innerHTML = rows.slice().reverse().map(render).join('') || `<tr><td colspan="8">${empty}</td></tr>`;
}
function render() {
  const todayEggs = eggCountFor(today);
  const sales = data.sales.filter(row => sameMonth(row.date));
  const expenses = data.expenses.filter(row => sameMonth(row.date));
  const income = sales.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.total || 0), 0);
  $('eggsToday').textContent = todayEggs;
  $('eggsTodayDetail').textContent = todayEggs ? `Registrados el ${date(today)}` : 'Todavía no hay registros';
  $('dozensMonth').textContent = sales.reduce((sum, row) => sum + Number(row.dozens || 0), 0);
  $('incomeMonth').textContent = euro(income);
  $('profitMonth').textContent = euro(income - expenseTotal);
  $('salesMonthValue').textContent = euro(income);
  $('salesMonthDetail').textContent = `${sales.reduce((sum, row) => sum + Number(row.dozens || 0), 0)} docenas vendidas este mes`;
  $('expensesMonthValue').textContent = euro(expenseTotal);
  $('expensesMonthDetail').textContent = `${expenses.length} gastos registrados este mes`;
  const eggRow = row => `<tr><td>${date(row.date)}</td><td>${row.weight} g</td><td><b>${esc(row.size)}</b></td><td><button class="small-button delete" data-delete-egg="${row.row}">Eliminar</button></td></tr>`;
  renderRows('recentEggs', data.eggs, eggRow, 'No hay huevos registrados.');
  renderRows('productionTable', data.eggs, eggRow, 'No hay huevos registrados.');
  renderRows('salesTable', data.sales, row => `<tr><td>${date(row.date)}</td><td>${esc(row.client)}</td><td>${esc(row.type)}</td><td>${row.dozens}</td><td>${euro(row.total)}</td><td><button class="small-button delete" data-delete-sale="${row.row}">Eliminar</button></td></tr>`, 'No hay ventas registradas.');
  renderRows('expensesTable', data.expenses, row => `<tr><td>${date(row.date)}</td><td>${row.feed || 0}</td><td>${row.bedding || 0}</td><td>${row.straw || 0}</td><td>${euro(row.other)}</td><td>${esc(row.concept)}</td><td>${euro(row.total)}</td><td><button class="small-button delete" data-delete-expense="${row.row}">Eliminar</button></td></tr>`, 'No hay gastos registrados.');
  drawCharts();
  renderCalendar(); renderOrders();
}
function renderCalendar() {
  const year = calendarMonth.getFullYear(); const month = calendarMonth.getMonth();
  $('calendarTitle').textContent = calendarMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const start = (new Date(year, month, 1).getDay() + 6) % 7; const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: start }, () => '<div class="calendar-day empty"></div>');
  for (let day = 1; day <= days; day++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const eggs = eggCountFor(key); const sales = data.sales.filter(row => row.date === key); const dayOrders = orders.filter(row => row.date === key);
    const marks = `${eggs ? '<i class="mark egg"></i>' : ''}${sales.length ? '<i class="mark sale"></i>' : ''}${dayOrders.length ? '<i class="mark order"></i>' : ''}`;
    cells.push(`<button class="calendar-day ${key === today ? 'today' : ''} ${key === selectedDate ? 'selected' : ''}" data-date="${key}"><span class="day-number">${day}</span>${eggs ? `<span class="day-total">${eggs} 🥚</span>` : ''}<span class="calendar-marks">${marks}</span></button>`);
  }
  $('calendarGrid').innerHTML = cells.join(''); renderDayPanel();
}
function renderDayPanel() {
  const eggs = data.eggs.filter(row => row.date === selectedDate); const eggTotal = eggCountFor(selectedDate); const sales = data.sales.filter(row => row.date === selectedDate); const dayOrders = orders.filter(row => row.date === selectedDate);
  const sizes = ['S', 'M', 'L', 'XL']; const income = sales.reduce((sum, row) => sum + Number(row.total || 0), 0); const dozens = sales.reduce((sum, row) => sum + Number(row.dozens || 0), 0);
  $('dayPanel').innerHTML = `<p class="section-label">${selectedDate === today ? 'HOY' : 'DETALLE DIARIO'}</p><h2>${date(selectedDate)}</h2><div class="daily-kpis"><div><span>Huevos</span><b>${eggTotal}</b></div><div><span>Docenas vendidas</span><b>${dozens}</b></div><div><span>Facturado</span><b>${euro(income)}</b></div><div><span>Comandas</span><b>${dayOrders.length}</b></div></div><h3>Tallas de huevo</h3><div class="daily-sizes">${sizes.map(size => `<span>${size}: ${eggs.filter(row => row.size === size).length}</span>`).join('')}</div><h3>Ventas del día</h3><ul class="daily-list">${sales.length ? sales.map(row => `<li><b>${esc(row.client)}</b> · ${row.dozens} doc. · ${euro(row.total)}</li>`).join('') : '<li>No hay ventas registradas.</li>'}</ul><h3>Comandas</h3><ul class="daily-list">${dayOrders.length ? dayOrders.map(row => `<li><b>${esc(row.client)}</b> · ${row.dozens} doc. · ${euro(row.total)}</li>`).join('') : '<li>No hay comandas pendientes.</li>'}</ul><button class="primary" id="planSale" type="button">Preparar venta para este día</button>`;
}
function renderOrders() {
  const total = orders.reduce((sum, order) => sum + Number(order.total), 0); $('ordersTotal').textContent = euro(total); $('ordersCount').textContent = orders.length ? `${orders.length} comanda(s) pendiente(s) · ${orders.reduce((sum, order) => sum + Number(order.dozens), 0)} docenas` : 'No hay comandas pendientes.';
  $('ordersTable').innerHTML = orders.slice().sort((a, b) => a.date.localeCompare(b.date)).map(order => `<tr><td>${date(order.date)}</td><td>${esc(order.client)}</td><td>${order.dozens}</td><td>${euro(order.price)}</td><td>${euro(order.total)}</td><td>${esc(order.notes)}</td><td><div class="order-actions"><button class="small-button" data-action="complete" data-id="${order.id}">Entregar</button><button class="small-button delete" data-action="delete" data-id="${order.id}">Eliminar</button></div></td></tr>`).join('') || '<tr><td colspan="7">No hay comandas pendientes.</td></tr>';
}
function drawCharts() {
  if (!window.Chart) return;
  const labels = []; const quantities = [];
  const now = new Date(); const year = now.getFullYear(); const month = now.getMonth(); const totalDays = now.getDate();
  for (let dayNumber = 1; dayNumber <= totalDays; dayNumber++) { const day = new Date(year, month, dayNumber, 12); const key = day.toISOString().slice(0, 10); labels.push(day.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })); quantities.push(eggCountFor(key)); }
  productionChart?.destroy(); sizeChart?.destroy();
  productionChart = new Chart($('productionChart'), { type: 'bar', data: { labels, datasets: [{ data: quantities, backgroundColor: '#2a8757', borderRadius: 5 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#e8eee8' } }, x: { grid: { display: false } } } } });
  const monthEggs = data.eggs.filter(row => sameMonth(row.date)); const sizes = ['S', 'M', 'L', 'XL'];
  sizeChart = new Chart($('sizeChart'), { type: 'doughnut', data: { labels: sizes, datasets: [{ data: sizes.map(size => monthEggs.filter(row => row.size === size).length), backgroundColor: ['#e7b04a', '#6ea778', '#3f8a6a', '#285744'], borderWidth: 0 }] }, options: { cutout: '64%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } } });
}
async function request(path, options) {
  if (cloudConnected) {
    if (path === '/api/data') return CloudExcel.load();
    const payload = JSON.parse(options.body);
    if (path === '/api/eggs') return CloudExcel.appendEggs(payload);
    if (path === '/api/delete-egg') return CloudExcel.deleteEgg(payload.row);
    if (path === '/api/sale') return CloudExcel.appendSale(payload);
    if (path === '/api/expense') return CloudExcel.appendExpense(payload);
    if (path === '/api/delete-sale') return CloudExcel.deleteSale(payload.row);
    if (path === '/api/delete-expense') return CloudExcel.deleteExpense(payload.row);
  }
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'No se pudo actualizar el Excel.');
  return body;
}
async function load() {
  if (!cloudConnected && location.hostname !== 'localhost') { render(); return; }
  try {
    $('connection').textContent = 'Leyendo GALLINES.xlsx…';
    data = await request('/api/data'); render();
    $('connection').className = 'connection ready'; $('connection').textContent = '● GALLINES.xlsx conectado';
  } catch (error) {
    $('connection').className = 'connection error'; $('connection').textContent = 'Excel no conectado';
    toast(cloudConnected ? error.message : 'Conecta OneDrive para leer el Excel.', true);
    render();
  }
}
function switchView(view) { document.querySelectorAll('.view').forEach(node => node.classList.toggle('active', node.id === view)); document.querySelectorAll('.nav').forEach(node => node.classList.toggle('active', node.dataset.view === view)); }
document.querySelectorAll('[data-view]').forEach(node => node.addEventListener('click', () => switchView(node.dataset.view)));
$('signIn').addEventListener('click', async () => {
  try {
    $('signIn').disabled = true; $('signIn').textContent = 'Conectando…';
    const connected = await CloudExcel.signIn();
    if (!connected) return;
    cloudConnected = true;
    $('signIn').textContent = 'OneDrive conectado'; $('signIn').classList.add('connected');
    await load();
  } catch (error) { toast(error.message || 'No se pudo iniciar sesión con OneDrive.', true); $('signIn').textContent = 'Conectar OneDrive'; }
  finally { $('signIn').disabled = false; }
});
$('refresh').addEventListener('click', load);
$('previousMonth').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() - 1); renderCalendar(); });
$('nextMonth').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() + 1); renderCalendar(); });
$('calendarGrid').addEventListener('click', event => { const cell = event.target.closest('[data-date]'); if (!cell) return; selectedDate = cell.dataset.date; renderCalendar(); });
$('dayPanel').addEventListener('click', event => { if (event.target.id !== 'planSale') return; $('saleDate').value = selectedDate; switchView('sales'); });
$('eggWeights').addEventListener('input', () => { const weights = weightsFromInput(); $('sizePreview').textContent = weights.length ? weights.map(weight => `${weight} g → ${classify(weight)}`).join(' · ') : 'Escribe los pesos para ver las tallas.'; });
$('eggForm').addEventListener('submit', async event => { event.preventDefault(); const weights = weightsFromInput(); if (!weights.length) return toast('Introduce al menos un peso válido.', true); try { await request('/api/eggs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: $('eggDate').value, weights }) }); $('eggWeights').value = ''; $('sizePreview').textContent = 'Escribe los pesos para ver las tallas.'; toast(`${weights.length} huevo(s) guardado(s) en POSTA_DIÀRIA_MIDES.`); await load(); } catch (error) { toast(error.message, true); } });
['recentEggs', 'productionTable'].forEach(id => $(id).addEventListener('click', async event => { const button = event.target.closest('[data-delete-egg]'); if (!button || !confirm('¿Eliminar este huevo del Excel?')) return; try { await request('/api/delete-egg', { method: 'POST', body: JSON.stringify({ row: Number(button.dataset.deleteEgg) }) }); toast('Huevo eliminado del Excel.'); await load(); } catch (error) { toast(error.message, true); } }));
$('saleForm').addEventListener('submit', async event => { event.preventDefault(); try { await request('/api/sale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: $('saleDate').value, client: $('saleClient').value.trim(), type: $('saleType').value.trim(), dozens: Number($('saleDozens').value) }) }); event.target.reset(); $('saleDate').value = today; toast('Venta guardada en VENTES.'); await load(); } catch (error) { toast(error.message, true); } });
$('expenseForm').addEventListener('submit', async event => { event.preventDefault(); try { await request('/api/expense', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: $('expenseDate').value, feed: Number($('expenseFeed').value), bedding: Number($('expenseBedding').value), straw: Number($('expenseStraw').value), other: Number($('expenseOther').value), concept: $('expenseConcept').value.trim() }) }); event.target.reset(); $('expenseDate').value = today; ['expenseFeed', 'expenseBedding', 'expenseStraw', 'expenseOther'].forEach(id => $(id).value = 0); toast('Gasto guardado en DESPESES.'); await load(); } catch (error) { toast(error.message, true); } });
$('salesTable').addEventListener('click', async event => { const button = event.target.closest('[data-delete-sale]'); if (!button || !confirm('¿Eliminar esta venta del Excel?')) return; try { await request('/api/delete-sale', { method: 'POST', body: JSON.stringify({ row: Number(button.dataset.deleteSale) }) }); toast('Venta eliminada del Excel.'); await load(); } catch (error) { toast(error.message, true); } });
$('expensesTable').addEventListener('click', async event => { const button = event.target.closest('[data-delete-expense]'); if (!button || !confirm('¿Eliminar este gasto del Excel?')) return; try { await request('/api/delete-expense', { method: 'POST', body: JSON.stringify({ row: Number(button.dataset.deleteExpense) }) }); toast('Gasto eliminado del Excel.'); await load(); } catch (error) { toast(error.message, true); } });
$('orderForm').addEventListener('submit', event => { event.preventDefault(); const dozens = Number($('orderDozens').value); const price = Number($('orderPrice').value); orders.push({ id: `${Date.now()}-${Math.random()}`, date: $('orderDate').value, client: $('orderClient').value.trim(), dozens, price, total: dozens * price, notes: $('orderNotes').value.trim() }); saveOrders(); event.target.reset(); $('orderDate').value = today; $('orderPrice').value = 4; renderCalendar(); renderOrders(); toast('Comanda añadida al calendario.'); });
$('ordersTable').addEventListener('click', event => { const button = event.target.closest('[data-action]'); if (!button) return; const order = orders.find(item => item.id === button.dataset.id); if (!order) return; if (button.dataset.action === 'delete') { if (!confirm('¿Eliminar esta comanda?')) return; orders = orders.filter(item => item.id !== order.id); saveOrders(); renderOrders(); renderCalendar(); toast('Comanda eliminada.'); return; } $('saleDate').value = order.date; $('saleClient').value = order.client; $('saleDozens').value = order.dozens; orders = orders.filter(item => item.id !== order.id); saveOrders(); renderOrders(); renderCalendar(); switchView('sales'); toast('Comanda preparada para registrar como venta.'); });
(async () => {
  if (await CloudExcel.initialize()) cloudConnected = true;
  await load();
})();
