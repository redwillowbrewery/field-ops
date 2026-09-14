import {spawnSync} from 'node:child_process';
for(const name of ['product-source','product-workspace','take-off','live-price-lists','account-commercial','connector-health']){
 const result=spawnSync(process.execPath,['scripts/test-'+name+'-db.mjs'],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status||1);
}
