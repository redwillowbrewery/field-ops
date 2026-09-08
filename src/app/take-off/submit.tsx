"use client";
import {useFormStatus} from "react-dom";
export function Submit({children}:{children:React.ReactNode}){const {pending}=useFormStatus();return <button disabled={pending} className="rounded-lg bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50">{pending?"Saving…":children}</button>;}
