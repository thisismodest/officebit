// The story in "What is this?" (story.ts, docs/UI.md): each slide's picture (public/story/, taken by
// `npm run story-shots`), its title and its line. Just the words and pictures, so anything can read them.

export interface Slide {
  /** Its picture, in public/story/. */
  image: string;
  title: string;
  text: string;
  /** What the picture shows, for anyone who can't see it. */
  alt: string;
}

export const SLIDES: readonly Slide[] = [
  {
    image: 'town.png',
    title: 'This is your town',
    text: 'It woke up the moment you arrived, and it carries on without you. The story that unfolds is yours alone: nobody else’s town goes quite the same way. Pop back whenever you like to see what’s happened.',
    alt: 'The town from above: the Street, the Green, houses and the office.',
  },
  {
    image: 'work.png',
    title: 'Everyone has a life of their own',
    text: 'Each person has a personality and needs of their own. Nia works at the head office, and so do most of her friends.',
    alt: 'Nia at her desk in the office, with colleagues working round her.',
  },
  {
    image: 'lunch.png',
    title: 'Lunch from the trucks',
    text: 'At lunchtime the food trucks drive in, and the queue forms.',
    alt: 'Food trucks on the Street at lunchtime, with people queueing.',
  },
  {
    image: 'friends.png',
    title: 'Friends make plans',
    text: 'Frisbee on the Green, a picnic, a catch-up at the diner. Some even fall in love.',
    alt: 'Friends playing frisbee on the Green.',
  },
  {
    image: 'startup.png',
    title: 'Big ideas',
    text: 'The ambitious work on side projects in the evenings. Some become startups, and a crew builds them an office.',
    alt: 'A building crew putting up a new office on an empty lot.',
  },
  {
    image: 'evening.png',
    title: 'And it carries on',
    text: 'Evenings at the diner, a go on the arcade, then home to bed. Tomorrow it all starts again, a little differently.',
    alt: 'The Night Owl Diner in the evening, with people eating.',
  },
];
