import { tr } from '../lib/i18n';
import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Copy, Download, GripVertical, Pencil, Plus, Regex, RotateCcw, Save, Trash2, Upload } from 'lucide-react';
import { activePreset, closeModal, openModal, setState, toast, updatePreset, useStore } from '../store';
import type { GenPreset, PromptItem, RegexScript } from '../types';
import { regexFromST } from '../lib/regex';
import { Divider, Field, IconBtn, LazyTextarea, Modal, NumInput, Panel, Select, Slider, Switch } from '../components/ui';
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
    const name = prompt(tr('Название нового пресета'), preset.name + tr(' (копия)'));
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
      toast(tr('Пресет «{0}» импортирован', p.name), 'success');
    } catch (e) {
      toast(tr('Не удалось импортировать: ') + (e as Error).message, 'error');
    }
  };

  const maxCtx = contextSize();

  return (
    <div className="cols wrap-md">
      <Panel className="fill" style={{ flex: '1 1 0', minWidth: 340 }} title={tr('Параметры генерации')}>
        <div className="row">
          <Select
            className="grow"
            value={preset.id}
            onChange={(v) => setState({ activePresetId: v })}
            options={presets.map((p) => ({ value: p.id, label: tr(p.name) }))}
          />
          <IconBtn size="lg" icon={<Save size={16} />} label={tr('Сохранить как новый')} onClick={saveAs} />
          <IconBtn
            size="lg"
            icon={<Pencil size={16} />}
            label={tr('Переименовать')}
            onClick={() => {
              const n = prompt(tr('Новое название'), preset.name);
              if (n) set({ name: n });
            }}
          />
          <IconBtn size="lg" icon={<Upload size={16} />} label={tr('Импорт пресета (JSON, в т.ч. SillyTavern)')} onClick={() => void importPreset()} />
          <IconBtn size="lg" icon={<Download size={16} />} label={tr('Экспорт пресета')} onClick={() => download(`${safeName(preset.name)}.json`, JSON.stringify(preset, null, 2))} />
          <IconBtn
            size="lg"
            className="danger"
            icon={<Trash2 size={16} />}
            label={tr('Удалить пресет')}
            disabled={presets.length < 2}
            onClick={() => {
              if (!confirm(tr('Удалить пресет «{0}»?', preset.name))) return;
              setState((s) => {
                const rest = s.presets.filter((p) => p.id !== preset.id);
                return { presets: rest, activePresetId: rest[0].id };
              });
            }}
          />
        </div>
        <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => openModal('ext', 'regex:preset')} title={tr('Регексы работают, только пока выбран этот пресет')}>
          <Regex size={14} /> {tr('Регексы пресета: {0}', (preset.regex ?? []).length)}
        </button>
        <div className="body scroll grow" style={{ paddingRight: 6 }}>
          <div className="grid2" style={{ gap: 10 }}>
            <Switch label={tr('Стриминг ответа')} checked={preset.stream} onChange={(v) => set({ stream: v })} />
            <Switch label={tr('Рассуждения модели')} checked={preset.reasoning} onChange={(v) => set({ reasoning: v })} />
            <Switch label={tr('Неограниченный контекст')} checked={preset.unlockedContext} onChange={(v) => set({ unlockedContext: v })} />
            {isChat && <Switch label={tr('Склеивать системные')} checked={preset.squashSystem} onChange={(v) => set({ squashSystem: v })} />}
          </div>
          <Divider />
          <div className="grid2">
            <Slider
              label={tr('Размер контекста, токенов')}
              value={preset.maxContext}
              min={512}
              max={preset.unlockedContext ? 2_000_000 : Math.max(maxCtx ?? 131072, preset.maxContext)}
              step={256}
              onChange={(v) => set({ maxContext: Math.round(v) })}
              hint={tr('Сколько токенов истории и описаний отправлять модели')}
            />
            <Slider label={tr('Длина ответа, токенов')} value={preset.maxTokens} min={16} max={8192} step={8} onChange={(v) => set({ maxTokens: Math.round(v) })} hint={tr('Максимальная длина ответа модели')} />
            <Slider label={tr('Температура')} value={preset.temperature} min={0} max={2} step={0.01} onChange={(v) => set({ temperature: v })} hint={tr('Выше — смелее и разнообразнее, ниже — предсказуемее')} />
            <Slider label="Top P" value={preset.topP} min={0} max={1} step={0.01} onChange={(v) => set({ topP: v })} hint={tr('Отсекает маловероятные токены по суммарной вероятности')} />
            <Slider label="Top K" value={preset.topK} min={0} max={200} step={1} onChange={(v) => set({ topK: Math.round(v) })} hint={tr('Берёт только K самых вероятных токенов (0 — выключено)')} />
            <Slider label="Min P" value={preset.minP} min={0} max={1} step={0.01} onChange={(v) => set({ minP: v })} hint={tr('Отсекает токены слабее доли от самого вероятного')} />
            <Slider label={tr('Штраф за частоту')} value={preset.freqPen} min={-2} max={2} step={0.01} onChange={(v) => set({ freqPen: v })} hint={tr('Снижает повторы часто встречающихся слов')} />
            <Slider label={tr('Штраф за присутствие')} value={preset.presPen} min={-2} max={2} step={0.01} onChange={(v) => set({ presPen: v })} hint={tr('Подталкивает к новым темам')} />
            <Slider label={tr('Штраф за повтор')} value={preset.repPen} min={1} max={2} step={0.01} onChange={(v) => set({ repPen: v })} hint={tr('Repetition penalty (для локальных моделей и OpenRouter)')} />
            {!isChat && (
              <>
                <Slider label={tr('Окно штрафа за повтор')} value={preset.repPenRange} min={0} max={8192} step={64} onChange={(v) => set({ repPenRange: Math.round(v) })} />
                <Slider label="Top A" value={preset.topA} min={0} max={1} step={0.01} onChange={(v) => set({ topA: v })} />
                <Slider label="Typical P" value={preset.typicalP} min={0} max={1} step={0.01} onChange={(v) => set({ typicalP: v })} />
                <Slider label="TFS" value={preset.tfs} min={0} max={1} step={0.01} onChange={(v) => set({ tfs: v })} />
              </>
            )}
          </div>
          <div className="grid2">
            <Field label={tr('Усилие рассуждений')}>
              <Select
                value={preset.reasoningEffort}
                onChange={(v) => set({ reasoningEffort: v })}
                options={[
                  { value: 'auto', label: tr('Авто') },
                  { value: 'minimal', label: tr('Минимальное') },
                  { value: 'low', label: tr('Низкое') },
                  { value: 'medium', label: tr('Среднее') },
                  { value: 'high', label: tr('Высокое') },
                ]}
              />
            </Field>
            <Field label="Seed">
              <NumInput value={preset.seed} onChange={(v) => set({ seed: Math.round(v) })} />
            </Field>
          </div>
          <Divider title={tr('Служебные промпты')} />
          <UtilityPrompt label={tr('Ответ за пользователя')} k="impersonationPrompt" />
          <UtilityPrompt label={tr('Продолжение ответа')} k="continuePrompt" />
          <UtilityPrompt label={tr('Начало чата')} k="newChatPrompt" />
          <UtilityPrompt label={tr('Начало группового чата')} k="newGroupChatPrompt" />
          <UtilityPrompt label={tr('Разделитель примеров')} k="newExampleChatPrompt" />
          <UtilityPrompt label={tr('Подсказка в группе')} k="groupNudgePrompt" />
          <button
            type="button"
            className="btn sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              if (confirm(tr('Вернуть значения по умолчанию для параметров этого пресета? Промпты не изменятся.'))) {
                const { id, name, prompts } = preset;
                updatePreset(() => ({ ...DEFAULT_PRESET, id, name, prompts }));
              }
            }}
          >
            {tr('Сбросить параметры')}
          </button>
        </div>
      </Panel>
      <PromptManager />
    </div>
  );
}

