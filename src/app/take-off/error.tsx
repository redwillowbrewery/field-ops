"use client";
export default function Error({reset}:{reset:()=>void}){return <main className="mx-auto max-w-xl p-8"><h1 className="text-xl font-semibold">Take Off is temporarily unavailable</h1><p className="my-4">Check the database migration and connector status, then try again.</p><button onClick={reset}>Try again</button><p><a href="/sales">Back to Sales</a></p></main>;}
