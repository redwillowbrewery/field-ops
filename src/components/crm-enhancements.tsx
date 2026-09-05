"use client";

import {useEffect} from "react";
import {usePathname,useRouter} from "next/navigation";

export function CRMEnhancements(){
 const pathname=usePathname();const router=useRouter();
 useEffect(()=>{
  if(pathname!=="/accounts")return;const input=document.querySelector<HTMLInputElement>('input[name="q"]');if(!input)return;let timer:ReturnType<typeof setTimeout>|null=null;const onInput=()=>{if(timer)clearTimeout(timer);timer=setTimeout(()=>{const params=new URLSearchParams(window.location.search);const value=input.value.trim();if(value)params.set("q",value);else params.delete("q");router.replace(`/accounts${params.toString()?`?${params.toString()}`:""}`,{scroll:false});},250);};input.addEventListener("input",onInput);return()=>{if(timer)clearTimeout(timer);input.removeEventListener("input",onInput);};
 },[pathname,router]);
 return null;
}
