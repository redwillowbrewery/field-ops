"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";

export function SmartBackLink({href,children,className}:{href:string;children:React.ReactNode;className?:string}){
 const router=useRouter();
 function onClick(event:React.MouseEvent<HTMLAnchorElement>){
  if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  if(typeof window!=="undefined"&&window.history.length>1){
   event.preventDefault();
   router.back();
  }
 }
 return <Link href={href} onClick={onClick} className={className}>{children}</Link>;
}
