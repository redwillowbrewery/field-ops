"use client";
import {useEffect,useState} from "react";
export function ProductDraftGuard(){
 const [message,setMessage]=useState("");
 useEffect(()=>{
  const form=document.querySelector<HTMLFormElement>("form[data-product-draft]");
  if(!form)return;
  let dirty=false;
  const changed=()=>{dirty=true;setMessage("");};
  const leaving=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue="";}};
  const submitting=(event:SubmitEvent)=>{
   if(event.target===form){dirty=false;return;}
   if(dirty){event.preventDefault();event.stopImmediatePropagation();setMessage("Save your Product draft before using another action on this page.");form.scrollIntoView({behavior:"smooth",block:"start"});}
  };
  const navigating=(event:MouseEvent)=>{
   const link=event.target instanceof Element?event.target.closest('a[href]'):null;
   if(dirty&&link instanceof HTMLAnchorElement&&link.target!=="_blank"&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey){event.preventDefault();event.stopImmediatePropagation();setMessage("Save your Product draft before leaving this page.");form.scrollIntoView({behavior:"smooth",block:"start"});}
  };
  document.addEventListener("click",navigating,true);
  form.addEventListener("input",changed);form.addEventListener("change",changed);
  document.addEventListener("submit",submitting,true);window.addEventListener("beforeunload",leaving);
  return()=>{document.removeEventListener("click",navigating,true);form.removeEventListener("input",changed);form.removeEventListener("change",changed);document.removeEventListener("submit",submitting,true);window.removeEventListener("beforeunload",leaving);};
 },[]);
 return message?<p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900">{message}</p>:null;
}
