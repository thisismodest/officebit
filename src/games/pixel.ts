// Pixel art for the games' controls and cards (docs/GAMES.md): little SVGs drawn square by square, crisp at any size.

/** A picture from rows of characters: `#` is filled, anything else empty. */
function art(rows: readonly string[], colour: string, label = ''): string {
  const w = rows[0]!.length;
  const h = rows.length;
  const squares = rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' ? [`M${x} ${y}h1v1h-1z`] : []))).join('');
  const name = label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"';
  return `<svg class="pixel" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"${name}><path d="${squares}" fill="${colour}"/></svg>`;
}

const STAR = ['....#....', '...###...', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.', '##.....##'];
const UP = ['...#...', '..###..', '.#####.', '#######', '..###..', '..###..'];

/** A star, gold if it's earned and dim if not. */
export function pixelStar(earned: boolean): string {
  return art(STAR, earned ? '#f3c969' : '#c9c3d6', earned ? 'Star' : 'No star');
}

/** An arrow pointing up, turned (by CSS: `[data-key]` on its button) for the other ways. */
export function pixelArrow(): string {
  return art(UP, 'currentColor');
}

/** A little pixel font (5×7), just the letters the games' signs use. */
const FONT: Record<string, readonly string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
};

/** A word in the pixel font, a pixel apart, with a dark shadow a pixel down and to the right. */
export function pixelWord(word: string, colour: string, shadow: string): string {
  const letters = [...word.toUpperCase()].map((c) => FONT[c] ?? FONT.A!);
  const w = letters.length * 6;
  const squares = (dx: number, dy: number) =>
    letters.flatMap((rows, i) => rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' ? [`M${i * 6 + x + dx} ${y + dy}h1v1h-1z`] : [])))).join('');
  return `<svg class="pixel" viewBox="0 0 ${w} 8" shape-rendering="crispEdges" role="img" aria-label="${word}"><path d="${squares(1, 1)}" fill="${shadow}"/><path d="${squares(0, 0)}" fill="${colour}"/></svg>`;
}

/** A cross, for closing. */
export function pixelCross(): string {
  return art(['#.....#', '##...##', '.##.##.', '..###..', '.##.##.', '##...##', '#.....#'], 'currentColor');
}

/** The go button's diamond, as rows of pixels across (the same on the button and in the screens' "◆ / SPACE"). */
export const DIAMOND = [1, 3, 5, 7, 5, 3, 1];

/** The go button: a round button drawn square by square (a dark rim, red, shaded underneath, a glint), a diamond on it. */
export function pixelGo(): string {
  // An odd size, so there's a middle pixel for the diamond's points.
  const size = 15;
  const middle = size / 2;
  const round = (x: number, y: number) => (x + 0.5 - middle) ** 2 + (y + 0.5 - middle) ** 2 <= (middle - 0.2) ** 2;
  // The diamond, on the middle pixel.
  const centre = Math.floor(size / 2);
  const diamond = (x: number, y: number) => {
    const across = DIAMOND[y - (centre - (DIAMOND.length - 1) / 2)];
    return across !== undefined && Math.abs(x - centre) <= (across - 1) / 2;
  };
  const colours: Record<string, string> = { rim: '#2a2033', red: '#e94f4f', shade: '#b8333c', glint: '#ff8a80', mark: '#f4f4f0' };
  const squares: Record<string, string[]> = { rim: [], red: [], shade: [], glint: [], mark: [] };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!round(x, y)) continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !round(x + dx!, y + dy!));
      // Shaded where the rim curves round underneath: two pixels in from it, following the curve.
      const part = edge ? 'rim' : diamond(x, y) ? 'mark' : !round(x, y + 2) ? 'shade' : x <= 4 && y <= 4 ? 'glint' : 'red';
      squares[part]!.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  const paths = Object.entries(squares).map(([part, d]) => `<path d="${d.join('')}" fill="${colours[part]}"/>`).join('');
  return `<svg class="pixel" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" aria-hidden="true">${paths}</svg>`;
}

/** A joystick's four buttons, each with its arrow. */
export function joystick(): string {
  return (['up', 'left', 'right', 'down'] as const).map((key) => `<button type="button" data-key="${key}" aria-label="${key[0]!.toUpperCase()}${key.slice(1)}">${pixelArrow()}</button>`).join('');
}
