const STORAGE_KEY = 'gallines-data-v2';
const classifyWeight = weight => Number(weight) < 53 ? 'S' : Number(weight) < 63 ? 'M' : Number(weight) < 73 ? 'L' : 'XL';
const salePrice = date => date < '2025-11-01' ? 3.5 : 4;
const DEFAULT_PRICES = { feedPrice: 11, beddingPrice: 7.5, strawPrice: 4 };
const expenseTotal = ({ feed, bedding, straw, other, feedPrice, beddingPrice, strawPrice }) =>
  Number(other || 0)
  + Number(feed || 0) * Number(feedPrice ?? DEFAULT_PRICES.feedPrice)
  + Number(bedding || 0) * Number(beddingPrice ?? DEFAULT_PRICES.beddingPrice)
  + Number(straw || 0) * Number(strawPrice ?? DEFAULT_PRICES.strawPrice);
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
