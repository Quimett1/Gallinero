const STORAGE_KEY = 'gallines-data-v2';
const classifyWeight = weight => Number(weight) < 53 ? 'S' : Number(weight) < 63 ? 'M' : Number(weight) < 73 ? 'L' : 'XL';
const salePrice = date => date < '2025-11-01' ? 3.5 : 4;
const expenseTotal = ({ feed, bedding, straw, other }) =>
  Number(other || 0) + Number(feed || 0) * 11 + Number(bedding || 0) * 7.5 + Number(straw || 0) * 4;
const newId = () => (window.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const Store = (() => {
  const empty = () => ({ eggs: [], sales: [], expenses: [], daily: [] });
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        eggs: Array.isArray(parsed.eggs) ? parsed.eggs : [],
        sales: Array.isArray(parsed.sales) ? parsed.sales : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
        daily: Array.isArray(parsed.daily) ? parsed.daily : []
      };
    } catch { return empty(); }
  }
  function save(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  return { load, save, empty };
})();
