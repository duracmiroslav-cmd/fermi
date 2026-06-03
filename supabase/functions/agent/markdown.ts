import MarkdownIt from 'markdown-it';

// The flat token shape we read off markdown-it. Declared locally so the
// module type-checks the same under Deno (npm: specifier, no @types) and
// Node / vitest (@types/markdown-it present).
interface MdToken {
  type:     string;
  nesting:  -1 | 0 | 1;
  content:  string;
  children: MdToken[] | null;
  attrGet(name: string): string | null;
}

interface MdNode {
  token:    MdToken;
  children: MdNode[];
}

// Lazily built once per warm instance (mirrors opencc.ts). html:false so
// raw HTML in the model's output is escaped to text, never parsed;
// linkify:false so we don't invent links the author didn't actually write.
let md: MarkdownIt | null = null;

// Flattens markdown into the plain text LINE actually displays. LINE
// renders no markdown, so bold / italic / headings / lists / code all
// collapse to their inner text. Links are the one thing we keep: LINE
// auto-links bare URLs, so `[label](url)` becomes "label url" — the URL
// stays tappable instead of vanishing with the brackets.
export const stripMarkdown = (text: string): string => {
  md ??= new MarkdownIt({ html: false, linkify: false, breaks: false });
  const tokens = md.parse(text, {}) as unknown as MdToken[];
  return renderBlocks(toTree(tokens), 0).replace(/\n{3,}/g, '\n\n').trim();
};

// markdown-it emits a flat open/close stream; fold it into a shallow tree
// so block nesting (lists, quotes) renders without manual cursor juggling.
const toTree = (tokens: MdToken[]): MdNode[] => {
  const root: MdNode[] = [];
  const stack: MdNode[][] = [root];
  for (const token of tokens) {
    if (token.nesting === 1) {
      const node: MdNode = { token, children: [] };
      stack[stack.length - 1]!.push(node);
      stack.push(node.children);
    } else if (token.nesting === -1) {
      stack.pop();
    } else {
      stack[stack.length - 1]!.push({ token, children: [] });
    }
  }
  return root;
};

const renderBlocks = (nodes: MdNode[], depth: number): string =>
  nodes.map(n => renderBlock(n, depth)).filter(s => s.length > 0).join('\n\n');

// Container tokens carry an `_open` suffix (`paragraph_open`); leaf tokens
// (`fence`, `hr`) don't. Strip it so both match the same cases.
const baseType = (token: MdToken): string => token.type.replace(/_open$/, '');

const renderBlock = (node: MdNode, depth: number): string => {
  const { token } = node;
  switch (baseType(token)) {
    case 'paragraph':
    case 'heading':
      return renderInlineChild(node);
    case 'fence':
    case 'code_block':
      return token.content.replace(/\n+$/, '');
    case 'bullet_list':
      return node.children.map(item => renderListItem(item, '-', depth)).join('\n');
    case 'ordered_list': {
      let n = Number(token.attrGet('start')) || 1;
      return node.children.map(item => renderListItem(item, `${n++}.`, depth)).join('\n');
    }
    case 'blockquote':
      return renderBlocks(node.children, depth);
    default:
      return '';
  }
};

const renderListItem = (item: MdNode, marker: string, depth: number): string => {
  const pad = '  '.repeat(depth);
  const blocks = item.children
    .map((child) => {
      const type = baseType(child.token);
      const nested = type === 'bullet_list' || type === 'ordered_list';
      return renderBlock(child, nested ? depth + 1 : depth);
    })
    .filter(s => s.length > 0);
  const [first = '', ...rest] = blocks;
  let line = `${pad}${marker} ${first}`.trimEnd();
  for (const block of rest) line += `\n${block}`;
  return line;
};

const renderInlineChild = (node: MdNode): string => {
  const inline = node.children.find(c => c.token.type === 'inline');
  return inline ? renderInline(inline.token.children ?? []) : '';
};

// Inline children are a flat list; emphasis markers contribute nothing
// (their text arrives as separate `text` tokens), links are rewritten to
// "label url", images to their alt text.
const renderInline = (children: MdToken[]): string => {
  let out = '';
  for (let i = 0; i < children.length; i++) {
    const t = children[i]!;
    switch (t.type) {
      case 'text':
      case 'code_inline':
        out += t.content;
        break;
      case 'softbreak':
      case 'hardbreak':
        out += '\n';
        break;
      case 'image':
        out += t.content; // alt text; the image URL is dropped
        break;
      case 'link_open': {
        const href = t.attrGet('href') ?? '';
        let label = '';
        let depth = 1;
        for (i++; i < children.length; i++) {
          const c = children[i]!;
          if (c.type === 'link_open') depth++;
          else if (c.type === 'link_close') { if (--depth === 0) break; }
          else if (c.type === 'text' || c.type === 'code_inline') label += c.content;
          else if (c.type === 'softbreak' || c.type === 'hardbreak') label += ' ';
        }
        label = label.trim();
        if (!href || label === href) out += label || href;
        else if (!label) out += href;
        else out += `${label} ${href}`;
        break;
      }
      default:
        break; // strong / em / s open+close, html_inline, etc.
    }
  }
  return out;
};
