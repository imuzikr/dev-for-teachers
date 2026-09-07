const VARIABLE = /\{\{([^{}\r\n]{1,80})\}\}/g;

export function templateFields(text) {
  return [...new Set([...text.matchAll(VARIABLE)].map((match) => match[1].trim()).filter(Boolean))];
}

export function fillTemplate(text, values) {
  return text.replace(VARIABLE, (token, name) => {
    const key = name.trim();
    return Object.hasOwn(values, key) && values[key].trim() ? values[key] : token;
  });
}

export function templatePlainText(html) {
  if (!/<\/?(?:b|strong|i|em|u|span|ul|ol|li|br|div|p|pre|code|img|script|style)\b/i.test(html)) return html;
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, img").forEach((node) => node.remove());
  doc.querySelectorAll("li").forEach((node) => {
    const ordered = node.parentElement?.tagName === "OL";
    const index = ordered ? [...node.parentElement.children].indexOf(node) + 1 : 0;
    node.prepend(doc.createTextNode(ordered ? `${index}. ` : "- "));
  });
  doc.querySelectorAll("br").forEach((node) => node.replaceWith(doc.createTextNode("\n")));
  doc.querySelectorAll("p, div, li, pre").forEach((node) => node.append(doc.createTextNode("\n")));
  return doc.body.textContent.replace(/\u00a0/g, " ").trim();
}
