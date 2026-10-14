import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { Card } from "../src/catalog/Card";

it("Card mantiene como texto el markup con anidamiento inválido para no romper la hidratación", () => {
  const html = renderToString(createElement(Card, { card: {
    id: "ssr-test", agent: "airi", level: "auto", state: "ready", title: "Mensaje",
    body: "<p><div>Mensaje</div></p>",
  } }));
  expect(html).toContain("&lt;p&gt;&lt;div&gt;Mensaje&lt;/div&gt;&lt;/p&gt;");
});
