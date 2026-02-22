export function openInNewTab(href: string) {
	Object.assign(document.createElement("a"), {
		target: "_blank",
		rel: "noopener noreferrer",
		href: href,
	}).click();
}
