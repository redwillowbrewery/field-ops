-- ============================================================
-- FIELD OPS - VIEWPLAN SALES HISTORY
-- ============================================================
-- ViewPlan remains the authoritative source for complete order history.
-- These tables are read-only to signed-in users; imports use service role.

create table if not exists sales_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  viewplan_order_no text not null unique,
  order_date date not null,
  invoice_date date,
  delivery_date date,
  customer_order_ref text,
  comment text,
  sales_channel text,
  customer_class text,
  location_zone text,
  account_rep text,
  order_source text,
  dispatched boolean,
  dispatched_date date,
  delivered boolean,
  invoice_no text,
  invoice_year integer,
  invoice_month integer,
  net_amount numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  total_litres numeric(14,2) not null default 0,
  source_customer_display text,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references sales_orders(id) on delete cascade,
  line_number integer not null,
  product_name text,
  package_type text,
  package_unit_litres numeric(12,3),
  total_litres numeric(14,3),
  draught boolean,
  standard_unit_price numeric(14,2),
  item_discount_percent numeric(8,4),
  order_discount_percent numeric(8,4),
  quantity numeric(14,3),
  net_amount numeric(14,2),
  vat_amount numeric(14,2),
  net_after_discount numeric(14,2),
  vat_after_discount numeric(14,2),
  vat_rate numeric(8,4),
  gross_amount numeric(14,2),
  manufacturing_cost numeric(14,2),
  total_manufacturing_cost numeric(14,2),
  duty numeric(14,2),
  sales_margin_percent numeric(8,4),
  delivery_vehicle text,
  line_weight_kg numeric(14,3),
  line_type text not null default 'product' check (line_type in ('product','discount','credit','misc')),
  unique(order_id, line_number)
);

create index if not exists sales_orders_account_date_idx on sales_orders(account_id, order_date desc);
create index if not exists sales_orders_order_date_idx on sales_orders(order_date desc);
create index if not exists sales_orders_sales_channel_idx on sales_orders(sales_channel);
create index if not exists sales_order_lines_order_idx on sales_order_lines(order_id);
create index if not exists sales_order_lines_product_idx on sales_order_lines(product_name);

alter table sales_orders enable row level security;
alter table sales_order_lines enable row level security;

drop policy if exists "authenticated read sales orders" on sales_orders;
create policy "authenticated read sales orders" on sales_orders
  for select to authenticated using (true);

drop policy if exists "authenticated read sales order lines" on sales_order_lines;
create policy "authenticated read sales order lines" on sales_order_lines
  for select to authenticated using (true);

create trigger sales_orders_set_updated_at
before update on sales_orders
for each row execute function set_updated_at();
