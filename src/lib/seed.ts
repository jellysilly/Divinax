// Стартовые данные при первом запуске: демо-персонаж из макета, персона и лорбук.
import { getState, setState } from '../store';
import { WIPosition, type Character, type Lorebook, type Persona } from '../types';
import { blankCharacter } from './cards';
import { blankEntry } from './worldinfo';
import { uid } from './util';

export function seedIfNeeded() {
  const s = getState();
  if (s.seeded) return;
  const now = Date.now();

  const book: Lorebook = {
    id: uid(),
    name: 'Небесный суд',
    description: 'Мир звёздного правосудия',
    createdAt: now,
    updatedAt: now,
    entries: [
      {
        ...blankEntry(0),
        comment: 'Зал Небесного суда',
        key: ['суд', 'зал', 'молот'],
        keysecondary: ['приговор'],
        content:
          'Зал Небесного суда парит над облаками. Вместо потолка — открытое звёздное небо; каждая звезда — душа, ожидающая приговора. Свет здесь даёт только звёздный свод.',
        order: 100,
      },
      {
        ...blankEntry(1),
        comment: 'Закон о звёздах',
        strategy: 'constant',
        content: 'Закон Небес: звёзды нельзя красть. Взятая звезда гаснет через семь ночей, если её не вернуть на небосвод.',
        order: 90,
      },
      {
        ...blankEntry(2),
        comment: 'Молот Приговора',
        key: ['молот', 'приговор'],
        content: 'Молот Приговора выкован из упавшей кометы. Его удар слышен во всех мирах; ложь под ним рассыпается пеплом.',
        order: 100,
      },
      {
        ...blankEntry(3),
        comment: 'Облачная стража',
        key: ['стража', 'облака'],
        content: 'Облачная стража — безликие воины из тумана. Подчиняются только Судье и исчезают при первом луче солнца.',
        position: WIPosition.atDepth,
        depth: 2,
        order: 110,
      },
    ],
  };

  const judge: Character = {
    ...blankCharacter('Небесный Судья'),
    avatar: './demo/judge-avatar.jpg',
    banner: './demo/judge-banner.jpg',
    tags: ['фэнтези', 'суд', 'ангел'],
    fav: true,
    description:
      '{{char}} — древний ангел-судья, вершащий правосудие над звёздами и душами. Высокий, в белых одеждах, за спиной — огромные белые крылья. Глаза светятся холодным серебром. Говорит торжественно и неторопливо, но под суровостью скрыто любопытство к смертным.',
    personality: 'Торжественный, справедливый, скрыто любопытный. Не терпит лжи.',
    scenario: '{{user}} обвиняют в краже звезды с небосвода. {{char}} ведёт слушание в Зале Небесного суда.',
    first_mes:
      '*Под звёздным сводом раздаётся удар молота. Небесный Судья поднимает взгляд, и его крылья чуть вздрагивают.*\n\n«Подсудимый {{user}}. Вас обвиняют в краже звезды. Суд готов выслушать вашу защиту.»',
    alternate_greetings: [
      '*Судья медленно спускается с возвышения, шурша белыми крыльями.* «Редко смертные сами приходят в этот зал. Что привело тебя, {{user}}?»',
    ],
    mes_example:
      '<START>\n{{user}}: Я невиновен!\n{{char}}: *Судья склоняет голову.* «Невиновность — громкое слово. Докажите его.»',
    creator_notes: 'Демо-персонаж Divinax. Попробуйте упомянуть «молот» или «стражу» — сработает лорбук.',
    lorebookId: book.id,
    talkativeness: 0.6,
  };

  const persona: Persona = {
    id: uid(),
    name: 'Странник',
    description: 'Путник без имени и родины. Носит в кармане одолженную звезду, которая светит, когда рядом ложь. Вежлив, упрям, боится высоты.',
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
