import { findOrder, saveOrder } from "./repo.mjs";

export function getOrder(id) {
  return findOrder(id);
}

export function storeOrder(order) {
  return saveOrder(order);
}
