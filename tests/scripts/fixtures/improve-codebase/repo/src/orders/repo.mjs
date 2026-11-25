const rows = new Map();

export function findOrder(id) {
  return rows.get(id);
}

export function saveOrder(order) {
  rows.set(order.id, order);
  return order;
}
