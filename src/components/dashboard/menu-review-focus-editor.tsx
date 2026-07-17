import Link from "next/link";
import { saveMenuItem } from "@/app/dashboard/actions";
import { PendingSubmitButton } from "@/components/pending-submit-button";

export type MenuEditorFocus = "food-info" | "descriptions";
export type MenuReviewCategory = { id: string; name_it: string };
export type MenuReviewItem = {
  id: string;
  category_id: string;
  name_it: string;
  description_it: string | null;
  ingredients_it: string | null;
  price: number;
  available: boolean;
  vegetarian: boolean;
  vegan: boolean;
  gluten_free: boolean;
};
export type MenuReviewAllergen = { id: string; name_it: string };
export type MenuReviewItemAllergen = { item_id: string; allergen_id: string };

export function filterMenuEditorItems(
  items: MenuReviewItem[],
  itemAllergens: MenuReviewItemAllergen[],
  focus: MenuEditorFocus,
) {
  const allergenItemIds = new Set(itemAllergens.map((relation) => relation.item_id));
  return items.filter((item) => {
    if (!item.available) return false;
    if (focus === "descriptions") return !item.description_it?.trim();
    return !item.ingredients_it?.trim() && !allergenItemIds.has(item.id);
  });
}

export function MenuReviewFocusEditor({
  categories,
  items,
  allergens,
  itemAllergens,
  focus,
}: {
  categories: MenuReviewCategory[];
  items: MenuReviewItem[];
  allergens: MenuReviewAllergen[];
  itemAllergens: MenuReviewItemAllergen[];
  focus: MenuEditorFocus;
}) {
  const focusedItems = filterMenuEditorItems(items, itemAllergens, focus);
  const title = focus === "food-info"
    ? "Informazioni alimentari da verificare"
    : "Descrizioni da completare";
  const intro = focus === "food-info"
    ? "Mostro solo i piatti disponibili senza ingredienti né allergeni dichiarati. Aggiungi ciò che è noto; se l’assenza è intenzionale, puoi lasciare il piatto invariato."
    : "Mostro solo i piatti disponibili senza descrizione. Salva una descrizione e il piatto sparirà automaticamente da questa lista.";

  return (
    <section className="dashboard-panel menu-focus-panel" aria-labelledby="menu-focus-title">
      <header className="menu-focus-heading">
        <div>
          <p className="eyebrow">Controllo pubblicazione</p>
          <h2 id="menu-focus-title">{title}</h2>
          <p>{intro}</p>
        </div>
        <div>
          <span className="count-badge">{focusedItems.length}</span>
          <Link className="button button-light" href="/dashboard/menu/review">← Torna alla revisione</Link>
        </div>
      </header>

      {focusedItems.length ? categories.map((category) => {
        const categoryItems = focusedItems.filter((item) => item.category_id === category.id);
        if (!categoryItems.length) return null;
        return (
          <section className="menu-focus-group" key={category.id}>
            <header><h3>{category.name_it}</h3><span>{categoryItems.length} {categoryItems.length === 1 ? "piatto" : "piatti"}</span></header>
            <div className="menu-focus-list">
              {categoryItems.map((item) => {
                const selectedAllergens = itemAllergens.filter((relation) => relation.item_id === item.id);
                return (
                  <article className="menu-focus-card" key={item.id}>
                    <div className="menu-focus-item-heading"><span>{category.name_it}</span><strong>{item.name_it}</strong></div>
                    <form action={saveMenuItem} className="menu-focus-form">
                      <input type="hidden" name="focus" value={focus} />
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="name" value={item.name_it} />
                      <input type="hidden" name="price" value={item.price} />
                      {item.available ? <input type="hidden" name="available" value="on" /> : null}

                      {focus === "descriptions" ? (
                        <>
                          <input type="hidden" name="ingredients" value={item.ingredients_it ?? ""} />
                          {item.vegetarian ? <input type="hidden" name="vegetarian" value="on" /> : null}
                          {item.vegan ? <input type="hidden" name="vegan" value="on" /> : null}
                          {item.gluten_free ? <input type="hidden" name="gluten_free" value="on" /> : null}
                          {selectedAllergens.map((relation) => <input type="hidden" name="allergens" value={relation.allergen_id} key={relation.allergen_id} />)}
                          <label className="menu-focus-description">Descrizione<input name="description" defaultValue={item.description_it ?? ""} placeholder="Scrivi una breve descrizione del piatto" autoFocus={focusedItems[0]?.id === item.id} /></label>
                        </>
                      ) : (
                        <>
                          <input type="hidden" name="description" value={item.description_it ?? ""} />
                          <label className="ingredients-field">Ingredienti<textarea name="ingredients" rows={3} defaultValue={item.ingredients_it ?? ""} placeholder="Elenca gli ingredienti principali" autoFocus={focusedItems[0]?.id === item.id} /></label>
                          <fieldset className="food-claims">
                            <legend>Indicazioni alimentari</legend>
                            <label><input type="checkbox" name="vegetarian" defaultChecked={item.vegetarian} /> Vegetariano</label>
                            <label><input type="checkbox" name="vegan" defaultChecked={item.vegan} /> Vegano</label>
                            <label><input type="checkbox" name="gluten_free" defaultChecked={item.gluten_free} /> Senza glutine</label>
                          </fieldset>
                          <fieldset className="food-allergens">
                            <legend>Allergeni dichiarati</legend>
                            {allergens.length ? allergens.map((allergen) => (
                              <label key={allergen.id}><input type="checkbox" name="allergens" value={allergen.id} />{allergen.name_it}</label>
                            )) : <p>Nessun allergene configurato. Chiedi all’operatore di aggiungerli durante la revisione del menu.</p>}
                          </fieldset>
                        </>
                      )}
                      <PendingSubmitButton className="button button-accent" pendingLabel="Salvataggio…">Salva e aggiorna la lista</PendingSubmitButton>
                    </form>
                  </article>
                );
              })}
            </div>
          </section>
        );
      }) : (
        <div className="menu-focus-complete" role="status">
          <span aria-hidden="true">✓</span>
          <div><h3>Nessun piatto da sistemare in questo controllo</h3><p>La lista è aggiornata. Torna alla revisione finale per continuare.</p></div>
          <Link className="button button-accent" href="/dashboard/menu/review">Torna alla revisione</Link>
        </div>
      )}
    </section>
  );
}
