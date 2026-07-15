import { createCategory, createMenuItem, publishMenu, saveMenuItem } from "@/app/dashboard/actions";
import { formatCurrency } from "@/lib/format";

type Category = { id: string; name_it: string; slug: string; sort_order: number };
type Item = { id: string; category_id: string; name_it: string; description_it: string | null; price: number; available: boolean; sort_order: number };

export function MenuEditor({ menu, categories, items }: { menu: { id: string; name: string }; categories: Category[]; items: Item[] }) {
  return (
    <div className="menu-editor">
      <section className="dashboard-panel category-panel">
        <div className="panel-heading"><div><p className="eyebrow">Struttura</p><h2>Categorie</h2></div></div>
        <form action={createCategory} className="inline-form"><input type="hidden" name="menu_id" value={menu.id} /><input name="name" placeholder="Nuova categoria" required /><button className="button button-light">Aggiungi</button></form>
        <ol className="category-list">{categories.map((category, index) => <li key={category.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{category.name_it}</strong><small>/{category.slug}</small></div></li>)}</ol>
      </section>
      <section className="dashboard-panel product-panel">
        <div className="panel-heading"><div><p className="eyebrow">Catalogo</p><h2>Piatti e prezzi</h2></div><span className="count-badge">{items.length}</span></div>
        {categories.map((category) => (
          <section className="product-group" key={category.id}>
            <h3>{category.name_it}</h3>
            <div className="product-editor-list">
              {items.filter((item) => item.category_id === category.id).map((item) => (
                <form action={saveMenuItem} className="product-editor-row" key={item.id}>
                  <input type="hidden" name="id" value={item.id} />
                  <label>Nome<input name="name" defaultValue={item.name_it} required /></label>
                  <label>Descrizione<input name="description" defaultValue={item.description_it ?? ""} /></label>
                  <label>Prezzo<input name="price" type="number" min="0" step="0.01" defaultValue={item.price} /></label>
                  <label className="toggle-label"><input name="available" type="checkbox" defaultChecked={item.available} /><span /> Disponibile</label>
                  <button className="button button-light">Salva</button>
                  <small>{formatCurrency(item.price)}</small>
                </form>
              ))}
            </div>
            <form action={createMenuItem} className="inline-form add-product"><input type="hidden" name="category_id" value={category.id} /><input name="name" placeholder="Nuovo piatto" required /><input name="price" type="number" min="0" step="0.01" placeholder="Prezzo" required /><button className="button button-light">Aggiungi</button></form>
          </section>
        ))}
      </section>
      <aside className="publish-bar"><div><strong>Bozza pronta?</strong><span>La pubblicazione crea una versione immutabile.</span></div><form action={publishMenu}><input type="hidden" name="menu_id" value={menu.id} /><button className="button button-accent">Controlla e pubblica</button></form></aside>
    </div>
  );
}
