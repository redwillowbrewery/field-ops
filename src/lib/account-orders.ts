import type { SupabaseClient } from "@supabase/supabase-js";

export type AccountOrder = {
  id: string; viewplan_order_no: string; order_date: string;
  delivery_date: string | null; sales_channel: string | null;
  net_amount: number; invoice_no: string | null;
};
export type AccountOrderLine = {
  order_id: string; product_name: string | null; package_type: string | null;
  quantity: number | null; net_after_discount: number | null; line_type: string;
};

// Explicit pagination keeps orders and their products complete past REST row caps.
export async function getAccountOrderHistory(db: SupabaseClient, accountId: string) {
  const orders: AccountOrder[] = [], lines: AccountOrderLine[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from("sales_orders")
      .select("id,viewplan_order_no,order_date,delivery_date,sales_channel,net_amount,invoice_no")
      .eq("account_id", accountId)
      .eq("dispatched", true)
      .order("order_date", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    orders.push(...((data || []) as AccountOrder[]));
    if (!data || data.length < pageSize) break;
  }
  for (let start = 0; start < orders.length; start += 200) {
    const ids = orders.slice(start, start + 200).map(order => order.id);
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await db.from("sales_order_lines")
        .select("order_id,product_name,package_type,quantity,net_after_discount,line_type")
        .in("order_id", ids).order("order_id").order("line_number")
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      lines.push(...((data || []) as AccountOrderLine[]));
      if (!data || data.length < pageSize) break;
    }
  }
  return { orders, lines };
}
