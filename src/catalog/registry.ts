"use client";

import { createElement } from "react";
import { CatalogItemSchema, type CatalogItem } from "./schema";
import { Say } from "./Say";
import { Fallback } from "./Fallback";
import { Part } from "./Part";
import { Card, type CardActions } from "./Card";
import { Notice } from "./Notice";
import { Ask, type AskProps } from "./Ask";
import { Act, type ActProps } from "./Act";
import { Status, type StatusProps } from "./Status";

/** Trusted local behavior is supplied separately from untrusted generated props. */
export interface CatalogHandlers extends CardActions {
  onChoose?: AskProps["onChoose"];
  onOpen?: ActProps["onOpen"];
  onStop?: StatusProps["onStop"];
}

export const catalog = Object.freeze({ Say, Part, Card, Notice, Ask, Act, Status, Fallback });

export function parseCatalogItem(input: unknown): CatalogItem {
  const parsed = CatalogItemSchema.safeParse(input);
  return parsed.success ? parsed.data : { type: "Fallback", props: {} };
}

export function CatalogRenderer({ item, handlers = {} }: { item: unknown; handlers?: CatalogHandlers }) {
  const parsed = parseCatalogItem(item);
  switch (parsed.type) {
    case "Say": return createElement(Say, parsed.props);
    case "Part": return createElement(Part, parsed.props);
    case "Card": return createElement(Card, { ...parsed.props, onApprove: handlers.onApprove, onAlternative: handlers.onAlternative, onEdit: handlers.onEdit, onUndo: handlers.onUndo, onSource: handlers.onSource });
    case "Notice": return createElement(Notice, parsed.props);
    case "Ask": return createElement(Ask, { ...parsed.props, onChoose: handlers.onChoose });
    case "Act": return createElement(Act, { ...parsed.props, onOpen: handlers.onOpen });
    case "Status": return createElement(Status, { ...parsed.props, onStop: handlers.onStop });
    case "Fallback": return createElement(Fallback, parsed.props);
  }
}
