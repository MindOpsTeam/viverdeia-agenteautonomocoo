import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownMessageProps {
  content: string;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="text-sm leading-relaxed space-y-2 [&_p]:m-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-semibold [&_em]:italic [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-1 [&_h3]:text-sm [&_h3]:font-semibold [&_code]:bg-background/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_pre]:bg-background/60 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_a]:underline [&_a]:text-primary [&_hr]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-2 [&_blockquote]:italic">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
