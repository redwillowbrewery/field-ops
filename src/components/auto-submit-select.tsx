"use client";

type Option = { value: string; label: string };

export function AutoSubmitSelect({
  name,
  value,
  label,
  options,
}: {
  name: string;
  value: string;
  label: string;
  options: Option[];
}) {
  return (
    <select
      name={name}
      value={value}
      aria-label={label}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className="h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
