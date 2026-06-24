import { useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Info, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { SKILLS_CATALOG, type CerebroState, type KnowledgeItem, type ProductItem } from "@/hooks/useCerebro";

export function ConhecimentoTab({ cerebro }: { cerebro: CerebroState }) {
  const { context, saveContext, files, sources, uploadFile, toggleKnowledge, deleteKnowledge } = cerebro;
  const [opContext, setOpContext] = useState(context?.operational_context ?? "");
  const [products, setProducts] = useState<ProductItem[]>(context?.products ?? []);
  const [savingCtx, setSavingCtx] = useState(false);
  const [savingProd, setSavingProd] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const skills = context?.skills_enabled ?? [];

  const saveOpContext = async () => {
    setSavingCtx(true);
    const ok = await saveContext({ operational_context: opContext });
    setSavingCtx(false);
    if (ok) toast.success("Contexto operacional salvo");
  };

  const saveProducts = async () => {
    setSavingProd(true);
    const ok = await saveContext({ products: products.filter((p) => p.name.trim()) });
    setSavingProd(false);
    if (ok) toast.success("Produtos salvos");
  };

  const toggleSkill = async (key: string, on: boolean) => {
    const next = on ? Array.from(new Set([...skills, key])) : skills.filter((s) => s !== key);
    await saveContext({ skills_enabled: next });
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await uploadFile(file);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const setProduct = (i: number, patch: Partial<ProductItem>) => setProducts((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-6">
      {/* Produtos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Produtos e serviços</CardTitle>
          <CardDescription>O que a empresa oferece — o Atlas usa isso ao falar de operação.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {products.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum produto cadastrado.</p> : products.map((p, i) => (
            <div key={i} className="flex gap-2 items-start">
              <Input value={p.name} onChange={(e) => setProduct(i, { name: e.target.value })} placeholder="Nome" className="w-1/3" />
              <Input value={p.description} onChange={(e) => setProduct(i, { description: e.target.value })} placeholder="Descrição curta" className="flex-1" />
              <Button size="icon" variant="ghost" className="text-destructive h-9 w-9" onClick={() => setProducts((arr) => arr.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <div className="flex justify-between">
            <Button size="sm" variant="outline" onClick={() => setProducts((p) => [...p, { name: "", description: "" }])}><Plus className="h-4 w-4 mr-1" /> Adicionar produto</Button>
            <Button size="sm" onClick={saveProducts} disabled={savingProd}>{savingProd ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Salvar produtos</Button>
          </div>
        </CardContent>
      </Card>

      {/* Habilidades ativas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Habilidades ativas</CardTitle>
          <CardDescription>O que o Atlas pode fazer. Só o que estiver marcado é compilado nas skills.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-2">
            {SKILLS_CATALOG.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border p-2.5">
                <Checkbox checked={skills.includes(s.key)} onCheckedChange={(v) => toggleSkill(s.key, !!v)} />
                {s.label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Contexto operacional */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Contexto operacional</CardTitle>
            {context?.operational_context && <Badge variant="secondary">● Indexado</Badge>}
          </div>
          <CardDescription>O que o agente precisa saber sobre o dia a dia da empresa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={opContext} onChange={(e) => setOpContext(e.target.value)} rows={5}
            placeholder="Ex.: Fechamento de caixa toda sexta às 17h. Pagamentos acima de R$ 5.000 exigem aprovação do Rafael. Relatórios vão para #operações." />
          <div className="flex justify-end"><Button size="sm" onClick={saveOpContext} disabled={savingCtx}>{savingCtx ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Salvar contexto</Button></div>
        </CardContent>
      </Card>

      {/* Arquivos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Arquivos</CardTitle>
          <CardDescription>SOPs, organogramas, processos (PDF/DOCX/XLSX/TXT). Cada arquivo só é usado se ativado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.xlsx,.txt" onChange={onPick} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}Enviar arquivo</Button>
          {files.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum arquivo enviado ainda.</p> : (
            <ul className="divide-y rounded-lg border">{files.map((f) => <KnowledgeRow key={f.id} item={f} cerebro={cerebro} />)}</ul>
          )}
        </CardContent>
      </Card>

      {/* Fontes automáticas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fontes automáticas</CardTitle>
          <CardDescription className="flex items-center gap-1"><Info className="h-3 w-3" /> Nenhuma fonte é usada pelo agente sem ativação explícita.</CardDescription>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? <p className="text-sm text-muted-foreground">Conecte Notion ou Discord em Configurações para indexar fontes automáticas.</p> : (
            <ul className="divide-y rounded-lg border">{sources.map((s) => <KnowledgeRow key={s.id} item={s} cerebro={cerebro} hideDelete />)}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function statusBadge(status: KnowledgeItem["status"]) {
  if (status === "available") return <Badge className="bg-emerald-600 hover:bg-emerald-600">Disponível</Badge>;
  if (status === "indexing") return <Badge className="bg-blue-600 hover:bg-blue-600 animate-pulse">Indexando…</Badge>;
  return <Badge variant="destructive">Erro</Badge>;
}

function KnowledgeRow({ item, cerebro, hideDelete }: { item: KnowledgeItem; cerebro: CerebroState; hideDelete?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{item.filename}</p>
        {item.source_type && <p className="text-xs text-muted-foreground capitalize">{item.source_type}</p>}
      </div>
      {statusBadge(item.status)}
      <Switch checked={item.active} disabled={item.status !== "available"} onCheckedChange={(v) => cerebro.toggleKnowledge(item.id, v)} />
      {!hideDelete && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cerebro.deleteKnowledge(item)}><Trash2 className="h-4 w-4" /></Button>}
    </li>
  );
}
