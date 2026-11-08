import { Fragment, type ReactNode } from "react";

/**
 * Minimal, safe Markdown renderer for course text: headings (##/###), bullet
 * and numbered lists, tables, **bold**, paragraphs. Everything is rendered as
 * React text nodes, so content can never inject HTML.
 */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

export default function Md({ text, className = "" }: { text: string; className?: string }) {
  const lines = (text ?? "").split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("### ") || line.startsWith("## ") || line.startsWith("# ")) {
      const level = line.startsWith("### ") ? 3 : line.startsWith("## ") ? 2 : 1;
      const content = line.replace(/^#+\s/, "");
      blocks.push(
        level === 1 ? (
          <h2 key={i} className="mt-4 text-xl font-bold text-ink">{inline(content)}</h2>
        ) : level === 2 ? (
          <h3 key={i} className="mt-4 text-lg font-bold text-ink">{inline(content)}</h3>
        ) : (
          <h4 key={i} className="mt-3 font-semibold text-ink">{inline(content)}</h4>
        ),
      );
      i++;
      continue;
    }
    if (/^\s*[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*] /, ""));
      blocks.push(
        <ul key={`ul${i}`} className="my-2 list-disc space-y-1 ps-6">
          {items.map((item, k) => <li key={k}>{inline(item)}</li>)}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\. /, ""));
      blocks.push(
        <ol key={`ol${i}`} className="my-2 list-decimal space-y-1 ps-6">
          {items.map((item, k) => <li key={k}>{inline(item)}</li>)}
        </ol>,
      );
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={`t${i}`} className="my-3 overflow-x-auto">
          <table className="md-table text-sm">
            <thead><tr>{head?.map((c, k) => <th key={k} className="bg-surface">{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\s*[-*] |\s*\d+\. |\s*\|)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={`p${i}`} className="my-2 leading-7">{inline(para.join(" "))}</p>);
  }
  return <div className={`text-body ${className}`}>{blocks}</div>;
}
