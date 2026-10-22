// @vitest-environment jsdom
import DOMPurify from "dompurify";
import { renderMarkdown } from "pages/markdownPreview/renderer";
import { describe, expect, it } from "vitest";

describe("updated preview dependency compatibility", () => {
	// Happy DOM's NodeIterator skips siblings after current-node removal. Use
	// jsdom for DOMPurify's mutation-heavy traversal; this is not a WebView test.
	it("removes active HTML and unsafe URLs using the preview sanitizer options", async () => {
		const { html } = await renderMarkdown(
			'<script>dummy()</script><style>body{display:none}</style><img src="x" onerror="dummy()"><a href="javascript:dummy()">Link</a>',
		);
		const clean = DOMPurify.sanitize(html, {
			FORBID_TAGS: ["style"],
			ADD_TAGS: ["eq", "eqn"],
		});
		const container = document.createElement("div");
		container.innerHTML = clean;
		expect(container.querySelector("script, style, [onerror]")).toBeNull();
		expect(container.querySelector("a").hasAttribute("href")).toBe(false);
	});

	it("retains headings, relative links, tasks, code fences and inline math", async () => {
		const { html } = await renderMarkdown(
			"# Example\n\n[Next](next.md)\n\n- [x] done\n\n```js\nconst answer = 42;\n```\n\n$x^{2}$",
			{ uri: "file:///dummy/docs/readme.md" },
		);
		expect(html).toContain('id="example"');
		expect(html).toContain('data-resolved-href="file:///dummy/docs/next.md"');
		expect(html).toContain('type="checkbox"');
		expect(html).toContain('class="language-js"');
		expect(html).toContain('class="katex"');
	});

	it("keeps Mermaid fences inert until strict diagram parsing", async () => {
		const { html } = await renderMarkdown(
			"```mermaid\nflowchart TD\n  A --> B\n```",
		);
		expect(html).toContain('class="mermaid"');
		const { default: mermaid } = await import("mermaid");
		mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
		expect(await mermaid.parse("flowchart TD\n A --> B")).toMatchObject({
			diagramType: "flowchart-v2",
		});
	});
});
