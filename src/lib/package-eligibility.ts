export type AccountContainerPreference="any"|"one_way_only";
export type PackageLifecycle="brewery_returnable"|"third_party_returnable"|"one_way"|"non_container";

export type CanonicalPackage={
 id:string;
 name:string;
 broad_format:"cask"|"keg"|"can"|"bottle"|"other";
 package_system:string|null;
 capacity_litres?:number|string|null;
 lifecycle:PackageLifecycle;
 procurement_mode:"consumable"|"reusable_asset"|"externally_supplied"|"none";
};

export function packageAllowedForAccount(pkg:CanonicalPackage|null|undefined,preference:AccountContainerPreference){
 if(!pkg)return false;
 if(preference==="any")return true;
 return pkg.lifecycle==="one_way"||pkg.lifecycle==="non_container";
}

export function packageSalesLabel(pkg:CanonicalPackage|null|undefined,fallback:string){
 if(!pkg)return fallback.trim();
 const capacity=Number(pkg.capacity_litres);
 if(pkg.broad_format==="keg"&&Number.isFinite(capacity)&&capacity>0){
  return `${capacity}L ${pkg.package_system==="Steel"?"Keg":pkg.package_system||pkg.name}`;
 }
 return pkg.name||pkg.package_system||fallback.trim();
}