function UtilityPrompt({ label, k }: { label: string; k: keyof GenPreset }) {
  const presetId = useStore((s) => s.activePresetId);
  const value = useStore((s) => String(activePreset(s)[k] ?? ''));
  return (
    <Field label={label}>
      {/* key по пресету: при смене пресета поле не должно унести старый текст в новый */}
      <LazyTextarea key={presetId} className="textarea scroll" rows={2} style={{ minHeight: 56 }} value={value} onCommit={(v) => set({ [k]: v } as Partial<GenPreset>)} />
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
    return item ? fmtNum(item.tokens) : tr('авто');
  };

  const addPrompt = () => {
    const p: PromptItem = {
      id: uid(),
      name: tr('Новый промпт'),
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
      title={tr('Менеджер промптов')}
      actions={
        <>
          <button type="button" className="btn sm" onClick={addPrompt}>
            <Plus size={15} /> {tr('Промпт')}
          </button>
          <IconBtn
            icon={<Upload size={16} />}
            label={tr('Импорт порядка промптов')}
            onClick={async () => {
              const [f] = await pickFiles('.json');
              if (!f) return;
              try {
                const j = JSON.parse(await f.text());
                const prompts = promptsFromST(j) ?? j.prompts;
                if (!Array.isArray(prompts)) throw new Error(tr('нет списка промптов'));
                updatePreset((x) => ({ ...x, prompts }));
                toast(tr('Промпты импортированы'), 'success');
              } catch (e) {
                toast(tr('Ошибка импорта: ') + (e as Error).message, 'error');
              }
            }}
          />
          <IconBtn icon={<Download size={16} />} label={tr('Экспорт промптов')} onClick={() => download('prompts.json', JSON.stringify({ prompts: preset.prompts }, null, 2))} />
        </>
      }
    >
      <div className="sub">
        {isChat
          ? tr('Блоки отправляются модели сверху вниз. Нажмите на блок, чтобы изменить текст; порядок меняется перетаскиванием или кнопками «Выше/Ниже» в редакторе. Маркеры заполняются автоматически.')
          : tr('Сейчас выбран Text Completion — порядок задаёт шаблон контекста во вкладке «Формат». Здесь используются только тексты основного промпта и инструкций.')}
      </div>
      <div className="pm-table grow">
        <div className="pm-row head">
          <span />
          <span>{tr('Блок')}</span>
          <span className="kind-h d-only">{tr('Тип')}</span>
          <span style={{ textAlign: 'right' }}>{tr('Токены')}</span>
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
              <span className="grip" title={tr('Перетащите')}>
                <GripVertical size={16} />
              </span>
              <button type="button" className="name" title={tr('Открыть «{0}»', tr(p.name))} onClick={() => openModal('promptEdit', p.id)}>
                {tr(p.name)}
                {p.position === 'absolute' && !p.marker && <span className="muted"> {tr('· глубина')} {p.depth}</span>}
              </button>
              <span className="kind">{p.marker ? tr('маркер') : p.role === 'system' ? tr('система') : p.role === 'user' ? tr('пользователь') : tr('ассистент')}</span>
              <span className="toks">{tokensFor(p)}</span>
              <span className="edit-cell">
                <IconBtn size="sm" bare icon={<Pencil size={14} />} label={p.marker ? tr('Открыть') : tr('Изменить')} onClick={() => openModal('promptEdit', p.id)} />
              </span>
              <Switch checked={p.enabled} onChange={(v) => toggle(p.id, v)} />
            </div>
          ))}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <span className="sub">{tr('В последнем запросе')}</span>
        <button type="button" className="big-tokens" onClick={() => openModal('prompt')} title={tr('Показать состав промпта')}>
          {fmtNum(lastTokens)} {tr('токенов')}
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
  if (j.prompts && !j.prompt_order && j.maxContext) return { ...DEFAULT_PRESET, ...j, regex: Array.isArray(j.regex) ? j.regex.map((r: RegexScript) => ({ ...r, id: uid() })) : [], id: uid() };
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
    regex: Array.isArray(j.extensions?.regex_scripts) ? j.extensions.regex_scripts.map(regexFromST) : [],
  };
}

