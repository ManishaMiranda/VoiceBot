/**
 * Office-humor quote library for the Colleague Voice Bot.
 * ≥ 50 quotes across four categories: office, meetings, technology, general.
 */

export interface Quote {
  quoteId: string;
  text: string;
  category: 'office' | 'meetings' | 'technology' | 'general';
  addedAt: string;
}

export const QUOTES: Quote[] = [
  // ── office (15) ──────────────────────────────────────────────────────────
  {
    quoteId: '11111111-0001-4000-8000-000000000001',
    text: "I'll just ping you on Slack — said five minutes before walking over anyway.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0002-4000-8000-000000000002',
    text: 'The printer is out of paper again. It has always been out of paper. It will always be out of paper.',
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0003-4000-8000-000000000003',
    text: "Hot desking: the art of spending 20 minutes finding a desk so you can spend 8 hours wishing you were home.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0004-4000-8000-000000000004',
    text: "The open-plan office was designed to encourage collaboration. It succeeded mainly at encouraging headphones.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0005-4000-8000-000000000005',
    text: "I'm not procrastinating. I'm doing background research on whether this task is worth doing.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0006-4000-8000-000000000006',
    text: "The kitchen fridge is a social experiment in passive aggression and optimism.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0007-4000-8000-000000000007',
    text: "Reply-all is the nuclear option of email. Use it wisely. Nobody uses it wisely.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0008-4000-8000-000000000008',
    text: "Out of office: I am currently ignoring your email in a more scenic location.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0009-4000-8000-000000000009',
    text: "The office plant has survived three reorganisations. It is the most resilient member of the team.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0010-4000-8000-000000000010',
    text: "Per my last email — the professional way of saying you clearly did not read my last email.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0011-4000-8000-000000000011',
    text: "The standing desk was supposed to make me healthier. Now I stand and stare at the same spreadsheet.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0012-4000-8000-000000000012',
    text: "Synergy: the word companies use when they want to do more with fewer people.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0013-4000-8000-000000000013',
    text: "I have a very important meeting at 4:55 PM on a Friday. It is called leaving.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0014-4000-8000-000000000014',
    text: "The best part of working from home is that the commute is exactly as long as I want it to be.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '11111111-0015-4000-8000-000000000015',
    text: "Dress for the job you want, they said. I want to be a person who works from a hammock.",
    category: 'office',
    addedAt: '2024-01-01T00:00:00.000Z',
  },

  // ── meetings (15) ────────────────────────────────────────────────────────
  {
    quoteId: '22222222-0001-4000-8000-000000000001',
    text: "This meeting could have been an email. This email could have been a thought.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0002-4000-8000-000000000002',
    text: "We'll circle back on that. Translation: we will never speak of this again.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0003-4000-8000-000000000003',
    text: "Let's take this offline — the meeting equivalent of 'we'll talk about this later' which also never happens.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0004-4000-8000-000000000004',
    text: "Can everyone see my screen? No. Can everyone hear me? Also no. Let's begin.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0005-4000-8000-000000000005',
    text: "The agenda said 30 minutes. The meeting said hold my coffee.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0006-4000-8000-000000000006',
    text: "You're on mute. You're still on mute. You will always be on mute.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0007-4000-8000-000000000007',
    text: "A brainstorm is a meeting where everyone agrees with the loudest person in the room.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0008-4000-8000-000000000008',
    text: "The recurring meeting that could be cancelled but never is — a monument to institutional inertia.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0009-4000-8000-000000000009',
    text: "Any questions? — asked at the end of a 90-minute presentation with two minutes left.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0010-4000-8000-000000000010',
    text: "The meeting started on time. I was not there. These two facts are related.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0011-4000-8000-000000000011',
    text: "Let's do a quick level-set. Nothing that follows will be quick.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0012-4000-8000-000000000012',
    text: "I'll send out the action items after the meeting. The action items will never be sent.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0013-4000-8000-000000000013',
    text: "The all-hands meeting: where leadership shares exciting news that was already on LinkedIn.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0014-4000-8000-000000000014',
    text: "We need to align on this. We have been aligning on this for six months.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '22222222-0015-4000-8000-000000000015',
    text: "The video call background filter is the only thing standing between professionalism and my laundry pile.",
    category: 'meetings',
    addedAt: '2024-01-01T00:00:00.000Z',
  },

  // ── technology (12) ──────────────────────────────────────────────────────
  {
    quoteId: '33333333-0001-4000-8000-000000000001',
    text: "The cloud is just someone else's computer having a bad day.",
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '33333333-0002-4000-8000-000000000002',
    text: "It works on my machine. Congratulations, we will ship your machine.",
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '33333333-0003-4000-8000-000000000003',
    text: "Have you tried turning it off and on again? — the most powerful sentence in IT.",
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '33333333-0004-4000-8000-000000000004',
    text: "The sprint is called a sprint because by the end of it you feel like you have run one.",
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '33333333-0005-4000-8000-000000000005',
    text: "Technical debt is just future you's problem, and future you is furious.",
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '33333333-0006-4000-8000-000000000006',
    text: "The documentation is up to date. The documentation has never been up to date.",
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '33333333-0007-4000-8000-000000000007',
    text: "A code review is where you discover that your colleagues have very strong opinions about variable names.",
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '33333333-0008-4000-8000-000000000008',
    text: "Microservices: the art of turning one problem into seventeen smaller problems that talk to each other.",
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '33333333-0009-4000-8000-000000000009',
    text: "The build is green. The build has never been green before. Nobody knows why it is green now.",
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '33333333-0010-4000-8000-000000000010',
    text: "AI will automate your job. First it will automate the part of your job you actually enjoy.",
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '33333333-0011-4000-8000-000000000011',
    text: "The password must contain a capital letter, a number, a symbol, and the tears of a developer.",
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '33333333-0012-4000-8000-000000000012',
    text: "Agile means we can change the requirements at any time. It does not mean we can change the deadline.",
    category: 'technology',
    addedAt: '2024-01-01T00:00:00.000Z',
  },

  // ── general (10) ─────────────────────────────────────────────────────────
  {
    quoteId: '44444444-0001-4000-8000-000000000001',
    text: "Hard work pays off eventually. Laziness pays off right now.",
    category: 'general',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '44444444-0002-4000-8000-000000000002',
    text: "I am not arguing. I am just explaining why I am right.",
    category: 'general',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '44444444-0003-4000-8000-000000000003',
    text: "The early bird gets the worm. The second mouse gets the cheese. Timing is everything.",
    category: 'general',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '44444444-0004-4000-8000-000000000004',
    text: "I have not failed. I have found ten thousand ways that will not work, and I am still finding more.",
    category: 'general',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '44444444-0005-4000-8000-000000000005',
    text: "Teamwork makes the dream work, unless the team is in a group chat that nobody reads.",
    category: 'general',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '44444444-0006-4000-8000-000000000006',
    text: "The light at the end of the tunnel is probably someone with a torch asking for more deliverables.",
    category: 'general',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '44444444-0007-4000-8000-000000000007',
    text: "Success is 1% inspiration and 99% not telling people what you actually think in meetings.",
    category: 'general',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '44444444-0008-4000-8000-000000000008',
    text: "If at first you don't succeed, redefine success.",
    category: 'general',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '44444444-0009-4000-8000-000000000009',
    text: "A deadline is a creative constraint. A missed deadline is a learning opportunity. A missed deadline again is a pattern.",
    category: 'general',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    quoteId: '44444444-0010-4000-8000-000000000010',
    text: "The best time to start was yesterday. The second best time is after this coffee.",
    category: 'general',
    addedAt: '2024-01-01T00:00:00.000Z',
  },
];
