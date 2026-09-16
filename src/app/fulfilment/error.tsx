"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="p-10 pt-24"><h1 className="text-2xl font-semibold">Unable to load fulfilment</h1><p>No orders or plans have been changed. Check the connection and pilot migration.</p><button onClick={reset} className="mt-4 rounded border p-3">Try again</button></main>;}
