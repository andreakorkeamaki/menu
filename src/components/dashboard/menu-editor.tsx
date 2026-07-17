import Link from "next/link";
import {
  createCategory,
  createMenuItem,
  deleteCategory,
  deleteMenuItem,
  moveMenuItem,
  renameCategory,
  reorderMenuEntity,
  saveMenuItem,
} from "@/app/dashboard/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import {
  MenuReviewFocusEditor,
  type MenuEditorFocus,
} from "@/components/dashboard/menu-review-focus-editor";
import type { MenuItemMediaAsset } from "@/components/dashboard/menu-item-media-uploader";
import { formatCurrency } from "@/lib/format";

export { filterMenuEditorItems } from "@/components/dashboard/menu-review-focus-editor";
export type { MenuEditorFocus } from "@/components/dashboard/menu-review-focus-editor";

type Category = { id: string; name_it: string; slug: string; sort_order: number };
type Item = { id: string; category_id: string; name_it: string; description_it: string | null; ingredients_it: string | null; price: number; available: boolean; vegetarian: boolean; vegan: boolean; gluten_free: boolean; image_url: string | null; sort_order: number };
type Allergen = { id: string; code: string; name_it: string };
type ItemAllergen = { item_id: string; allergen_id: string };

function OrderControls({ id, type, index, total }: { id: string; type: "category" | "item"; index: number; total: number }) {
  const subject = type === "category" ? "categoria" : "piatto";
  return (
    <form action={reorderMenuEntity} className="order-controls">
      <input type="hidden" name="entity_id" value={id} />
      <input type="hidden" name="entity_type" value={type} />
      <PendingSubmitButton name="direction" value="up" className="structure-icon-button" pendingLabel="…" aria-label={`Sposta ${subject} prima`} disabled={index === 0}>↑</PendingSubmitButton>
      <PendingSubmitButton name="direction" value="down" className="structure-icon-button" pendingLabel="…" aria-label={`Sposta ${subject} dopo`} disabled={index === total - 1}>↓</PendingSubmitButton>
    </form>
  );
}

