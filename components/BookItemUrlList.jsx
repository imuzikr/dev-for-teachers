import { bookItemUrlHref } from "@/lib/bookItemUrls";

export default function BookItemUrlList({ urls }) {
  const links = (Array.isArray(urls) ? urls : [])
    .map((url) => ({ url, href: bookItemUrlHref(url) }))
    .filter(({ href }) => href);
  if (!links.length) return null;

  return (
    <div className="book-item-url-list" role="group" aria-label="저장한 URL">
      {links.map(({ url, href }, index) => (
        <a className="book-project-resource-link book-item-url-link" key={`${index}:${href}`} href={href} target="_blank" rel="noopener noreferrer">
          <span>URL {index + 1}</span>
          <strong>{url.trim()}</strong>
        </a>
      ))}
    </div>
  );
}
