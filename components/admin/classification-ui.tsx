import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Peças de UI compartilhadas entre o setup de classificação/emparceiramento
 * "ao vivo" (components/admin/classification-setup.tsx, na aba Editar de um
 * torneio já existente) e o "rascunho" (app/admin/tournaments/new/page.tsx,
 * mesma pergunta/aparência, mas nada persiste até o torneio ser criado).
 */

export function DimensionQuestion({
  question, on, onToggle, children, dataTour,
}: {
  question: string; on: boolean; onToggle: () => void; children?: React.ReactNode;
  /** Âncora do tour guiado (components/admin/tournament-tour.tsx). */
  dataTour?: string;
}) {
  return (
    <div className="card p-4 space-y-3" data-tour={dataTour}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{question}</p>
        <div className="flex gap-1.5 shrink-0">
          <Chip active={on} onClick={onToggle}>Sim</Chip>
          <Chip active={!on} onClick={onToggle}>Não</Chip>
        </div>
      </div>
      {on && children && <div className="space-y-2 pt-1">{children}</div>}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-brand-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

export function CustomRangeForm({
  label, value, onChange, onAdd,
}: {
  label: string;
  value: { name: string; min: string; max: string };
  onChange: (v: { name: string; min: string; max: string }) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 pt-1">
      <div className="flex-1 min-w-[8rem]">
        <Input
          label={`Faixa personalizada de ${label}`}
          placeholder="Nome"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </div>
      <div className="w-20">
        <Input label="Mín." type="number" value={value.min} onChange={(e) => onChange({ ...value, min: e.target.value })} />
      </div>
      <div className="w-20">
        <Input label="Máx." type="number" value={value.max} onChange={(e) => onChange({ ...value, max: e.target.value })} />
      </div>
      <Button size="sm" variant="secondary" onClick={onAdd}>Adicionar</Button>
    </div>
  );
}

export function ModeOption({
  active, disabled, title, desc, onSelect,
}: {
  active: boolean; disabled?: boolean;
  title: string; desc: string; onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`w-full text-left rounded-lg border p-3 transition-colors disabled:opacity-40 ${
        active
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-4 w-4 rounded-full border-2 ${active ? 'border-brand-500 bg-brand-500' : 'border-gray-300 dark:border-gray-600'}`} />
        <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{title}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">{desc}</p>
    </button>
  );
}
