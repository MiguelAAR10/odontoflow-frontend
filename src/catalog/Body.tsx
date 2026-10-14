import { createElement, type ReactNode } from "react";

interface Node { tag: string; children: Array<Node | string>; className?: string }
const tags = new Set(["ul", "ol", "li", "span", "div", "p", "b", "strong", "em", "i", "br", "textarea"]);
const classes = new Set(["ac-list", "muted", "money", "bars", "bar", "n", "legend", "small"]);
const phrasing = new Set(["p", "span", "b", "strong", "em", "i"]);
const blocks = new Set(["ul", "ol", "li", "div", "p"]);

function decode(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
    if (!code.startsWith("#")) return named[code.toLowerCase()] ?? entity;
    const value = code.toLowerCase().startsWith("#x") ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
  });
}

/** A tiny display grammar for backend fixtures. No HTML injection, URLs, styles or event attributes. */
function parse(body: string): Node | null {
  const root: Node = { tag: "div", children: [] };
  const stack = [root];
  const tokens = body.match(/<[^>]*>|[^<]+|</g) ?? [];
  for (const token of tokens) {
    const parent = stack.at(-1)!;
    if (!token.startsWith("<")) {
      if ((parent.tag === "ul" || parent.tag === "ol") && token.trim()) return null;
      parent.children.push(decode(token));
      continue;
    }
    const match = /^<(\/?)([a-z]+)\b[^>]*>$/i.exec(token);
    if (!match || !tags.has(match[2]!.toLowerCase())) return null;
    const tag = match[2]!.toLowerCase();
    if (match[1]) {
      if (stack.length === 1 || parent.tag !== tag) return null;
      stack.pop();
    } else {
      if (parent.tag === "textarea" || (phrasing.has(parent.tag) && blocks.has(tag))) return null;
      if (tag === "li" && parent.tag !== "ul" && parent.tag !== "ol") return null;
      if ((parent.tag === "ul" || parent.tag === "ol") && tag !== "li") return null;
      const permitted = /\bclass=["']([^"']*)["']/i.exec(token)?.[1]?.split(/\s+/).filter(name => classes.has(name));
      const node: Node = { tag, children: [], className: permitted?.map(name => `catalog-body-${name}`).join(" ") };
      parent.children.push(node);
      if (tag !== "br") stack.push(node);
      if (stack.length > 24) return null;
    }
  }
  return stack.length === 1 ? root : null;
}

function plain(node: Node): string {
  return node.children.map(child => typeof child === "string" ? child : plain(child)).join("");
}

function render(node: Node, key: number): ReactNode {
  if (node.tag === "textarea") return <textarea key={key} className="catalog-message" aria-label="Mensaje propuesto" value={plain(node)} readOnly />;
  return createElement(node.tag, { key, className: node.className }, ...(node.tag === "br" ? [] : node.children.map((child, index) => typeof child === "string" ? child : render(child, index))));
}

export function Body({ body }: { body: string }) {
  const tree = parse(body);
  return <div className="catalog-body">{tree ? tree.children.map((child, index) => typeof child === "string" ? child : render(child, index)) : body}</div>;
}
