import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {errorMessage,syncSellarAvailability} from "../src/lib/sellar-availability-sync.mjs";

loadEnvFile(path.resolve(".env.local"));
try{
 const result=await syncSellarAvailability({supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY,sellarToken:process.env.SELLAR_API_TOKEN,sellarBaseUrl:process.env.SELLAR_API_BASE_URL});
 console.log(`Canonical availability updated: ${result.variants} variants; ${result.products} products; ${result.skipped} skipped.`);
}catch(error){console.error(errorMessage(error));process.exitCode=1;}

function loadEnvFile(file){if(!fs.existsSync(file))return;for(const line of fs.readFileSync(file,"utf8").split(/\r?\n/)){const value=line.trim();if(!value||value.startsWith("#"))continue;const at=value.indexOf("=");if(at<1)continue;const name=value.slice(0,at).trim();let content=value.slice(at+1).trim();if((content.startsWith('"')&&content.endsWith('"'))||(content.startsWith("'")&&content.endsWith("'")))content=content.slice(1,-1);if(!(name in process.env))process.env[name]=content;}}
