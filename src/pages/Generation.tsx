import { useState } from 'react';
import { Download, GripVertical, Pencil, Plus, Save, Trash2, Upload } from 'lucide-react';
import { activePreset, openModal, setState, toast, updatePreset, useStore } from '../store';
import type { GenPreset, PromptItem } from '../types';
import { Divider, Field, IconBtn, NumInput, Panel, Select, Slider, Switch } from '../components/ui';
import { DEFAULT_PRESET } from '../lib/defaults';
import { download, estimateTokens, fmtNum, pickFiles, safeName, uid } from '../lib/util';
import { contextSize } from '../lib/connection';

const NO_ITEMS: { name: string; tokens: number }[] = [];
const set = (p: Partial<GenPreset>) => updatePreset((x) => ({ ...x, ...p }));

export function GenerationPage() {
  const preset = useStore(activePreset);
  const presets = useStore((s) => s.presets);
  const isChat = useStore((s) => s.api.main === 'chat');

  const saveAs = () => {
    const name = prompt('Название нового пресета', preset.name + ' (копия)');
    if (!name) return;
    const p = { ...structuredClone(preset), id: uid(), name };
    setState((s) => ({ presets: [...s.presets, p], activePresetId: p.id }));
  };

  const importPreset = async () => {
    const [f] = await pickFiles('.json');
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const p = presetFromST(j, f.name.replace(/\.json$/i, ''));
      setState((s) => ({ presets: [...s.presets, p], activePresetId: p.id }));
      toast(`Пресет «${p.name}» импортирован`, 'success');
    } catch (e) {
      toast('Не удалось импортировать: ' + (e as Error).message, 'error');
    }
  };

  const maxCtx = contextSize();

  return (
    <div className="cols wrap-md">
      <Panel className="fill" style={{ flex: '1 1 0', minWidth: 340 }} title="Параметры генерации">
        <div className="row">
          <Select
            className="grow"
            value={preset.id}
            onChange={(v) => setState({ activePresetId: v })}
            options={presets.map((p) => ({ value: p.id, label: p.name }))}
          />
          <IconBtn size="lg" icon={<Save size={16} />} label="Сохранить как новый" onClick={saveAs} />
          <IconBtn
            size="lg"
            icon={<Pencil size={16} />}
            label="Переименовать"
            onClick={() => {
              const n = prompt('Новое название', preset.name);
              if (n) set({ name: n });
            }}
          />
          <IconBtn size="lg" icon={<Upload size={16} />} label="Импорт пресета (JSON, в т.ч. SillyTavern)" onClick={() => void importPreset()} />
          <IconBtn size="lg" icon={<Download size={16} />} label="Экспорт пресета" onClick={() => download(`${safeName(preset.name)}.json`, JSON.stringify(preset, null, 2))} />
          <IconBtn
            size="lg"
            className="danger"
            icon={<Trash2 size={16} />}
            label="Удалить пресет"
            disabled={presets.length < 2}
            onClick={() => {
              if (!confirm(`Удалить пресет «${preset.name}»?`)) return;
              setState((s) => {
                const rest = s.presets.filter((p) => p.id !== preset.id);
                return { presets: rest, activePresetId: rest[0].id };
              });
            }}
          />
        </div>
        <div className="body scroll grow" style={{ paddingRight: 6 }}>
          <div className="grid2" style={{ gap: 10 }}>
            <Switch label="Стриминг ответа" checked={preset.stream} onChange={(v) => set({ stream: v })} />
            <Switch label="Рассуждения модели" checked={preset.reasoning} onChange={(v) => set({ reasoning: v })} />
            <Switch label="Неограниченный контекст" checked={preset.unlockedContext} onChange={(v) => set({ unlockedContext: v })} />
            {isChat && <Switch label="Склеивать системные" checked={preset.squashSystem} onChange={(v) => set({ squashSystem: v })} />}
          </div>
          <Divider />
          <div className="grid2">
            <Slider
              label="Размер контекста, токенов"
              value={preset.maxContext}
              min={512}
              max={preset.unlockedContext ? 2_000_000 : Math.max(maxCtx ?? 131072, preset.maxContext)}
              step={256}
              onChange={(v) => set({ maxContext: Math.round(v) })}
              hint="Сколько токенов истории и описаний отправлять модели"
            />
            <Slider label="Длина ответа, токенов" value={preset.maxTokens} min={16} max={8192} step={8} onChange={(v) => set({ maxTokens: Math.round(v) })} hint="Максимальная длина ответа модели" />
            <Slider label="Температура" value={preset.temperature} min={0} max={2} step={0.01} onChange={(v) => set({ temperature: v })} hint="Выше — смелее и разнообразнее, ниже — предсказуемее" />
            <Slider label="Top P" value={preset.topP} min={0} max={1} step={0.01} onChange={(v) => set({ topP: v })} hint="Отсекает маловероятные токены по суммарной вероятности" />
            <Slider label="Top K" value={preset.topK} min={0} max={200} step={1} onChange={(v) => set({ topK: Math.round(v) })} hint="Берёт только K самых вероятных токенов (0 — выключено)" />
            <Slider label="Min P" value={preset.minP} min={0} max={1} step={0.01} onChange={(v) => set({ minP: v })} hint="Отсекает токены слабее доли от самого вероятного" />
            <Slider label="Штраф за частоту" value={preset.freqPen} min={-2} max={2} step={0.01} onChange={(v) => set({ freqPen: v })} hint="Снижает повторы часто встречающихся слов" />
            <Slider label="Штраф за присутствие" value={preset.presPen} min={-2} max={2} step={0.01} onChange={(v) => set({ presPen: v })} hint="Подталкивает к новым темам" />
            <Slider label="Штраф за повтор" value={preset.repPen} min={1} max={2} step={0.01} onChange={(v) => set({ repPen: v })} hint="Repetition penalty (для локальных моделей и OpenRouter)" />
            {!isChat && (
              <>
                <Slider label="Окно штрафа за повтор" value={preset.repPenRange} min={0} max={8192} step={64} onChange={(v) => set({ repPenRange: Math.round(v) })} />
                <Slider label="Top A" value={preset.topA} min={0} max={1} step={0.01} onChange={(v) => set({ topA: v })} />
                <Slider label="Typical P" value={preset.typicalP} min={0} max={1} step={0.01} onChange={(v) => set({ typicalP: v })} />
                <Slider label="TFS" value={preset.tfs} min={0} max={1} step={0.01} onChange={(v) => set({ tfs: v })} />
              </>
            )}
          </div>
          <div className="grid2">
            <Field label="Усилие рассуждений">
              <Select
                value={preset.reasoningEffort}
                onChange={(v) => set({ reasoningEffort: v })}
                options={[
                  { value: 'auto', label: 'Авто' },
                  { value: 'minimal', label: 'Минимальное' },
                  { value: 'low', label: 'Низкое' },
                  { value: 'medium', label: 'Среднее' },
                  { value: 'high', label: 'Высокое' },
                ]}
              />
            </Field>
            <Field label="Seed">
              <NumInput value={preset.seed} onChange={(v) => set({ seed: Math.round(v) })} />
            </Field>
          </div>
          <Divider title="Служебные промпты" />
          <UtilityPrompt label="Ответ за пользователя" k="impersonationPrompt" />
          <UtilityPrompt label="Продолжение ответа" k="continuePrompt" />
          <UtilityPrompt label="Начало чата" k="newChatPrompt" />
          <UtilityPrompt label="Начало группового чата" k="newGroupChatPrompt" />
          <UtilityPrompt label="Разделитель примеров" k="newExampleChatPrompt" />
          <UtilityPrompt label="Подсказка в группе" k="groupNudgePrompt" />
          <button
            type="button"
            className="btn sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              if (confirm('Вернуть значения по умолчанию для параметров этого пресета? Промпты не изменятся.')) {
                const { id, name, prompts } = preset;
                updatePreset(() => ({ ...DEFAULT_PRESET, id, name, prompts }));
              }
            }}
          >
            Сбросить параметры
          </button>
        </div>
      </Panel>
      <PromptManager />
    </div>
  );
}

