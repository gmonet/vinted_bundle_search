# API web Vinted (non officielle)

Relevé le **2026-11-13** sur `www.vinted.fr`, sans être connecté. Tous les appels sont faits
depuis une page vinted.fr (cookies et contexte anti-bot du site), avec
`credentials: 'include'` et `accept: application/json`. Implémentation : `src/core/api.ts`.

> L'API change sans prévenir. L'ancien `GET www.vinted.fr/api/v2/catalog/items` (utilisé par la
> plupart des projets open source) répond désormais **404**.

## Recherche d'articles

`GET https://api.vinted.fr/svc-catalogue/items`

| Paramètre                | Exemple            | Notes                                                           |
| ------------------------ | ------------------ | --------------------------------------------------------------- |
| `search_text`            | `playmobil police` | recherche floue (pas un ET logique strict)                      |
| `page`, `per_page`       | `1`, `96`          | **96 max** (au-delà, plafonné à 96)                             |
| `order`                  | `relevance`        | `newest_first`, `price_low_to_high` (vérifiés)                  |
| `price_from`, `price_to` | `5`                | avec `currency=EUR`                                             |
| `attribute_ids[catalog]` | `1499`             | répétable ; idem `brand`, `status`, `size`, `color`, `material` |

Ignorés : `user_id` (pas de recherche par vendeur ici, voir dressing).

Réponse : `{ items: [...], pagination: { current_page, total_pages, total_entries, per_page } }`.
Article : `id`, `title`, `url` (relative), `photo{url, thumbnails[]}`, `price{amount (string),
currency_code}`, `total_item_price` (avec protection acheteur), `service_fee`,
`user{id, login, business}`, `item_box{first_line = marque, second_line = "taille · état"}`.
Pas de champ `status`/`brand_title` direct : on les extrait de `item_box`.

## États (`attribute_ids[status]`)

| id  | libellé             |
| --- | ------------------- |
| 6   | Neuf avec étiquette |
| 1   | Neuf sans étiquette |
| 2   | Très bon état       |
| 3   | Bon état            |
| 4   | Satisfaisant        |

## Filtres

- `GET https://api.vinted.fr/svc-filters/filters?search_text=…` : liste des filtres (`size`,
  `brand`, `status`, `color`, `price`, `material`) ; options chargées paresseusement.
- `GET https://api.vinted.fr/svc-filters/filters/facets?filter_code=brand&search_text=…[&attribute_ids[catalog]=…]`
  → `{ options: [{ id, title, items_count, options?: [...] }] }`. Contextuel à la recherche
  (≈ 50 marques max). Les tailles sont groupées (`options` imbriquées).
- `GET https://api.vinted.fr/svc-filters/faceted_categories?search_text=…[&attribute_ids[catalog]=parent]`
  → `{ categories: [{ id, title, item_count, url }] }` : catégories racines, ou enfants de
  `parent`. Exemple : 1193 = Enfants → 1499 Jeux et jouets, …

## Dressing d'un vendeur

`GET https://www.vinted.fr/api/v2/wardrobe/{user_id}/items?page=1&per_page=96&order=relevance`

Réponse : `{ items, pagination }`. Article : `title`, `price`, `brand` (string), `size`
(string), `status` (string, ex. « Bon état »), `photos[]`, `url`, `is_closed`, `is_reserved`,
`is_hidden`, `is_draft`. Pas de `catalog_id` ni de couleur. `search_text` est ignoré.

## Profil vendeur

`GET https://www.vinted.fr/api/v2/users/{user_id}` → `{ user: { login, item_count,
feedback_count, feedback_reputation (0..1), bundle_discount, can_bundle, is_on_holiday,
country_title, business, … } }`.

## Anti-bot

La protection (DataDome, `dd.vinted.lt`) enveloppe `window.fetch`. Un appel hors contexte
renvoie une page HTML « Please wait / Enable JavaScript and cookies » (HTTP 403) : le client
la détecte (`VintedError` de type `challenge`) et arrête proprement la recherche.
Les appels via `fetch` depuis la page fonctionnent sans être connecté.
