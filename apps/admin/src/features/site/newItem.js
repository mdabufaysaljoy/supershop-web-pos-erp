/**
 * A fresh menu item: `products` needs nothing filled in, so a new row is already valid and the
 * editor never saves something the API would refuse.
 */
export const newItem = () => ({
  id: crypto.randomUUID(),
  label: '',
  target: 'products',
  ref: null,
  href: '',
  children: [],
});
