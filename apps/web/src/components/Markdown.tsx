import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Assistant answers arrive as markdown, so they are parsed rather than printed.
 *
 * react-markdown builds React elements and does not render raw HTML unless a
 * rehype-raw plugin is added — which it deliberately is not. The content here
 * is model output derived from third-party market data, so it is never trusted
 * enough to reach innerHTML.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Links open away from the app and must not carry it along.
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer nofollow" />
          ),
          // A table in a 30rem panel needs its own scroll, not the page's.
          table: ({ node: _node, ...props }) => (
            <div className="md-table-wrap">
              <table {...props} />
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
