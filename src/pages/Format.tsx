import { tr } from '../lib/i18n';
import { Copy, Download, Trash2, Upload } from 'lucide-react';
import { setState, toast, useStore } from '../store';
import type { ContextTemplate, FormatSettings, InstructTemplate, SysPromptPreset } from '../types';
import { Divider, Field, IconBtn, LazyInput, LazyTextarea, Panel, Select, Switch } from '../components/ui';
import { download, pickFiles, safeName, uid } from '../lib/util';

const setFormat = (p: Partial<FormatSettings>) => setState((s) => ({ format: { ...s.format, ...p } }));

function PresetBar<T extends { id: string; name: string }>({
  items,
  value,
  onSelect,
  onDuplicate,
  onDelete,
  onImport,
  exportName,
}: {
  items: T[];
  value: string;
  onSelect: (id: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onImport: (j: any, name: string) => void;
  exportName: string;
}) {
  const cur = items.find((i) => i.id === value);
  return (
    <div className="row">
      <Select className="grow" value={value} onChange={onSelect} options={items.map((i) => ({ value: i.id, label: tr(i.name) }))} />
      <IconBtn size="lg" icon={<Copy size={15} />} label={tr('Дублировать')} onClick={onDuplicate} />
      <IconBtn
        size="lg"
        icon={<Upload size={15} />}
        label={tr('Импорт (JSON)')}
        onClick={async () => {
          const [f] = await pickFiles('.json');
          if (!f) return;
          try {
            onImport(JSON.parse(await f.text()), f.name.replace(/\.json$/i, ''));
          } catch (e) {
            toast(tr('Ошибка импорта: ') + (e as Error).message, 'error');
          }
        }}
      />
      <IconBtn size="lg" icon={<Download size={15} />} label={tr('Экспорт')} onClick={() => cur && download(`${safeName(cur.name)}.json`, JSON.stringify(cur, null, 2))} />
      <IconBtn size="lg" className="danger" icon={<Trash2 size={15} />} label={tr('Удалить {0}', exportName)} disabled={items.length < 2} onClick={onDelete} />
    </div>
  );
}

export function FormatPage() {
  const f = useStore((s) => s.format);
  const contexts = useStore((s) => s.contextTemplates);
  const instructs = useStore((s) => s.instructTemplates);
  const sysPrompts = useStore((s) => s.sysPrompts);
  const ctx = contexts.find((c) => c.id === f.contextId) ?? contexts[0];
  const ins = instructs.find((c) => c.id === f.instructId) ?? instructs[0];
  const sys = sysPrompts.find((c) => c.id === f.sysPromptId) ?? sysPrompts[0];

  const setCtx = (p: Partial<ContextTemplate>) => setState((s) => ({ contextTemplates: s.contextTemplates.map((c) => (c.id === ctx.id ? { ...c, ...p } : c)) }));
  const setIns = (p: Partial<InstructTemplate>) => setState((s) => ({ instructTemplates: s.instructTemplates.map((c) => (c.id === ins.id ? { ...c, ...p } : c)) }));
  const setSys = (p: Partial<SysPromptPreset>) => setState((s) => ({ sysPrompts: s.sysPrompts.map((c) => (c.id === sys.id ? { ...c, ...p } : c)) }));

  return (
    <div className="cols wrap-md">
      <Panel className="fill" style={{ flex: '1 1 0' }} title={tr('Шаблон контекста')}>
        <div className="body scroll grow" style={{ paddingRight: 4 }}>
          <Field label={tr('Шаблон')}>
            <PresetBar
              items={contexts}
              value={ctx.id}
              exportName={tr('шаблон')}
              onSelect={(id) => setFormat({ contextId: id })}
              onDuplicate={() => {
                const c = { ...ctx, id: uid(), name: ctx.name + tr(' (копия)') };
                setState((s) => ({ contextTemplates: [...s.contextTemplates, c], format: { ...s.format, contextId: c.id } }));
              }}
              onDelete={() => setState((s) => {
                const rest = s.contextTemplates.filter((c) => c.id !== ctx.id);
                return { contextTemplates: rest, format: { ...s.format, contextId: rest[0].id } };
              })}
              onImport={(j, name) => {
                const c: ContextTemplate = {
                  id: uid(),
                  name: j.name ?? name,
                  storyString: j.story_string ?? j.storyString ?? '',
                  exampleSeparator: j.example_separator ?? j.exampleSeparator ?? '***',
                  chatStart: j.chat_start ?? j.chatStart ?? '***',
                  collapseNewlines: j.trim_sentences !== undefined ? true : j.collapseNewlines ?? true,
                  alwaysAddCharName: j.always_force_name2 ?? j.alwaysAddCharName ?? false,
                  trimIncomplete: j.trim_sentences ?? j.trimIncomplete ?? false,
                };
                setState((s) => ({ contextTemplates: [...s.contextTemplates, c], format: { ...s.format, contextId: c.id } }));
              }}
            />
          </Field>
          <Field label={tr('Строка истории')} hint={tr('{{#if description}}…{{/if}} — блок выводится, только если поле не пустое')}>
            <LazyTextarea className="textarea mono" rows={9} value={ctx.storyString} onCommit={(v) => setCtx({ storyString: v })} />
          </Field>
          <div className="grid2">
            <Field label={tr('Разделитель примеров')}>
              <LazyInput className="input mono" value={ctx.exampleSeparator} onCommit={(v) => setCtx({ exampleSeparator: v })} />
            </Field>
            <Field label={tr('Начало чата')}>
              <LazyInput className="input mono" value={ctx.chatStart} onCommit={(v) => setCtx({ chatStart: v })} />
            </Field>
          </div>
          <div className="col" style={{ gap: 10 }}>
            <Switch label={tr('Сворачивать пустые строки')} checked={ctx.collapseNewlines} onChange={(v) => setCtx({ collapseNewlines: v })} />
            <Switch label={tr('Всегда добавлять имя персонажа')} checked={ctx.alwaysAddCharName} onChange={(v) => setCtx({ alwaysAddCharName: v })} />
            <Switch label={tr('Обрезать незаконченные предложения')} checked={ctx.trimIncomplete} onChange={(v) => setCtx({ trimIncomplete: v })} />
          </div>
        </div>
      </Panel>

      <Panel className="fill" style={{ flex: '1 1 0' }} title={tr('Режим Instruct')} actions={<Switch checked={f.instructEnabled} onChange={(v) => setFormat({ instructEnabled: v })} />}>
        <div className="body scroll grow" style={{ paddingRight: 4, opacity: f.instructEnabled ? 1 : 0.6 }}>
          <Field label={tr('Пресет')}>
            <PresetBar
              items={instructs}
              value={ins.id}
              exportName={tr('пресет')}
              onSelect={(id) => setFormat({ instructId: id })}
              onDuplicate={() => {
                const c = { ...ins, id: uid(), name: ins.name + tr(' (копия)') };
                setState((s) => ({ instructTemplates: [...s.instructTemplates, c], format: { ...s.format, instructId: c.id } }));
              }}
              onDelete={() => setState((s) => {
                const rest = s.instructTemplates.filter((c) => c.id !== ins.id);
                return { instructTemplates: rest, format: { ...s.format, instructId: rest[0].id } };
              })}
              onImport={(j, name) => {
                const c: InstructTemplate = {
                  id: uid(),
                  name: j.name ?? name,
                  systemPrefix: j.system_sequence ?? j.systemPrefix ?? '',
                  systemSuffix: j.system_suffix ?? j.systemSuffix ?? '',
                  userPrefix: j.input_sequence ?? j.userPrefix ?? '',
                  userSuffix: j.input_suffix ?? j.userSuffix ?? '',
                  assistantPrefix: j.output_sequence ?? j.assistantPrefix ?? '',
                  assistantSuffix: j.output_suffix ?? j.assistantSuffix ?? '',
                  stopSequence: j.stop_sequence ?? j.stopSequence ?? '',
                  wrap: j.wrap ?? false,
                  names: j.names_behavior ? j.names_behavior !== 'none' : j.names ?? true,
                };
                setState((s) => ({ instructTemplates: [...s.instructTemplates, c], format: { ...s.format, instructId: c.id } }));
              }}
            />
          </Field>
          <div className="grid2">
            <SeqField label={tr('Префикс системы')} value={ins.systemPrefix} onCommit={(v) => setIns({ systemPrefix: v })} />
            <SeqField label={tr('Суффикс системы')} value={ins.systemSuffix} onCommit={(v) => setIns({ systemSuffix: v })} />
            <SeqField label={tr('Префикс пользователя')} value={ins.userPrefix} onCommit={(v) => setIns({ userPrefix: v })} />
            <SeqField label={tr('Суффикс пользователя')} value={ins.userSuffix} onCommit={(v) => setIns({ userSuffix: v })} />
            <SeqField label={tr('Префикс ассистента')} value={ins.assistantPrefix} onCommit={(v) => setIns({ assistantPrefix: v })} />
            <SeqField label={tr('Суффикс ассистента')} value={ins.assistantSuffix} onCommit={(v) => setIns({ assistantSuffix: v })} />
            <SeqField label={tr('Стоп-последовательность')} value={ins.stopSequence} onCommit={(v) => setIns({ stopSequence: v })} />
          </div>
          <div className="col" style={{ gap: 10 }}>
            <Switch label={tr('Добавлять имена к сообщениям')} checked={ins.names} onChange={(v) => setIns({ names: v })} />
            <Switch label={tr('Переносы строк вокруг последовательностей')} checked={ins.wrap} onChange={(v) => setIns({ wrap: v })} />
            <Switch label={tr('Применять к Chat Completion')} checked={f.instructForChat} onChange={(v) => setFormat({ instructForChat: v })} hint={tr('промпт собирается одной строкой в сообщении')} />
          </div>
          <div className="sub">
            {tr('Режим Instruct нужен для Text Completion: он оборачивает реплики в формат, на котором обучена модель. \\n в полях — перенос строки.')}
          </div>
        </div>
      </Panel>

      <Panel className="fill" style={{ flex: '1 1 0' }} title={tr('Системный промпт')} actions={<Switch checked={f.sysPromptEnabled} onChange={(v) => setFormat({ sysPromptEnabled: v })} />}>
        <div className="body scroll grow" style={{ paddingRight: 4 }}>
          <Field label={tr('Пресет')}>
            <PresetBar
              items={sysPrompts}
              value={sys.id}
              exportName={tr('промпт')}
              onSelect={(id) => setFormat({ sysPromptId: id })}
              onDuplicate={() => {
                const c = { ...sys, id: uid(), name: sys.name + tr(' (копия)') };
                setState((s) => ({ sysPrompts: [...s.sysPrompts, c], format: { ...s.format, sysPromptId: c.id } }));
              }}
              onDelete={() => setState((s) => {
                const rest = s.sysPrompts.filter((c) => c.id !== sys.id);
                return { sysPrompts: rest, format: { ...s.format, sysPromptId: rest[0].id } };
              })}
              onImport={(j, name) => {
                const c = { id: uid(), name: j.name ?? name, content: j.content ?? '' };
                setState((s) => ({ sysPrompts: [...s.sysPrompts, c], format: { ...s.format, sysPromptId: c.id } }));
              }}
            />
          </Field>
          <LazyTextarea className="textarea serif" rows={7} value={sys.content} onCommit={(v) => setSys({ content: v })} />
          <div className="sub" style={{ marginTop: -8 }}>
            {tr('В Chat Completion заменяет «Основной промпт» менеджера промптов, если включён.')}
          </div>
          <Divider />
          <Field label={tr('Токенизатор')}>
            <Select
              value={f.tokenizer}
              onChange={(v) => setFormat({ tokenizer: v })}
              options={[
                { value: 'auto', label: tr('Лучшее совпадение (авто)') },
                { value: 'chars', label: tr('По символам (~4 на токен)') },
                { value: 'words', label: tr('По словам') },
              ]}
            />
          </Field>
          <Field label={tr('Свои стоп-строки')} hint={tr('JSON-массив строк')}>
            <LazyInput
              className="input mono"
              value={f.customStops}
              onCommit={(v) => {
                try {
                  JSON.parse(v || '[]');
                  setFormat({ customStops: v });
                } catch {
                  toast(tr('Нужен JSON-массив, например ["\\n{{user}}:"]'), 'error');
                }
              }}
            />
          </Field>
          <div className="grid2">
            <Field label={tr('Начало рассуждений')}>
              <LazyInput className="input mono" value={f.reasoningPrefix} onCommit={(v) => setFormat({ reasoningPrefix: v })} />
            </Field>
            <Field label={tr('Конец рассуждений')}>
              <LazyInput className="input mono" value={f.reasoningSuffix} onCommit={(v) => setFormat({ reasoningSuffix: v })} />
            </Field>
          </div>
          <Switch label={tr('Извлекать рассуждения из ответа')} checked={f.autoParseReasoning} onChange={(v) => setFormat({ autoParseReasoning: v })} />
          <Switch label={tr('Показывать рассуждения в чате')} checked={f.showReasoning} onChange={(v) => setFormat({ showReasoning: v })} />
        </div>
      </Panel>
    </div>
  );
}

// Последовательности показываем с видимыми \n
function SeqField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  return (
    <Field label={label}>
      <LazyInput className="input mono" value={value.replace(/\n/g, '\\n')} onCommit={(v) => onCommit(v.replace(/\\n/g, '\n'))} />
    </Field>
  );
}
