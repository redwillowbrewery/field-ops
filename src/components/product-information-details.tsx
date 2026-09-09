import type {ProductInformation} from "@/lib/product-information";
export function ProductInformationDetails({information}:{information?:ProductInformation}){
 const info=information;
 const vegan=info?.vegan===true?"Vegan":info?.vegan===false?"Not vegan":"Vegan status unconfirmed";
 const fining=info?.fining_status==="unfined"?"Unfined":info?.fining_status==="fined"?"Fined":"Fining status unconfirmed";
 return <div className="mt-2 space-y-1 text-xs font-normal text-slate-600">
  <p><span className="font-semibold">Allergens:</span> {info?.allergens||"Not confirmed — please ask Sales"}</p>
  <p>{vegan} · {fining}</p>
  <p>Gluten-free: {info?.gluten_free===true?"Yes":info?.gluten_free===false?"No":"Not confirmed"} · Lactose-free: {info?.lactose_free===true?"Yes":info?.lactose_free===false?"No":"Not confirmed"}</p>
 </div>;
}