/** Что подставляется в маркеры — показываем в редакторе вместо текста. */
const MARKER_INFO: Record<string, string> = {
  chatHistory: 'История сообщений чата. Сюда же встают заметка автора и записи лорбука на глубине.',
  charDescription: 'Описание персонажа из карточки (в группе — описания всех участников).',
  charPersonality: 'Поле «Личность» из карточки персонажа.',
  scenario: 'Поле «Сценарий» из карточки персонажа.',
  personaDescription: 'Описание вашей персоны, если оно стоит «в промпте».',
  dialogueExamples: 'Примеры диалогов из карточки персонажа.',
  worldInfoBefore: 'Записи лорбука с позицией «до персонажа» и пересказ, если он стоит «до».',
  worldInfoAfter: 'Записи лорбука с позицией «после персонажа» и пересказ, если он стоит «после».',
};

/** Встроенные промпты, которые может заменить карточка персонажа. */
const CARD_OVERRIDE: Record<string, string> = {
  main: 'Если в карточке персонажа заполнен «Системный промпт», он заменит этот текст (в карточке можно вставить исходный через {{original}}).',
  jailbreak: 'Если в карточке заполнены «Инструкции после истории», они заменят этот текст ({{original}} — исходный).',
};

export function PromptEditorModal({ id: initialId }: { id: string }) {
  const [id, setId] = useState(initialId);
  const prompts = useStore((s) => activePreset(s).prompts);
  const presetName = useStore((s) => activePreset(s).name);
  const index = prompts.findIndex((x) => x.id === id);
  const p = prompts[index];
  const [d, setD] = useState<PromptItem | undefined>(p);
  if (!p || !d) return null;
  const dirty = JSON.stringify(d) !== JSON.stringify(p);
  const def = DEFAULT_PRESET.prompts.find((x) => x.id === p.id);
  const canReset = Boolean(def && !p.marker && def.content !== d.content);

  const save = () => updatePreset((x) => ({ ...x, prompts: x.prompts.map((y) => (y.id === id ? d : y)) }));
  const close = () => {
    if (dirty && !confirm(tr('Закрыть без сохранения изменений?'))) return;
    closeModal();
  };
  const go = (to: number) => {
    const next = prompts[to];
    if (!next) return;
    if (dirty) save();
    setId(next.id);
    setD(next);
  };
  const moveTo = (to: number) => {
    if (to < 0 || to >= prompts.length) return;
    updatePreset((x) => {
      const arr = [...x.prompts];
      const [it] = arr.splice(index, 1);
      arr.splice(to, 0, it);
      return { ...x, prompts: arr };
    });
  };

  return (
    <Modal
      title={
        <div className="col" style={{ gap: 2, minWidth: 0 }}>
          <h2 className="h2 ellipsis">{tr(d.name) || tr('Промпт')}</h2>
          <span className="sub">
            {tr('Пресет «{0}» · блок {1} из {2}', tr(presetName), index + 1, prompts.length)}
          </span>
        </div>
      }
      onClose={close}
      wide
      footer={
        <>
          {!p.system && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (!confirm(tr('Удалить промпт «{0}»?', tr(p.name)))) return;
                updatePreset((x) => ({ ...x, prompts: x.prompts.filter((y) => y.id !== id) }));
                closeModal();
              }}
            >
              <Trash2 size={15} /> {tr('Удалить')}
            </button>
          )}
          <span className="spacer" />
          {!p.marker && <span className="sub">{fmtNum(estimateTokens(d.content))} {tr('токенов')}</span>}
          <button type="button" className="btn" onClick={close}>
            {dirty ? tr('Отмена') : tr('Закрыть')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!dirty}
            onClick={() => {
              save();
              closeModal();
            }}
          >
            {tr('Сохранить')}
          </button>
        </>
      }
    >
      <div className="row wrap" style={{ gap: 8 }}>
        <IconBtn size="sm" icon={<ChevronLeft size={15} />} label={tr('Предыдущий блок')} disabled={index <= 0} onClick={() => go(index - 1)} />
        <IconBtn size="sm" icon={<ChevronRight size={15} />} label={tr('Следующий блок')} disabled={index >= prompts.length - 1} onClick={() => go(index + 1)} />
        <span className="spacer" />
        <button type="button" className="btn sm" disabled={index <= 0} onClick={() => moveTo(index - 1)}>
          <ArrowUp size={14} /> {tr('Выше')}
        </button>
        <button type="button" className="btn sm" disabled={index >= prompts.length - 1} onClick={() => moveTo(index + 1)}>
          <ArrowDown size={14} /> {tr('Ниже')}
        </button>
        {!p.marker && (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              const copy: PromptItem = { ...d, id: uid(), name: d.name + tr(' (копия)'), system: false };
              updatePreset((x) => {
                const arr = [...x.prompts];
                arr.splice(index + 1, 0, copy);
                return { ...x, prompts: arr };
              });
              if (dirty) save();
              setId(copy.id);
              setD(copy);
            }}
          >
            <Copy size={14} /> {tr('Копия')}
          </button>
        )}
      </div>
      <Switch label={tr('Включён')} checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} />
      {p.marker ? (
        <div className="dx-note">
          <b>{tr('Маркер')}</b> — {tr(MARKER_INFO[p.id] ?? 'Содержимое подставляется автоматически.')} {tr('Текст маркера редактируется в своём месте (карточка, персона, лорбук); здесь меняются порядок и включение.')}
        </div>
      ) : (
        <>
          <div className="grid2">
            <Field label={tr('Название')}>
              {/* встроенные названия хранятся ключами перевода — показываем на языке интерфейса */}
              <input className="input" value={tr(d.name)} onChange={(e) => setD({ ...d, name: e.target.value })} />
            </Field>
            <Field label={tr('Роль')}>
              <Select
                value={d.role}
                onChange={(v) => setD({ ...d, role: v })}
                options={[
                  { value: 'system', label: tr('Система') },
                  { value: 'user', label: tr('Пользователь') },
                  { value: 'assistant', label: tr('Ассистент') },
                ]}
              />
            </Field>
            <Field label={tr('Позиция')}>
              <Select
                value={d.position}
                onChange={(v) => setD({ ...d, position: v })}
                options={[
                  { value: 'relative', label: tr('По порядку в списке') },
                  { value: 'absolute', label: tr('На глубине в истории') },
                ]}
              />
            </Field>
            {d.position === 'absolute' && (
              <Field label={tr('Глубина')} hint={tr('0 — после последнего сообщения, 1 — перед ним и т.д.')}>
                <NumInput value={d.depth} min={0} max={999} onChange={(v) => setD({ ...d, depth: v })} />
              </Field>
            )}
          </div>
          {CARD_OVERRIDE[p.id] && <div className="dx-note">{tr(CARD_OVERRIDE[p.id])}</div>}
          <Field
            label={tr('Текст промпта')}
            hint={tr('Макросы: {{char}}, {{user}}, {{persona}}, {{description}}, {{scenario}}, {{random::а::б}}, {{roll:d20}}, {{getvar::имя}}, {{time}} — полный список в «Справке».')}
          >
            <textarea
              className="textarea scroll prompt-text"
              rows={14}
              value={d.content}
              onChange={(e) => setD({ ...d, content: e.target.value })}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                  e.preventDefault();
                  save();
                }
              }}
            />
          </Field>
          {canReset && (
            <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => def && setD({ ...d, content: def.content })}>
              <RotateCcw size={14} /> {tr('Вернуть стандартный текст')}
            </button>
          )}
        </>
      )}
    </Modal>
  );
}

