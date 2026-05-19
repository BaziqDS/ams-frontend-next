import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openuiChatLibrary, openuiChatPromptOptions } from "@openuidev/react-ui/genui-lib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prompt = openuiChatLibrary.prompt({
  ...openuiChatPromptOptions,
  additionalRules: [
    ...(openuiChatPromptOptions.additionalRules ?? []),
    "Prefer compact card, stack, tag, and table layouts that read well inside a narrow side panel.",
    "Prefer the chat-safe subset of components. Do not switch to larger dashboard or full-screen layouts.",
    "Always assign a single `root = ...` expression and keep the output self-contained.",
    "When prose needs bold text, bullets, numbered lists, or other markdown formatting, use MarkDownRenderer instead of putting raw markdown in TextContent.",
    "Do not place literal markdown markers such as **, *, -, or # inside TextContent. Use MarkDownRenderer for prose, ListBlock/ListItem for lists, Table/Col for records, and TagBlock/Tag for statuses.",
    "For formatted explanations, prefer MarkDownRenderer with concise markdown. For factual item lists, prefer ListBlock/ListItem or Table/Col over markdown bullets.",
    "Keep side-panel tables narrow: use at most 4 columns. If the data has more fields, use ListBlock/ListItem, SectionBlock/SectionItem, or split into multiple cards.",
    "Use FollowUpBlock/FollowUpItem for related queries, not plain text rows or generic buttons.",
    "Do not invent counts, names, thresholds, or statuses. Only use values grounded in the SQL answer provided to you.",
    "Do not emit Query(), Mutation(), bindings, or actions for this first AMS chat integration.",
  ],
});

const outputPath = path.resolve(__dirname, "../src/generated/openui-system-prompt.txt");
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, prompt, "utf8");

console.log(`OpenUI prompt exported to ${outputPath}`);
