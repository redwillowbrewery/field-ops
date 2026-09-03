import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getCurrentSalesCatalogue } from "@/lib/products";
import { saveWeeklySalesPlan } from "../actions";

type PlanTerritory = { territory_id: string };
type PlanProduct = { product_id: string };

export default async function EditWeeklySalesPlanPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [{ data: territories }, products, planResult] = await Promise.all([
    supabase.from("territories").select("id,name").order("name"),
    getCurrentSalesCatalogue(supabase),
    id ? supabase.from("weekly_sales_plans").select("id,week_start,title,message,status,territories:weekly_sales_plan_territories(territory_id),products:weekly_sales_plan_products(product_id)").eq("id", id).single() : Promise.resolve({ data: null, error: null }),
  ]);
  if (planResult.error) throw new Error(planResult.error.message);
  const plan = planResult.data;
  const selectedTerritories = new Set(((plan?.territories || []) as PlanTerritory[]).map((row) => row.territory_id));
  const selectedProducts = new Set(((plan?.products || []) as PlanProduct[]).map((row) => row.product_id));

  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-3xl px-4 py-5 sm:px-6"><Link href="/sales" className="text-sm font-semibold text-slate-500">← Sales home</Link><h1 className="mt-2 text-2xl font-semibold tracking-tight">{plan ? "Edit weekly focus" : "Plan a sales week"}</h1><p className="mt-1 text-sm text-slate-500">Set the message, products and areas Sales will work.</p></div></header>
    <main className="mx-auto max-w-3xl px-4 py-5 sm:px-6"><form action={saveWeeklySalesPlan} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      {plan && <input type="hidden" name="plan_id" value={plan.id}/>}<div className="grid gap-4 sm:grid-cols-2"><Field label="Week starting"><input required name="week_start" type="date" defaultValue={plan?.week_start || nextMonday()} className={inputClass}/></Field><Field label="Plan state"><select name="status" defaultValue={plan?.status || "active"} className={inputClass}><option value="draft">Draft</option><option value="active">Active</option><option value="closed">Closed</option></select></Field></div>
      <Field label="Focus title"><input required maxLength={100} name="title" defaultValue={plan?.title || ""} placeholder="Fresh pale ales for early autumn" className={inputClass}/></Field>
      <Field label="Commercial message"><textarea name="message" maxLength={1000} rows={4} defaultValue={plan?.message || ""} placeholder="What should the team lead with this week?" className={`${inputClass} h-auto py-3`}/></Field>
      <ChoiceGroup title="Areas" hint="Required. These define the bounded initial-push list.">{(territories || []).map((territory) => <Check key={territory.id} name="territory_ids" value={territory.id} label={territory.name} checked={selectedTerritories.has(territory.id)}/>)}</ChoiceGroup>
      <ChoiceGroup title="Products / specials" hint="Current RedWillow catalogue. Live package, price and availability facts are not copied into this plan.">{products.map((product) => <Check key={product.id} name="product_ids" value={product.id} label={product.name} checked={selectedProducts.has(product.id)}/>)}</ChoiceGroup>
      <div className="sticky bottom-0 -mx-4 flex justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:p-0 sm:pt-2"><Link href="/sales" className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-slate-600">Cancel</Link><button className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white">Save weekly plan</button></div>
    </form></main>
  </div>;
}

const inputClass = "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-600";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>; }
function ChoiceGroup({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) { return <fieldset><legend className="text-sm font-semibold">{title}</legend><p className="mt-1 text-xs text-slate-500">{hint}</p><div className="mt-3 grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2">{children}</div></fieldset>; }
function Check({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) { return <label className="flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm hover:bg-slate-50"><input type="checkbox" name={name} value={value} defaultChecked={checked} className="h-4 w-4"/><span>{label}</span></label>; }
function nextMonday() { const date = new Date(); const days = (8 - date.getDay()) % 7 || 7; date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }

