export function planLotReduction(lots: { id: string; quantity: number; purchaseDate: string }[], quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('invalid_sale_quantity');
  const ordered = [...lots].sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate) || a.id.localeCompare(b.id));
  if (ordered.some(lot => !Number.isFinite(lot.quantity) || lot.quantity < 0)) throw new Error('invalid_lot_quantity');
  if (ordered.reduce((sum, lot) => sum + lot.quantity, 0) < quantity) throw new Error('insufficient_quantity');
  let remaining = quantity;
  const reductions: { id: string; quantity: number }[] = [];
  for (const lot of ordered) {
    if (remaining <= 0) break;
    const sold = Math.min(lot.quantity, remaining);
    if (sold > 0) reductions.push({ id: lot.id, quantity: lot.quantity - sold });
    remaining -= sold;
  }
  return reductions;
}
