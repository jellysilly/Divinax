// Стартовые данные при первом запуске: демо-персонаж, персона и лорбук на языке интерфейса.
import { getState, setState } from '../store';
import { WIPosition, type Character, type Lorebook, type Persona } from '../types';
import { blankCharacter } from './cards';
import { blankEntry } from './worldinfo';
import { getLang } from './i18n';
import { uid } from './util';

const TEXT = {
  ru: {
    bookName: 'Небесный суд',
    bookDesc: 'Мир звёздного правосудия',
    hall: ['Зал Небесного суда', ['суд', 'зал', 'молот'], ['приговор'], 'Зал Небесного суда парит над облаками. Вместо потолка — открытое звёздное небо; каждая звезда — душа, ожидающая приговора. Свет здесь даёт только звёздный свод.'],
    law: ['Закон о звёздах', 'Закон Небес: звёзды нельзя красть. Взятая звезда гаснет через семь ночей, если её не вернуть на небосвод.'],
    hammer: ['Молот Приговора', ['молот', 'приговор'], 'Молот Приговора выкован из упавшей кометы. Его удар слышен во всех мирах; ложь под ним рассыпается пеплом.'],
    guard: ['Облачная стража', ['стража', 'облака'], 'Облачная стража — безликие воины из тумана. Подчиняются только Судье и исчезают при первом луче солнца.'],
    name: 'Небесный Судья',
    tags: ['фэнтези', 'суд', 'ангел'],
    description:
      '{{char}} — древний ангел-судья, вершащий правосудие над звёздами и душами. Длинные белые волосы, маленькие крылья у висков и огромные белые крылья за спиной, белое платье. Глаза светятся холодным серебром. Говорит торжественно и неторопливо, но под суровостью скрыто любопытство к смертным.',
    personality: 'Торжественный, справедливый, скрыто любопытный. Не терпит лжи.',
    scenario: '{{user}} обвиняют в краже звезды с небосвода. {{char}} ведёт слушание в Зале Небесного суда.',
    first:
      '*Под звёздным сводом раздаётся удар молота. Небесный Судья поднимает взгляд, и крылья за спиной чуть вздрагивают.*\n\n«Подсудимый {{user}}. Вас обвиняют в краже звезды. Суд готов выслушать вашу защиту.»',
    alt: '*Судья медленно спускается с возвышения, шурша белыми крыльями.* «Редко смертные сами приходят в этот зал. Что привело тебя, {{user}}?»',
    examples: '<START>\n{{user}}: Я невиновен!\n{{char}}: *Судья склоняет голову.* «Невиновность — громкое слово. Докажите его.»',
    notes: 'Демо-персонаж Divinax. Попробуйте упомянуть «молот» или «стражу» — сработает лорбук.',
    persona: 'Странник',
    personaDesc: 'Путник без имени и родины. Носит в кармане одолженную звезду, которая светит, когда рядом ложь. Вежлив, упрям, боится высоты.',
  },
  en: {
    bookName: 'Celestial Court',
    bookDesc: 'A world of starlit justice',
    hall: ['Hall of the Celestial Court', ['court', 'hall', 'gavel'], ['verdict'], 'The Hall of the Celestial Court floats above the clouds. Instead of a ceiling there is the open starry sky; every star is a soul awaiting its verdict. The only light here comes from the starry vault.'],
    law: ['Law of the Stars', 'The Law of Heaven: stars must not be stolen. A taken star fades after seven nights unless it is returned to the sky.'],
    hammer: ['Gavel of Judgment', ['gavel', 'verdict'], 'The Gavel of Judgment was forged from a fallen comet. Its strike is heard in every world; lies crumble to ash beneath it.'],
    guard: ['Cloud Guard', ['guard', 'clouds'], 'The Cloud Guard are faceless warriors made of mist. They obey only the Judge and vanish at the first ray of sunlight.'],
    name: 'Celestial Judge',
    tags: ['fantasy', 'court', 'angel'],
    description:
      '{{char}} is an ancient angel-judge who passes judgment on stars and souls. Long white hair, small wings at the temples and vast white wings behind, a white dress. Eyes glow with cold silver. Speaks solemnly and slowly, yet hides a curiosity about mortals beneath the severity.',
    personality: 'Solemn, just, secretly curious. Cannot stand lies.',
    scenario: '{{user}} stands accused of stealing a star from the sky. {{char}} presides over the hearing in the Hall of the Celestial Court.',
    first:
      '*A gavel strikes beneath the starry vault. The Celestial Judge raises their gaze, and the wings behind them tremble slightly.*\n\n"Defendant {{user}}. You are accused of stealing a star. The court is ready to hear your defense."',
    alt: '*The Judge slowly descends from the dais, white wings rustling.* "Mortals rarely come to this hall of their own will. What brings you here, {{user}}?"',
    examples: '<START>\n{{user}}: I am innocent!\n{{char}}: *The Judge tilts their head.* "Innocence is a loud word. Prove it."',
    notes: 'Divinax demo character. Try mentioning the "gavel" or the "guard" — the lorebook will trigger.',
    persona: 'Wanderer',
    personaDesc: 'A traveler with no name and no homeland. Carries a borrowed star in their pocket that glows whenever a lie is near. Polite, stubborn, afraid of heights.',
  },
} as const;

export function seedIfNeeded() {
  const s = getState();
  if (s.seeded) return;
  const now = Date.now();
  const T = TEXT[getLang()];

  const book: Lorebook = {
    id: uid(),
    name: T.bookName,
    description: T.bookDesc,
    createdAt: now,
    updatedAt: now,
    entries: [
      { ...blankEntry(0), comment: T.hall[0], key: [...T.hall[1]], keysecondary: [...T.hall[2]], content: T.hall[3], order: 100 },
      { ...blankEntry(1), comment: T.law[0], strategy: 'constant', content: T.law[1], order: 90 },
      { ...blankEntry(2), comment: T.hammer[0], key: [...T.hammer[1]], content: T.hammer[2], order: 100 },
      {
        ...blankEntry(3),
        comment: T.guard[0],
        key: [...T.guard[1]],
        content: T.guard[2],
        position: WIPosition.atDepth,
        depth: 2,
        order: 110,
      },
    ],
  };

  const judge: Character = {
    ...blankCharacter(T.name),
    avatar: './demo/judge-avatar.jpg',
    banner: './demo/judge-banner.jpg',
    tags: [...T.tags],
    fav: true,
    description: T.description,
    personality: T.personality,
    scenario: T.scenario,
    first_mes: T.first,
    alternate_greetings: [T.alt],
    mes_example: T.examples,
    creator_notes: T.notes,
    lorebookId: book.id,
    talkativeness: 0.6,
  };

  const persona: Persona = {
    id: uid(),
    name: T.persona,
    description: T.personaDesc,
    position: 'in_prompt',
    depth: 2,
    role: 'system',
    createdAt: now,
  };

  setState({
    characters: { [judge.id]: judge },
    lorebooks: { [book.id]: book },
    personas: { [persona.id]: persona },
    defaultPersonaId: persona.id,
    seeded: true,
  });
}
