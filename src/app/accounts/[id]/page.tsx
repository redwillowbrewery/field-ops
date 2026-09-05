import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountTimeline } from "@/components/account-timeline";
import { AccountContactAction } from "@/components/account-contact-action";
import { BottomNav } from "@/components/bottom-nav";
import { CopyTextButton } from "@/components/copy-text-button";
import { getAccountSellingData } from "@/lib/account-selling";
import type { AccountContainerPreference } from "@/lib/package-eligibility";
import { createSupabaseServerClient } from "@/lib/supabase";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: account, error } = await supabase
    .from("accounts")
    .select(`*, territory:territories(id,name), contacts(*)`)
    .eq("id", id)
    .single();
  if (error || !account) notFound();
  const salesYear = new Date().getFullYear();
  const [
    { data: visits },
    { data: tasks },
    { data: appointments },
    { data: notes },
    { data: interactions },
    { data: salesRows },
    { data: latestOrderRows },
    { data: containers },
    selling,
  ] = await Promise.all([
    supabase
      .from("visits")
      .select(
        "id,completed_at,notes,outcome,contact:contacts(full_name),salesperson:profiles(full_name,email)",
      )
      .eq("account_id", id)
      .order("completed_at", { ascending: false })
      .limit(40),
    supabase
      .from("tasks")
      .select("id,title,task_type,due_at,status,completed_at,notes,created_at")
      .eq("account_id", id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("appointments")
      .select("id,starts_at,purpose,status,notes")
      .eq("account_id", id)
      .order("starts_at", { ascending: false })
      .limit(40),
    supabase
      .from("account_notes")
      .select("id,body,created_at,author_id")
      .eq("account_id", id)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("interactions")
      .select(
        "id,channel,outcome,note,occurred_at,source_context,visit_id,contact:contacts(full_name),actor:profiles(full_name,email),visit:visits(id,outcome,notes)",
      )
      .eq("account_id", id)
      .order("occurred_at", { ascending: false })
      .limit(40),
    supabase.rpc("account_sales_summary", {
      p_account_id: id,
      p_year: salesYear,
    }),
    supabase.rpc("account_latest_order_dates", { p_account_ids: [id] }),
    supabase
      .from("account_containers_snapshot")
      .select("id,off_site_days,lost")
      .eq("account_id", id),
    getAccountSellingData(
      supabase,
      id,
      (account.container_preference || "any") as AccountContainerPreference,
    ),
  ]);
  const territory = Array.isArray(account.territory)
    ? account.territory[0]
    : account.territory;
  const contacts = [...(account.contacts || [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return (a.brewery_contact_slot || 99) - (b.brewery_contact_slot || 99);
  });
  const primary = contacts.find((c) => c.is_primary) || contacts[0];
  const phone =
      primary?.phone || primary?.mobile || account.phone || account.mobile,
    email = primary?.email || account.email;
  const address = [
      account.address_line_1,
      account.address_line_2,
      account.town,
      account.county,
      account.postcode,
    ]
      .filter(Boolean)
      .join(", "),
    mapHref = address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : null;
  const upcoming = (appointments || [])
      .filter(
        (a) => a.status === "planned" && new Date(a.starts_at) >= new Date(),
      )
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      )
      .slice(0, 5),
    openTasks = (tasks || [])
      .filter((t) => t.status === "open")
      .sort((a, b) => (a.due_at || "9999").localeCompare(b.due_at || "9999"))
      .slice(0, 10);
  const sales = (salesRows || [])[0] || {
      order_count: 0,
      revenue: 0,
      average_order: 0,
      last_order: null,
    },
    latestOrder = (latestOrderRows || [])[0]?.last_order_date,
    imported =
      Number(sales.order_count) > 0 ? [{ order_date: latestOrder }] : [],
    revenue = Number(sales.revenue),
    avg = Number(sales.average_order),
    containerRows = containers || [],
    active = containerRows.filter((c) => !c.lost),
    oldest = active.reduce(
      (m, c) => Math.max(m, Number(c.off_site_days || 0)),
      0,
    ),
    over60 = active.filter((c) => Number(c.off_site_days || 0) > 60).length;
  const oneWayOnly = account.container_preference === "one_way_only";
  const pricedSelling = selling.rows.filter(
    (row) => (row.customerPrice ?? row.listPrice) != null,
  );
  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-10">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <Link href="/accounts" className="text-sm font-medium text-slate-500">
            ← Accounts
          </Link>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {account.name}
                </h1>
                <StatusBadge status={account.relationship_status} />
                {oneWayOnly ? (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">
                    ONE-WAY ONLY
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {[
                  account.classification,
                  territory?.name || account.brewery_location_zone,
                  account.town,
                  account.postcode,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {primary ? (
                <p className="mt-2 text-sm">
                  <span className="font-semibold">
                    {primary.full_name || "Primary contact"}
                  </span>
                  {primary.job_title ? ` · ${primary.job_title}` : ""}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <AccountContactAction
                accountId={id}
                type="call"
                target={phone || null}
                label="Call"
              />
              <AccountContactAction
                accountId={id}
                type="email"
                target={email || null}
                label="Email"
              />
              <Link
                href={`/accounts/${id}/visit`}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white"
              >
                Log visit
              </Link>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-5xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          {account.brewery_ops_reference ? (
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Brewery Ops reference
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold tracking-wide">
                    {account.brewery_ops_reference}
                  </p>
                </div>
                <CopyTextButton value={account.brewery_ops_reference} />
              </div>
              {!account.brewery_customer_id ? (
                <p className="mt-3 text-sm text-blue-800">
                  When creating this customer in ViewPlan, enter this exact value
                  in External Ref ID before the next customer import.
                </p>
              ) : (
                <p className="mt-3 text-sm text-blue-800">
                  This Account is now linked to ViewPlan customer {account.brewery_customer_id}.
                </p>
              )}
            </section>
          ) : null}
          <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-300">
              What can I sell them?
            </p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-semibold">{pricedSelling.length}</p>
                <p className="text-sm text-slate-300">
                  priced variants available
                  {selling.observedAt
                    ? ` · checked ${relativeTime(selling.observedAt)}`
                    : ""}
                </p>
              </div>
              <Link
                href={`/accounts/${id}/availability`}
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950"
              >
                View & select
              </Link>
            </div>
            {selling.lastRefreshError && selling.rows.length ? (
              <p className="mt-3 text-xs text-amber-200">
                Showing last known availability; refresh failed.
              </p>
            ) : null}
          </section>
          <Section title="Who are they?">
            <div className="grid gap-4 sm:grid-cols-2">
              <Info label="Address" value={formatAddress(account)} multiline />
              <Info
                label="Territory"
                value={territory?.name || account.brewery_location_zone || "—"}
              />
              <Info
                label="Phone"
                value={phone || "—"}
                href={phone ? `tel:${phone}` : undefined}
              />
              <Info
                label="Email"
                value={email || "—"}
                href={email ? `mailto:${email}` : undefined}
              />
              <Info
                label="Website"
                value={account.website || "—"}
                href={normaliseUrl(account.website)}
              />
              <Info
                label="Packaging"
                value={oneWayOnly ? "One-way only" : "Any packaging"}
              />
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <Link
                href={`/accounts/${id}/contacts`}
                className="text-sm font-semibold"
              >
                Manage {contacts.length || ""} contacts
              </Link>
              <Link
                href={`/accounts/${id}/status`}
                className="text-sm font-semibold text-slate-500"
              >
                Account settings
              </Link>
            </div>
          </Section>
          <Section title="Timeline">
            <AccountTimeline
              interactions={interactions || []}
              visits={visits || []}
              appointments={appointments || []}
              tasks={tasks || []}
              notes={notes || []}
            />
          </Section>
        </div>
        <div className="space-y-4">
          <Section title="What matters now">
            <div className="space-y-3">
              {upcoming[0] ? (
                <Link
                  href={`/appointments/${upcoming[0].id}`}
                  className="block rounded-xl bg-slate-50 p-3"
                >
                  <p className="text-xs text-slate-500">Next appointment</p>
                  <p className="font-semibold">
                    {upcoming[0].purpose || "Sales visit"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(upcoming[0].starts_at)}
                  </p>
                </Link>
              ) : null}
              {openTasks[0] ? (
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Next follow-up</p>
                  <p className="font-semibold">{openTasks[0].title}</p>
                  <p className="text-xs text-slate-500">
                    Due {formatDateTime(openTasks[0].due_at)}
                  </p>
                </div>
              ) : null}
              <DateRow label="Latest order" value={latestOrder} />
              {!upcoming.length && !openTasks.length ? (
                <p className="text-sm text-slate-500">
                  No open follow-up or appointment.
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Link
                href={`/accounts/${id}/interaction`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
              >
                Record contact
              </Link>
              <Link
                href={`/accounts/${id}/appointment`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
              >
                Appointment
              </Link>
              <Link
                href={`/accounts/${id}/note`}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
              >
                Add note
              </Link>
              <a
                href={mapHref || undefined}
                target={mapHref ? "_blank" : undefined}
                rel={mapHref ? "noreferrer" : undefined}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
              >
                Location
              </a>
            </div>
          </Section>
          {imported.length ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {salesYear} sales
                </h2>
                <Link
                  href={`/accounts/${id}/sales`}
                  className="text-xs font-semibold hover:underline"
                >
                  View sales →
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Metric label="Sales" value={formatCurrency(revenue)} />
                <Metric label="Orders" value={String(sales.order_count)} />
                <Metric label="Average" value={formatCurrency(avg)} />
              </div>
            </section>
          ) : null}
          {containerRows.length ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Containers on site
                  </h2>
                  <p className="mt-2 text-2xl font-semibold">{active.length}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Oldest {active.length ? `${oldest} days` : "—"}
                    {over60 ? ` · ${over60} over 60 days` : ""}
                  </p>
                </div>
                <Link
                  href={`/accounts/${id}/containers`}
                  className="text-xs font-semibold hover:underline"
                >
                  View containers →
                </Link>
              </div>
            </section>
          ) : null}
          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              More selling tools
            </p>
            <div className="mt-3 flex gap-3 text-sm font-semibold">
              <Link href={`/accounts/${id}/price-list`}>Price list</Link>
              <Link href={`/accounts/${id}/quick-price-email`}>
                Email all availability
              </Link>
            </div>
          </section>
        </div>
      </main>
      <BottomNav active="Accounts" />
    </div>
  );
}
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
        {title}
      </h2>
      {children}
    </section>
  );
}
function Info({
  label,
  value,
  href,
  multiline = false,
}: {
  label: string;
  value: string;
  href?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      {href ? (
        <a
          href={href}
          target={href.startsWith("http") ? "_blank" : undefined}
          rel={href.startsWith("http") ? "noreferrer" : undefined}
          className={`mt-1 block font-medium hover:underline ${multiline ? "whitespace-pre-line" : "truncate"}`}
        >
          {value}
        </a>
      ) : (
        <p
          className={`mt-1 font-medium ${multiline ? "whitespace-pre-line" : ""}`}
        >
          {value}
        </p>
      )}
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
function DateRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{formatDate(value)}</span>
    </div>
  );
}
function StatusBadge({ status }: { status: string | null }) {
  const s: Record<string, string> = {
    current: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    cooling: "bg-amber-50 text-amber-700 ring-amber-600/20",
    lapsed: "bg-orange-50 text-orange-700 ring-orange-600/20",
    dormant: "bg-slate-100 text-slate-600 ring-slate-500/20",
    prospect: "bg-blue-50 text-blue-700 ring-blue-600/20",
    closed: "bg-rose-50 text-rose-700 ring-rose-600/20",
  };
  const k = status || "dormant";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset ${s[k] || s.dormant}`}
    >
      {k}
    </span>
  );
}
function formatAddress(a: {
  address_line_1?: string | null;
  address_line_2?: string | null;
  town?: string | null;
  county?: string | null;
  postcode?: string | null;
}) {
  return (
    [a.address_line_1, a.address_line_2, a.town, a.county, a.postcode]
      .filter(Boolean)
      .join("\n") || "—"
  );
}
function formatDate(v?: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${v.slice(0, 10)}T00:00:00`));
}
function formatDateTime(v?: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
}
function formatCurrency(v?: number | null) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(v);
}
function normaliseUrl(v?: string | null) {
  if (!v) return undefined;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
function relativeTime(value: string) {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60000),
  );
  return minutes < 1
    ? "just now"
    : minutes < 60
      ? `${minutes}m ago`
      : `${Math.round(minutes / 60)}h ago`;
}
