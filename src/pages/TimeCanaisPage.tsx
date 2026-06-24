import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Info, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useTimeCanais, PERMISSIONS, PURPOSES,
  type TeamMember, type Channel, type PermissionKey, type PurposeKey, type TimeCanaisState,
} from "@/hooks/useTimeCanais";

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

export default function TimeCanaisPage() {
  const state = useTimeCanais();

  if (state.loading) {
    return (
      <AppShell>
        <div className="space-y-6 max-w-5xl">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-48" />
          <Skeleton className="h-40" />
        </div>
      </AppShell>
    );
  }

  if (!state.companyId) {
    return (
      <AppShell>
        <div className="space-y-4 max-w-5xl">
          <h1 className="text-3xl font-bold">Time & Canais</h1>
          <p className="text-muted-foreground">Conclua o onboarding para configurar o time e os canais.</p>
          <Button asChild><a href="/onboarding">Fazer onboarding</a></Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8 max-w-5xl">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quem é quem</p>
          <h1 className="text-3xl font-bold">Time & Canais</h1>
          <p className="text-sm text-muted-foreground mt-1">
            O agente trata cada pessoa conforme a permissão — não trata todo mundo igual.
          </p>
        </header>

        <MembersSection state={state} />
        <ChannelsSection state={state} />
      </div>
    </AppShell>
  );
}

/* ---------------- Membros ---------------- */

function MembersSection({ state }: { state: TimeCanaisState }) {
  const { members, saveMember, deleteMember } = state;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (m: TeamMember) => { setEditing(m); setOpen(true); };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Membros do time</h2>
        <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Adicionar membro</Button>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Membro</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Permissão com o agente</TableHead>
              <TableHead className="w-20 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                Nenhum membro cadastrado. Adicione quem o agente deve reconhecer no Discord/Slack.
              </TableCell></TableRow>
            ) : members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{initials(m.name)}</AvatarFallback></Avatar>
                    <div>
                      <div className="font-medium text-sm">{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.handle} · {m.channel}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{m.role ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {m.permissions.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Sem permissão</span>
                    ) : m.permissions.map((p) => <PermissionBadge key={p} permission={p} />)}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteMember(m.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        Um membro sem a permissão "Pode dar ordens" que tentar acionar o agente recebe uma resposta educada de que não está
        autorizado — nunca é ignorado em silêncio, e o admin é avisado no painel.
      </p>

      <MemberDialog open={open} onOpenChange={setOpen} member={editing} onSave={saveMember} />
    </section>
  );
}

function PermissionBadge({ permission }: { permission: PermissionKey }) {
  const meta = PERMISSIONS.find((p) => p.key === permission);
  if (!meta) return null;
  return <Badge className={`text-[10px] ${meta.badge}`}>{meta.label}</Badge>;
}

function MemberDialog({
  open, onOpenChange, member, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: TeamMember | null;
  onSave: TimeCanaisState["saveMember"];
}) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [channel, setChannel] = useState<"discord" | "slack">("discord");
  const [role, setRole] = useState("");
  const [perms, setPerms] = useState<PermissionKey[]>([]);

  // Sincroniza o form quando abre (com membro ou em branco).
  const [lastId, setLastId] = useState<string | null>(null);
  const currentId = member?.id ?? null;
  if (open && lastId !== (currentId ?? "new")) {
    setLastId(currentId ?? "new");
    setName(member?.name ?? "");
    setHandle(member?.handle ?? "");
    setChannel(member?.channel ?? "discord");
    setRole(member?.role ?? "");
    setPerms(member?.permissions ?? []);
  }

  const togglePerm = (key: PermissionKey, on: boolean) =>
    setPerms((prev) => (on ? Array.from(new Set([...prev, key])) : prev.filter((p) => p !== key)));

  const submit = async () => {
    if (!name.trim() || !handle.trim()) return;
    await onSave({ id: member?.id, name, handle, channel, role, permissions: perms });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{member ? "Editar membro" : "Adicionar membro"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Handle</Label><Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@usuario" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as "discord" | "slack")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="discord">Discord</SelectItem>
                  <SelectItem value="slack">Slack</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Cargo</Label><Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex.: Gerente de Ops" /></div>
          </div>
          <div className="space-y-2">
            <Label>Permissões com o agente</Label>
            <div className="grid grid-cols-2 gap-2">
              {PERMISSIONS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={perms.includes(p.key)} onCheckedChange={(v) => togglePerm(p.key, !!v)} />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!name.trim() || !handle.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Canais ---------------- */

function ChannelsSection({ state }: { state: TimeCanaisState }) {
  const { channels, members, saveChannel, deleteChannel } = state;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Canais e seus propósitos</h2>
        <Button size="sm" variant="outline" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar canal
        </Button>
      </div>

      {channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum canal configurado ainda.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {channels.map((c) => {
            const mentions = c.mention_member_ids
              .map((id) => members.find((m) => m.id === id)?.name)
              .filter(Boolean);
            return (
              <div key={c.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.name}</span>
                  <div>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteChannel(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {c.purposes.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Sem propósito definido</span>
                  ) : c.purposes.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[10px]">{PURPOSES.find((x) => x.key === p)?.label ?? p}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {c.platform} · Menciona: {mentions.length ? mentions.join(", ") : "ninguém"}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <ChannelDialog open={open} onOpenChange={setOpen} channel={editing} members={members} onSave={saveChannel} />
    </section>
  );
}

function ChannelDialog({
  open, onOpenChange, channel, members, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channel: Channel | null;
  members: TeamMember[];
  onSave: TimeCanaisState["saveChannel"];
}) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<"discord" | "slack">("discord");
  const [purposes, setPurposes] = useState<PurposeKey[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);

  const [lastId, setLastId] = useState<string | null>(null);
  const currentId = channel?.id ?? null;
  if (open && lastId !== (currentId ?? "new")) {
    setLastId(currentId ?? "new");
    setName(channel?.name ?? "");
    setPlatform(channel?.platform ?? "discord");
    setPurposes(channel?.purposes ?? []);
    setMentions(channel?.mention_member_ids ?? []);
  }

  const togglePurpose = (key: PurposeKey, on: boolean) =>
    setPurposes((prev) => (on ? Array.from(new Set([...prev, key])) : prev.filter((p) => p !== key)));
  const toggleMention = (id: string, on: boolean) =>
    setMentions((prev) => (on ? Array.from(new Set([...prev, id])) : prev.filter((m) => m !== id)));

  const submit = async () => {
    if (!name.trim()) return;
    await onSave({ id: channel?.id, name, platform, purposes, mention_member_ids: mentions });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{channel ? "Editar canal" : "Adicionar canal"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="#operacoes" /></div>
            <div className="space-y-1.5">
              <Label>Plataforma</Label>
              <Select value={platform} onValueChange={(v) => setPlatform(v as "discord" | "slack")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="discord">Discord</SelectItem>
                  <SelectItem value="slack">Slack</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Propósitos</Label>
            <div className="grid grid-cols-2 gap-2">
              {PURPOSES.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={purposes.includes(p.key)} onCheckedChange={(v) => togglePurpose(p.key, !!v)} />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
          {members.length > 0 && (
            <div className="space-y-2">
              <Label>Menciona</Label>
              <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={mentions.includes(m.id)} onCheckedChange={(v) => toggleMention(m.id, !!v)} />
                    {m.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!name.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
