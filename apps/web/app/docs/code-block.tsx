const tokenPattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:import|from|const|new|await|if|throw|process|console|return)\b|\b(?:POST|GET|Authorization|Content-Type|Idempotency-Key|Bearer)\b|\b\d+(?:\.\d+)?\b|[{}()[\],.:;])/g;

function tokenClass(token: string) {
  if (/^["']/.test(token)) return "code-string";
  if (/^(import|from|const|new|await|if|throw|process|console|return)$/.test(token)) return "code-keyword";
  if (/^(POST|GET|Authorization|Content-Type|Idempotency-Key|Bearer)$/.test(token)) return "code-method";
  if (/^\d/.test(token)) return "code-number";
  if (/^[{}()[\],.:;]$/.test(token)) return "code-punctuation";
  return "";
}

export function Code({ children }: { children: string }) {
  const language = children.includes("import {") ? "TYPESCRIPT" : children.includes("POST /") || children.includes("Authorization:") ? "HTTP" : "JSON";
  return <div className="docs-code-wrap"><div className="docs-code-head"><span><i/><i/><i/></span><strong>{language}</strong></div><pre className="docs-code"><code>{children.split(tokenPattern).map((part, index) => <span className={tokenClass(part)} key={index}>{part}</span>)}</code></pre></div>;
}
