import React, { useMemo, useState } from 'react';
import { demoCartTotal, validateVMarketCatalog, reviewedProductImage, type VMarketCatalogRow } from '../lib/vmarketCatalogAdapter';

type CatalogFile = { products?: VMarketCatalogRow[] } | VMarketCatalogRow[];
export default function VMarketPreview() {
  const [products, setProducts] = useState<VMarketCatalogRow[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [ordered, setOrdered] = useState(false);
  const selected = useMemo(() => products.filter(p => (p.name + ' ' + p.category).toLocaleLowerCase().includes(query.toLocaleLowerCase())), [products, query]);
  const lines = Object.entries(cart).filter(([,quantity]) => quantity > 0).map(([id,quantity]) => ({ id, quantity }));
  let total = 0;
  try { total = demoCartTotal(products, lines); } catch { total = -1; }
  async function load(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('Файл слишком большой');
      const data: CatalogFile = JSON.parse(await file.text());
      const rows = Array.isArray(data) ? data : data.products;
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('В файле нет товаров');
      const issues = validateVMarketCatalog(rows);
      if (issues.length) throw new Error(issues.slice(0, 5).join('; '));
      setProducts(rows); setCart({}); setOrdered(false); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка каталога'); }
  }
  function add(id: string, delta: number) {
    setOrdered(false);
    setCart(prev => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) }));
  }
  return <main style={{ maxWidth: 1080, margin: 'auto', padding: 24, fontFamily: 'Arial,sans-serif', color: '#1A1D24' }}>
    <h1>VIEWS · V Market</h1>
    <p>Демо-каталог. Заказы не отправляются, реальные остатки не изменяются, оплата не производится.</p>
    <label>Загрузить проверенный каталог JSON: <input type="file" accept=".json,application/json" onChange={e => void load(e.target.files?.[0])}/></label>
    {error && <p role="alert" style={{ color: '#a22' }}>{error}</p>}
    <p>Товаров: {products.length} · В корзине: {lines.reduce((n,l)=>n+l.quantity,0)} · Сумма: {total < 0 ? 'Ошибка количества' : total.toLocaleString('ru-RU') + ' UZS'}</p>
    <input aria-label="Поиск товаров" placeholder="Поиск товаров" value={query} onChange={e=>setQuery(e.target.value)} style={{ padding: 12, width: '100%', boxSizing: 'border-box' }}/>
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14, marginTop: 20 }}>
      {selected.map(p => <article key={p.id} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 14 }}>
        {reviewedProductImage(p) ? <img src={reviewedProductImage(p)!} alt={p.name} style={{ width: '100%', height: 130, objectFit: 'contain' }}/> : <div style={{ height: 130, background: '#f6f5f2', display: 'grid', placeItems: 'center' }}>Фото проверяется</div>}
        <h3>{p.name}</h3><small>{p.category}</small>
        <p><b>{p.price.toLocaleString('ru-RU')} UZS</b></p><p>Остаток в демо: {p.stock}</p>
        <button onClick={()=>add(p.id,-1)} disabled={!cart[p.id]}>−</button> <span>{cart[p.id] || 0}</span> <button onClick={()=>add(p.id,1)} disabled={(cart[p.id]||0)>=p.stock}>+</button>
      </article>)}
    </section>
    <section style={{ marginTop: 24, padding: 20, background: '#f6f5f2', borderRadius: 12 }}>
      <h2>Корзина</h2><p>{lines.length ? lines.map(l=>products.find(p=>p.id===l.id)?.name+' × '+l.quantity).join(' · ') : 'Пусто'}</p>
      <button disabled={!lines.length || total < 0} onClick={()=>setOrdered(true)}>Оформить демо-заказ</button>
      {ordered && <p role="status">Демо-заказ создан только на этом экране. Списание склада и платежи не выполнялись.</p>}
    </section>
  </main>;
}