export function MenuEditor({ menu, categories, items, allergens, itemAllergens, mediaAssets = {}, focus = null }: { menu: { id: string; name: string }; categories: Category[]; items: Item[]; allergens: Allergen[]; itemAllergens: ItemAllergen[]; mediaAssets?: Record<string, MenuItemMediaAsset>; focus?: MenuEditorFocus | null }) {
  const approvedPhotos = items.filter((item) => Boolean(item.image_url)).length;
  const reviewPhotos = items.filter((item) => mediaAssets[item.id]?.approval_status === "draft").length;
  const incompletePhotos = Math.max(0, items.length - approvedPhotos - reviewPhotos);
  if (focus) {
    return <MenuReviewFocusEditor categories={categories} items={items} allergens={allergens} itemAllergens={itemAllergens} focus={focus} />;
  }

  return (
    <div className="menu-editor">
      <section className="dashboard-panel category-panel">
        <div className="panel-heading"><div><p className="eyebrow">Struttura</p><h2>Categorie</h2></div><span className="count-badge">{categories.length}</span></div>
        <p className="panel-intro">Rinomina e ordina le sezioni come appariranno agli ospiti.</p>
        <form action={createCategory} className="inline-form"><input type="hidden" name="menu_id" value={menu.id} /><label className="sr-only" htmlFor="new-category">Nome nuova categoria</label><input id="new-category" name="name" placeholder="Nuova categoria" required /><PendingSubmitButton className="button button-light" pendingLabel="Aggiunta…">Aggiungi</PendingSubmitButton></form>
        <ol className="category-list">{categories.map((category, index) => {
          const categoryItems = items.filter((item) => item.category_id === category.id);
          return (
            <li key={category.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div className="category-entry">
                <form action={renameCategory} className="category-name-form"><input type="hidden" name="category_id" value={category.id} /><label className="sr-only" htmlFor={`category-${category.id}`}>Nome categoria</label><input id={`category-${category.id}`} name="name" defaultValue={category.name_it} required /><PendingSubmitButton className="text-button" pendingLabel="Salvataggio…">Salva</PendingSubmitButton></form>
                <div className="category-entry-meta"><small>{categoryItems.length} {categoryItems.length === 1 ? "piatto" : "piatti"}</small><OrderControls id={category.id} type="category" index={index} total={categories.length} /><details className="structure-delete"><summary>Elimina</summary><div><p><strong>Eliminare “{category.name_it}”?</strong><span>Verranno rimossi dalla bozza anche {categoryItems.length} {categoryItems.length === 1 ? "piatto" : "piatti"}. La versione online resterà invariata.</span></p><form action={deleteCategory}><input type="hidden" name="category_id" value={category.id} /><PendingSubmitButton className="button button-light danger-button" pendingLabel="Eliminazione…">Conferma</PendingSubmitButton></form></div></details></div>
              </div>
            </li>
          );
        })}</ol>
      </section>
      <section className="menu-photo-shortcut">
        <div><p className="eyebrow">Foto</p><h2>La galleria è separata dall’editor</h2><p>Qui trovi solo il riepilogo: {approvedPhotos} approvate, {reviewPhotos} in revisione e {incompletePhotos} da completare.</p></div>
        <Link className="button button-light" href="/dashboard/photos">Apri la galleria foto →</Link>
      </section>
      <section className="dashboard-panel product-panel">
        <div className="panel-heading"><div><p className="eyebrow">Catalogo</p><h2>Piatti, prezzi e ordine</h2></div><span className="count-badge">{items.length}</span></div>
        <p className="panel-intro">Ogni modifica resta in bozza. Usa “Organizza” per spostare o rimuovere un piatto.</p>
        {categories.map((category) => {
          const categoryItems = items.filter((item) => item.category_id === category.id);
          return (
          <section className="product-group" key={category.id}>
            <header><h3>{category.name_it}</h3><span>{categoryItems.length} {categoryItems.length === 1 ? "piatto" : "piatti"}</span></header>
            <div className="product-editor-list">
              {categoryItems.map((item, itemIndex) => (
                <article className="item-editor-card" key={item.id}>
                <form action={saveMenuItem} className="product-editor-row">
                  <input type="hidden" name="id" value={item.id} />
                  <label>Nome<input name="name" defaultValue={item.name_it} required /></label>
                  <label>Descrizione<input name="description" defaultValue={item.description_it ?? ""} /></label>
                  <label>Prezzo<input name="price" type="number" min="0" step="0.01" defaultValue={item.price} /></label>
                  <label className="toggle-label"><input name="available" type="checkbox" defaultChecked={item.available} /><span /> Disponibile</label>
                  <PendingSubmitButton className="button button-light" pendingLabel="Salvataggio…">Salva</PendingSubmitButton>
                  <small>{formatCurrency(item.price)}</small>
                  <details className="product-food-details">
                    <summary>
                      <span>Ingredienti, allergeni e preferenze</span>
                      <small>{itemAllergens.filter((relation) => relation.item_id === item.id).length} allergeni dichiarati</small>
                    </summary>
                    <div className="food-details-grid">
                      <label className="ingredients-field">Ingredienti<textarea name="ingredients" rows={3} defaultValue={item.ingredients_it ?? ""} placeholder="Elenca gli ingredienti principali" /></label>
                      <fieldset className="food-claims">
                        <legend>Indicazioni alimentari</legend>
                        <label><input type="checkbox" name="vegetarian" defaultChecked={item.vegetarian} /> Vegetariano</label>
                        <label><input type="checkbox" name="vegan" defaultChecked={item.vegan} /> Vegano</label>
                        <label><input type="checkbox" name="gluten_free" defaultChecked={item.gluten_free} /> Senza glutine</label>
                        <small>Se selezioni “Vegano”, il piatto verrà salvato anche come vegetariano.</small>
                      </fieldset>
                      <fieldset className="food-allergens">
                        <legend>Allergeni dichiarati</legend>
                        {allergens.length ? allergens.map((allergen) => (
                          <label key={allergen.id}>
                            <input type="checkbox" name="allergens" value={allergen.id} defaultChecked={itemAllergens.some((relation) => relation.item_id === item.id && relation.allergen_id === allergen.id)} />
                            {allergen.name_it}
                          </label>
                        )) : <p>Nessun allergene configurato. Chiedi all’operatore di aggiungerli durante la revisione del menu.</p>}
                      </fieldset>
                    </div>
                  </details>
                </form>
                <footer className="item-structure-bar">
                  <span>Organizza</span>
                  <OrderControls id={item.id} type="item" index={itemIndex} total={categoryItems.length} />
                  {categories.length > 1 ? <form action={moveMenuItem} className="item-move-form"><input type="hidden" name="item_id" value={item.id} /><label htmlFor={`move-${item.id}`}>Sposta in</label><select id={`move-${item.id}`} name="target_category_id" defaultValue={categories.find((entry) => entry.id !== category.id)?.id}>{categories.filter((entry) => entry.id !== category.id).map((entry) => <option value={entry.id} key={entry.id}>{entry.name_it}</option>)}</select><PendingSubmitButton className="text-button" pendingLabel="Spostamento…">Sposta</PendingSubmitButton></form> : null}
                  <details className="structure-delete item-delete"><summary>Rimuovi piatto</summary><div><p><strong>Rimuovere “{item.name_it}”?</strong><span>Ingredienti, allergeni e traduzioni collegati verranno eliminati dalla bozza. La versione online resterà invariata.</span></p><form action={deleteMenuItem}><input type="hidden" name="item_id" value={item.id} /><PendingSubmitButton className="button button-light danger-button" pendingLabel="Rimozione…">Conferma rimozione</PendingSubmitButton></form></div></details>
                </footer>
                </article>
              ))}
              {!categoryItems.length ? <div className="empty-category"><span aria-hidden="true">＋</span><p><strong>Questa categoria è vuota.</strong>Aggiungi il primo piatto qui sotto.</p></div> : null}
            </div>
            <form action={createMenuItem} className="inline-form add-product"><input type="hidden" name="category_id" value={category.id} /><label className="sr-only" htmlFor={`new-item-${category.id}`}>Nome nuovo piatto in {category.name_it}</label><input id={`new-item-${category.id}`} name="name" placeholder="Nuovo piatto" required /><label className="sr-only" htmlFor={`new-price-${category.id}`}>Prezzo</label><input id={`new-price-${category.id}`} name="price" type="number" min="0" step="0.01" placeholder="Prezzo" required /><PendingSubmitButton className="button button-light" pendingLabel="Aggiunta…">Aggiungi</PendingSubmitButton></form>
          </section>
        );})}
        {!categories.length ? <div className="empty-state"><h3>Inizia dalle categorie</h3><p>Aggiungi una categoria nel pannello Struttura, poi inserisci i primi piatti.</p></div> : null}
      </section>
      <aside className="publish-bar"><div><strong>Bozza pronta?</strong><span>Rivedi contenuti, traduzioni e informazioni alimentari prima di creare la nuova versione.</span></div><Link className="button button-accent" href="/dashboard/menu/review">Controlla e pubblica</Link></aside>
    </div>
  );
}
