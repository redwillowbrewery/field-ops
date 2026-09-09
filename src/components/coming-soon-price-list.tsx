import {ProductInformationDetails} from "@/components/product-information-details";
import type {ComingSoonResult} from "@/lib/coming-soon";
import {allowedPriceListImage} from "@/lib/price-list-policy";

const dateLabel=(date:string|null)=>date?"Estimated packaging "+new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z")):"Timing to be confirmed";
export function ComingSoonPriceList({comingSoon,format="all"}:{comingSoon:ComingSoonResult;format?:string}){
 const items=comingSoon.items.map(item=>({...item,packages:item.packages.filter(p=>format==="all"||p.broadFormat===format)})).filter(item=>format==="all"||item.packages.length);
 return <section aria-labelledby="coming-soon-heading" className="mt-10">
  <h2 id="coming-soon-heading" className="text-2xl font-semibold">Coming soon</h2>
  <p className="mt-2 text-sm text-slate-600">Beers currently in tank. Dates are provisional packaging estimates; these beers are not yet ready to dispatch. Contact Sales to discuss your requirements.</p>
  {comingSoon.status==="unavailable"?<p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Upcoming beers are being confirmed. Please contact Sales for the latest plans.</p>:<>
   {comingSoon.observedAt&&<p className="mt-2 text-xs text-slate-500">Plans checked {new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/London"}).format(new Date(comingSoon.observedAt))} (UK time).</p>}
   <div className="mt-4 space-y-4">{items.map(item=>{
    const image=allowedPriceListImage(item.imageUrl);
    return <article key={item.productId} className="break-inside-avoid rounded-2xl border border-amber-200 bg-white p-4 sm:p-5">
     <div className="flex items-start gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image&&<img src={image} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover"/>}
      <div className="min-w-0"><span className="text-xs font-semibold uppercase tracking-wide text-amber-800">In tank · coming soon</span><h3 className="mt-1 text-lg font-semibold">{item.productName}</h3>{item.abv!=null&&<p className="text-sm text-slate-500">{item.abv}% ABV</p>}{item.description&&<p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>}</div>
     </div>
     {!item.packages.length?<p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">Packaging and dietary details to be confirmed · {dateLabel(item.estimatedDate)}</p>:
      <div className="mt-4 border-t border-slate-100">{item.packages.map(pkg=><div key={pkg.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-50 py-2.5 text-sm"><div>{pkg.label}<p className="mt-1 text-xs text-amber-800">{dateLabel(pkg.estimatedDate)} · provisional</p><ProductInformationDetails information={pkg.information}/></div><span className="text-right font-semibold">{pkg.price==null?"Ask for price":new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(pkg.price)}</span></div>)}</div>}
    </article>;
   })}</div>
   {!items.length&&<p className="mt-4 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">No upcoming beers to show for this selection. Please contact Sales for future releases.</p>}
  </>}
 </section>;
}
