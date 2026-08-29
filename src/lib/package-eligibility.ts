export type AccountContainerPreference="any"|"one_way_only";
export type PackageLifecycle="brewery_returnable"|"third_party_returnable"|"one_way"|"non_container";

export type CanonicalPackage={
 id:string;
 name:string;
 broad_format:"cask"|"keg"|"can"|"bottle"|"other";
 package_system:string|null;
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
 if(pkg.package_system==="Steel"&&pkg.broad_format==="keg")return pkg.name.replace(/\s*Litre\s*/i,"L ").replace(/\s+Keg$/i," Keg");
 if(pkg.package_system==="Firkin")return"Cask";
 return pkg.package_system||pkg.name||fallback.trim();
}