function UtilityPrompt({ label, k }: { label: string; k: keyof GenPreset }) {
  const value = useStore((s) => String(activePreset(s)[k] ?? ''));
  const [v, setV] = useState(value);
  return (
    <Field label={label}>
      <textarea
        className="textarea scroll"
        rows={2}
        style={{ minHeight: 56 }}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && set({ [k]: v } as Partial<GenPreset>)}
      />
    </Field>
  );
}

function PromptManager() {
  const preset = useStore(activePreset);
  const lastTokens = useStore((s) => s.lastPrompt?.tokens ?? 0);
  const lastItems = useStore((s) => s.lastPrompt?.items) ?? NO_ITEMS;
  const isChat = useStore((s) => s.api.main === 'chat' && !(s.format.instructEnabled && s.format.instructForChat));
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to) return;
    updatePreset((p) => {
      const arr = [...p.prompts];
      const [x] = arr.splice(from, 1);
      arr.splice(to, 0, x);
      return { ...p, prompts: arr };
    });
  };
  const toggle = (id: string, v: boolean) => updatePreset((p) => ({ ...p, prompts: p.prompts.map((x) => (x.id === id ? { ...x, enabled: v } : x)) }));
  const tokensFor = (p: PromptItem) => {
    if (!p.marker) return p.content ? fmtNum(estimateTokens(p.content)) : '—';
    const item = lastItems.find((x) => x.name === p.name);
    return item ? fmtNum(item.tokens) : 'авто';
  };

  const addPrompt = () => {
    const p: PromptItem = {
      id: uid(),
      name: 'Новый промпт',
      role: 'system',
      content: '',
      marker: false,
      enabled: true,
      system: false,
      position: 'relative',
      depth: 4,
    };
    updatePreset((x) => ({ ...x, prompts: [...x.prompts, p] }));
    openModal('promptEdit', p.id);
  };

  return (
    <Panel
      className="fill"
      style={{ flex: '1.25 1 0', minWidth: 360 }}
      title="Менеджер промптов"
      actions={
        <>
          <button type="button" className="btn sm" onClick={addPrompt}>
            <Plus size={15} /> Промпт
          </button>
          <IconBtn
            icon={<Upload size={16} />}
            label="Импорт порядка промптов"
            onClick={async () => {
              const [f] = await pickFiles('.json');
              if (!f) return;
              try {
                const j = JSON.parse(await f.text());
                const prompts = promptsFromST(j) ?? j.prompts;
                if (!Array.isArray(prompts)) throw new Error('нет списка промптов');
                updatePreset((x) => ({ ...x, prompts }));
                toast('Промпты импортированы', 'success');
              } catch (e) {
                toast('Ошибка импорта: ' + (e as Error).message, 'error');
              }
            }}
          />
          <IconBtn icon={<Download size={16} />} label="Экспорт промптов" onClick={() => download('prompts.json', JSON.stringify({ prompts: preset.prompts }, null, 2))} />
        </>
      }
    >
      <div className="sub">
        {isChat
          ? 'Блоки отправляются модели сверху вниз. Перетаскивайте, чтобы менять порядок; маркеры заполняются автоматически.'
          : 'Сейчас выбран Text Completion — порядок задаёт шаблон контекста во вкладке «Формат». Здесь используются только тексты основного промпта и инструкций.'}
      </div>
      <div className="pm-table grow">
        <div className="pm-row head">
          <span />
          <span>Блок</span>
          <span className="kind-h d-only">Тип</span>
          <span style={{ textAlign: 'right' }}>Токены</span>
          <span />
          <span />
        </div>
        <div className="scroll grow">
          {preset.prompts.map((p, i) => (
            <div
              key={p.id}
              className={`pm-row ${p.enabled ? '' : 'off'} ${over === i && drag !== null ? 'drag-over' : ''}`}
              draggable
              onDragStart={(e) => {
                setDrag(i);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag !== null) move(drag, i);
                setDrag(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
            >
              <span className="grip" title="Перетащите">
                <GripVertical size={16} />
              </span>
              <span className="name" title={p.name}>
                {p.name}
                {p.position === 'absolute' && !p.marker && <span className="muted"> · глубина {p.depth}</span>}
              </span>
              <span className="kind">{p.marker ? 'маркер' : p.role === 'system' ? 'система' : p.role === 'user' ? 'пользователь' : 'ассистент'}</span>
              <span className="toks">{tokensFor(p)}</span>
              <span className="edit-cell">
                {!p.marker && <IconBtn size="sm" bare icon={<Pencil size={14} />} label="Изменить" onClick={() => openModal('promptEdit', p.id)} />}
              </span>
              <Switch checked={p.enabled} onChange={(v) => toggle(p.id, v)} />
            </div>
          ))}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <span className="sub">В последнем запросе</span>
        <button type="button" className="big-tokens" onClick={() => openModal('prompt')} title="Показать состав промпта">
          {fmtNum(lastTokens)} токенов
        </button>
      </div>
    </Panel>
  );
}

// ── Совместимость с пресетами SillyTavern ──

const ST_IDS: Record<string, string> = {
  main: 'main',
  nsfw: 'nsfw',
  jailbreak: 'jailbreak',
  enhanceDefinitions: 'enhanceDefinitions',
  worldInfoBefore: 'worldInfoBefore',
  worldInfoAfter: 'worldInfoAfter',
  charDescription: 'charDescription',
  charPersonality: 'charPersonality',
  scenario: 'scenario',
  personaDescription: 'personaDescription',
  dialogueExamples: 'dialogueExamples',
  chatHistory: 'chatHistory',
};

function promptsFromST(j: any): PromptItem[] | null {
  if (!Array.isArray(j.prompts) || !Array.isArray(j.prompt_order)) return null;
  const order: { identifier: string; enabled: boolean }[] =
    j.prompt_order.find((o: any) => o.character_id === 100001)?.order ?? j.prompt_order[0]?.order ?? [];
  const byId = new Map<string, any>(j.prompts.map((p: any) => [p.identifier, p]));
  const defaults = new Map(DEFAULT_PRESET.prompts.map((p) => [p.id, p]));
  const out: PromptItem[] = [];
  for (const o of order) {
    const p = byId.get(o.identifier);
    if (!p) continue;
    const known = ST_IDS[o.identifier];
    const def = known ? defaults.get(known) : undefined;
    out.push({
      id: known ?? o.identifier,
      name: def?.name ?? p.name ?? o.identifier,
      role: p.role ?? 'system',
      content: p.content ?? '',
      marker: Boolean(p.marker),
      enabled: o.enabled,
      system: Boolean(p.system_prompt || known),
      position: p.injection_position === 1 ? 'absolute' : 'relative',
      depth: p.injection_depth ?? 4,
    });
  }
  return out.length ? out : null;
}

function presetFromST(j: any, fallback: string): GenPreset {
  if (j.prompts && !j.prompt_order && j.maxContext) return { ...DEFAULT_PRESET, ...j, id: uid() };
  const prompts = promptsFromST(j) ?? DEFAULT_PRESET.prompts;
  return {
    ...DEFAULT_PRESET,
    id: uid(),
    name: j.name ?? fallback,
    stream: j.stream_openai ?? DEFAULT_PRESET.stream,
    maxContext: j.openai_max_context ?? j.max_length ?? DEFAULT_PRESET.maxContext,
    maxTokens: j.openai_max_tokens ?? j.genamt ?? DEFAULT_PRESET.maxTokens,
    temperature: j.temperature ?? j.temp ?? DEFAULT_PRESET.temperature,
    topP: j.top_p ?? DEFAULT_PRESET.topP,
    topK: j.top_k ?? DEFAULT_PRESET.topK,
    minP: j.min_p ?? DEFAULT_PRESET.minP,
    topA: j.top_a ?? DEFAULT_PRESET.topA,
    typicalP: j.typical_p ?? DEFAULT_PRESET.typicalP,
    tfs: j.tfs ?? DEFAULT_PRESET.tfs,
    freqPen: j.frequency_penalty ?? j.freq_pen ?? DEFAULT_PRESET.freqPen,
    presPen: j.presence_penalty ?? j.presence_pen ?? DEFAULT_PRESET.presPen,
    repPen: j.repetition_penalty ?? j.rep_pen ?? DEFAULT_PRESET.repPen,
    repPenRange: j.rep_pen_range ?? DEFAULT_PRESET.repPenRange,
    seed: j.seed ?? -1,
    reasoningEffort: j.reasoning_effort ?? DEFAULT_PRESET.reasoningEffort,
    prompts,
    impersonationPrompt: j.impersonation_prompt ?? DEFAULT_PRESET.impersonationPrompt,
    continuePrompt: j.continue_nudge_prompt ?? DEFAULT_PRESET.continuePrompt,
    newChatPrompt: j.new_chat_prompt ?? DEFAULT_PRESET.newChatPrompt,
    newGroupChatPrompt: j.new_group_chat_prompt ?? DEFAULT_PRESET.newGroupChatPrompt,
    newExampleChatPrompt: j.new_example_chat_prompt ?? DEFAULT_PRESET.newExampleChatPrompt,
    groupNudgePrompt: j.group_nudge_prompt ?? DEFAULT_PRESET.groupNudgePrompt,
    squashSystem: j.squash_system_messages ?? false,
  };
}

export function PromptEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const p = useStore((s) => activePreset(s).prompts.find((x) => x.id === id));
  const [d, setD] = useState<PromptItem | undefined>(p);
  if (!p || !d) return null;
  const save = () => {
    updatePreset((x) => ({ ...x, prompts: x.prompts.map((y) => (y.id === id ? d : y)) }));
    onClose();
  };
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="grid2">
        <Field label="Название">
          <input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <Field label="Роль">
          <Select
            value={d.role}
            onChange={(v) => setD({ ...d, role: v })}
            options={[
              { value: 'system', label: 'Система' },
              { value: 'user', label: 'Пользователь' },
              { value: 'assistant', label: 'Ассистент' },
            ]}
          />
        </Field>
        <Field label="Позиция">
          <Select
            value={d.position}
            onChange={(v) => setD({ ...d, position: v })}
            options={[
              { value: 'relative', label: 'По порядку в списке' },
              { value: 'absolute', label: 'На глубине в истории' },
            ]}
          />
        </Field>
        {d.position === 'absolute' && (
          <Field label="Глубина">
            <NumInput value={d.depth} min={0} max={999} onChange={(v) => setD({ ...d, depth: v })} />
          </Field>
        )}
      </div>
      <Field label="Текст промпта" hint="Поддерживаются макросы {{char}}, {{user}}, {{random::…}} и др.">
        <textarea className="textarea scroll" rows={12} value={d.content} onChange={(e) => setD({ ...d, content: e.target.value })} />
      </Field>
      <div className="modal-foot">
        {!p.system && (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              updatePreset((x) => ({ ...x, prompts: x.prompts.filter((y) => y.id !== id) }));
              onClose();
            }}
          >
            <Trash2 size={15} /> Удалить
          </button>
        )}
        <span className="spacer" />
        <span className="sub">{fmtNum(estimateTokens(d.content))} токенов</span>
        <button type="button" className="btn" onClick={onClose}>
          Отмена
        </button>
        <button type="button" className="btn primary" onClick={save}>
          Сохранить
        </button>
      </div>
    </div>
  );
}

