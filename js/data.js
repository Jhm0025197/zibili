const cover = (isbn) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`

export const LIBRARY = {
  name: 'Zibili',
  short: 'Zibili',
  tagline: 'Read and listen with your library card.',
}

export const NAV = [
  {
    id: 'use',
    label: 'Use Your Library',
    columns: [
      {
        heading: 'Welcome',
        links: [
          { label: 'Get a Library Card', to: '/page/get-a-card' },
          { label: 'Renew Your Library Card', to: '/page/get-a-card' },
          { label: 'Discover & Go', to: '/page/discover-go' },
          { label: 'Children', to: '/page/children' },
          { label: 'Teens', to: '/page/teens' },
        ],
      },
      {
        heading: 'Visit',
        links: [
          { label: 'Hours & Locations', to: '/page/locations' },
          { label: 'Main Library', to: '/page/locations' },
          { label: 'All Branches', to: '/page/locations' },
          { label: 'Book a Meeting Room', to: '/page/locations' },
        ],
      },
      {
        heading: 'Borrow',
        links: [
          { label: 'Browse the Catalog', to: '/library/spotlight-popular/page-1' },
          { label: 'eBooks & Audiobooks', to: '/library/spotlight-popular/page-1' },
          { label: 'Borrow Toys', to: '/page/children' },
          { label: 'Tool Lending Library', to: '/page/adults' },
        ],
      },
      {
        heading: 'Computers',
        links: [
          { label: 'Public Computers & WiFi', to: '/page/computers' },
          { label: 'Printing & Scanning', to: '/page/computers' },
          { label: 'Hotspots to Borrow', to: '/page/computers' },
        ],
      },
      {
        heading: 'Stay In Touch',
        links: [
          { label: 'Contact Us', to: '/page/contact' },
          { label: 'Newsletter', to: '/page/contact' },
          { label: 'FAQs', to: '/page/faqs' },
        ],
      },
    ],
  },
  {
    id: 'rlw',
    label: 'Read, Listen, Watch',
    columns: [
      {
        heading: 'Catalog',
        links: [
          { label: 'Browse the Catalog', to: '/library/spotlight-popular/page-1' },
          { label: 'New at OPL', to: '/library/spotlight-popular/page-1?list=new' },
          { label: 'OPL Staff Picks', to: '/library/spotlight-popular/page-1?list=picks' },
          { label: 'Awards', to: '/library/spotlight-popular/page-1?list=awards' },
        ],
      },
      {
        heading: 'Read',
        links: [
          { label: 'eBooks', to: '/library?format=ebook' },
          { label: 'Newspapers & Magazines', to: '/library?format=magazine' },
          { label: 'Large Print', to: '/library' },
        ],
      },
      {
        heading: 'eLibrary',
        links: [
          { label: 'Libby eBooks & Audiobooks', to: '/library/spotlight-popular/page-1' },
          { label: 'Available Now', to: '/library/spotlight-popular/page-1?list=available' },
          { label: 'Popular', to: '/library/spotlight-popular/page-1' },
        ],
      },
      {
        heading: 'Watch',
        links: [
          { label: 'Streaming Movies & TV', to: '/page/watch' },
          { label: 'New on DVD', to: '/page/watch' },
          { label: 'Online & Recorded Programs', to: '/page/events' },
        ],
      },
    ],
  },
  {
    id: 'grow',
    label: 'Grow & Play',
    columns: [
      {
        heading: 'Storytime',
        links: [
          { label: 'Storytime at OPL', to: '/page/children' },
          { label: "All Kids' Events", to: '/page/events' },
        ],
      },
      {
        heading: 'Play',
        links: [
          { label: 'Borrow Toys', to: '/page/children' },
          { label: 'Play at the Library', to: '/page/children' },
        ],
      },
      {
        heading: 'Read',
        links: [
          { label: "Children's Books", to: '/library?audience=children' },
          { label: 'Picture Books', to: '/library?audience=children' },
          { label: 'Early Literacy', to: '/page/children' },
        ],
      },
      {
        heading: 'School',
        links: [
          { label: 'Homework Help', to: '/page/children' },
          { label: 'Student Cards', to: '/page/get-a-card' },
        ],
      },
    ],
  },
  {
    id: 'see',
    label: 'See & Do',
    columns: [
      {
        heading: 'See & Do',
        links: [
          { label: 'All Events', to: '/page/events' },
          { label: 'Book Clubs', to: '/page/events' },
          { label: 'Special Events & Celebrations', to: '/page/events' },
          { label: 'English Conversation Clubs', to: '/page/events' },
          { label: 'Gaming', to: '/page/events' },
        ],
      },
      {
        heading: 'Make & Fix',
        links: [
          { label: 'Tool Lending Library', to: '/page/adults' },
          { label: 'The Bike Fix', to: '/page/events' },
          { label: 'Seed Libraries', to: '/page/adults' },
        ],
      },
      {
        heading: 'Write',
        links: [
          { label: 'Writing Groups', to: '/page/events' },
          { label: 'NaNoWriMo', to: '/page/events' },
        ],
      },
      {
        heading: 'Get Support',
        links: [
          { label: 'Legal Help', to: '/page/adults' },
          { label: 'Social Services', to: '/page/adults' },
          { label: 'Teen Mental Health', to: '/page/teens' },
        ],
      },
    ],
  },
  {
    id: 'learn',
    label: 'Learn',
    columns: [
      {
        heading: 'Local',
        links: [
          { label: 'Black in the Bay', to: '/page/learn' },
          { label: 'Found in a Library Book', to: '/page/learn' },
          { label: 'Oakland History', to: '/page/learn' },
          { label: 'Discover & Go Museum Passes', to: '/page/discover-go' },
        ],
      },
      {
        heading: 'Education',
        links: [
          { label: 'Adult Literacy', to: '/page/learn' },
          { label: 'ESL & Citizenship', to: '/page/learn' },
          { label: 'Computer Classes', to: '/page/computers' },
        ],
      },
      {
        heading: 'Research',
        links: [
          { label: 'Online Research', to: '/page/learn' },
          { label: 'Job & Career', to: '/page/learn' },
          { label: 'Oakland History Center', to: '/page/learn' },
        ],
      },
      {
        heading: 'Interests',
        links: [
          { label: 'Language Learning', to: '/library' },
          { label: 'Crafts & DIY', to: '/page/events' },
          { label: 'Gardening', to: '/page/adults' },
        ],
      },
    ],
  },
]

export const HERO_SLIDES = [
  {
    id: 'card',
    title: 'Library Card Sign-Up Month',
    image: '/images/hero-card.png',
    kicker: 'September',
    text: 'Get a free library card this month and unlock ebooks, events, WiFi, and more.',
    cta: { label: 'Get a Library Card', to: '/page/get-a-card' },
  },
  {
    id: 'brookfield',
    title: 'Brookfield Branch is open again',
    image: '/images/news-brookfield.png',
    kicker: "What's New",
    text: 'Celebrate the grand reopening with community programs, a refreshed children’s room, and more.',
    cta: { label: 'See events', to: '/page/events' },
  },
  {
    id: 'teens',
    title: 'Teen Reading List',
    image: '/images/promo-teens.png',
    kicker: 'For Teens',
    text: 'Comics, games, music, hangout spaces, and the books everyone’s talking about.',
    cta: { label: 'Discover teens', to: '/page/teens' },
  },
  {
    id: 'seeds',
    title: '2026 Sewing and Mending Events',
    image: '/images/promo-seeds.png',
    kicker: 'Make & Fix',
    text: 'Bring a garment, learn a stitch, and leave with something mended — plus seeds to grow at home.',
    cta: { label: "Let's grow", to: '/page/adults' },
  },
  {
    id: 'author',
    title: 'September Meet the Authors',
    image: '/images/event-author.png',
    kicker: 'Featured',
    text: 'Talks, mocktails, and new releases with authors visiting Main Library this month.',
    cta: { label: 'Browse events', to: '/page/events' },
  },
]

export const NEWS = [
  {
    id: 'n1',
    type: 'News',
    title: 'OPL Celebrates Grand Reopening of Brookfield Branch',
    image: '/images/news-brookfield.png',
    to: '/page/news',
  },
  {
    id: 'n2',
    type: 'News',
    title: 'A year in review: programs, branches, and the people who make OPL',
    image: '/images/news-overview.png',
    to: '/page/news',
  },
  {
    id: 'n3',
    type: 'Staff list',
    title: 'Staff picks: what we’re reading this September',
    image: '/images/promo-teens.png',
    to: '/library?list=picks',
  },
]

export const EVENTS = [
  {
    id: 'e1',
    title: 'Sprout Pop Up!',
    series: true,
    date: 'Sep 1st | 1:00pm - 3:00pm',
    place: 'Golden Gate Branch',
    image: '/images/event-sprout.png',
    audience: 'adults',
    open: true,
  },
  {
    id: 'e2',
    title: 'Chair Yoga',
    date: 'Sept 2nd | 10:00am–11:00am',
    place: 'Various locations, dates, and times',
    image: '/images/event-yoga.png',
    audience: 'adults',
    open: true,
  },
  {
    id: 'e3',
    title: 'Meet the Author: Jennifer Newens Talk and Mocktail Demo',
    date: 'Sep 3rd | 6:00pm - 7:30pm',
    place: 'Main Library',
    image: '/images/event-author.png',
    audience: 'adults',
    open: true,
  },
  {
    id: 'e4',
    title: 'Storytime',
    date: 'Mon – Thu & Sat',
    place: 'Various Locations, dates, and times',
    image: '/images/event-storytime.png',
    audience: 'children',
    open: true,
    topic: 'Language Learning',
  },
  {
    id: 'e5',
    title: "Kids' Crochet Club",
    series: true,
    date: 'Sep 1st | 3:30pm - 4:30pm',
    place: 'Melrose Branch',
    image: '/images/event-crochet.png',
    audience: 'children',
    open: true,
    topic: 'Crafts & DIY',
  },
  {
    id: 'e6',
    title: 'Craft for Kids',
    series: true,
    date: 'Sep 2nd | 2:00pm - 3:00pm',
    place: 'Lakeview Branch',
    image: '/images/event-craft.png',
    audience: 'children',
    open: true,
    topic: 'Crafts & DIY',
  },
  {
    id: 'e7',
    title: 'Eastmont Anime Club',
    series: true,
    date: 'Sep 1st | 3:30pm - 4:30pm',
    place: 'Eastmont Branch',
    image: '/images/event-anime.png',
    audience: 'teens',
    open: true,
  },
  {
    id: 'e8',
    title: 'TEENS & TWEENS! Pokemon: Trading Card Game Club',
    series: true,
    date: 'Sep 1st | 4:00pm - 5:30pm',
    place: 'Fruitvale Branch',
    image: '/images/event-pokemon.png',
    audience: 'teens',
    open: true,
    topic: 'Games & Gaming',
  },
  {
    id: 'e9',
    title: 'Teen Hangout // Pasa Tiempo de Adolescentes',
    series: true,
    date: 'Sep 2nd | 2:30pm - 4:30pm',
    place: 'Fruitvale Branch',
    image: '/images/event-hangout.png',
    audience: 'teens',
    open: true,
  },
  {
    id: 'e10',
    title: 'ESL English Conversation Club',
    date: 'Tuesdays 4-5pm & Thursdays 6-7pm',
    place: 'Fruitvale, Temescal, and Main',
    image: '/images/event-esl.png',
    audience: 'adults',
    open: true,
  },
  {
    id: 'e11',
    title: 'The Bike Fix',
    date: 'Tuesdays & Fridays 2:30-5pm',
    place: 'MLK Jr and 81st Branches',
    image: '/images/event-bike.png',
    audience: 'adults',
    open: true,
  },
]

export const EXHIBITS = [
  {
    id: 'x1',
    month: 'Jul',
    day: '17',
    title: "All the News that's Fit to Build: Local News Dioramas",
    date: 'Jul 17th - Oct 3rd | All day',
    place: 'Oakland History Center',
  },
  {
    id: 'x2',
    month: 'Jul',
    day: '17',
    title: 'Oakland Youth Poet Laureate: The First 15 Years',
    date: 'Jul 17th - Oct 3rd | All day',
    place: 'Main Library',
  },
  {
    id: 'x3',
    month: 'Sep',
    day: '16',
    title: 'Anime Club at the Dimond Branch',
    date: 'Sep 16th | 4:00pm - 6:00pm',
    place: 'Dimond Branch',
  },
]

const DEMO_BOOKS = [
  {
    id: '12099213',
    title: 'The Women',
    author: 'Kristin Hannah',
    isbn: '9781250178633',
    cover: cover('9781250178633'),
    color: '#6b2b24',
    rating: 4.6,
    ratingsCount: 18420,
    audience: 'adults',
    lists: ['popular', 'new', 'picks'],
    series: null,
    description:
      'Women can be heroes. When twenty-year-old nursing student Frances “Frankie” McGrath hears these words, it is a revelation. Raised on idyllic Coronado Island and sheltered by her conservative parents, she has always prided herself on being the perfect daughter. But in 1965 the world is changing, and she suddenly imagines a different future for herself. When her brother ships out to serve in Vietnam, she impulsively joins the Army Nurse Corps and follows his path.\n\nAs green and inexperienced as the men sent to Vietnam to fight, Frankie is overwhelmed by the chaos and destruction of war. Each day she confronts the heartbreak of loss, the paralyzing fear of one mistake, and the disillusionment of finding the truth about what is really happening in Vietnam. That disillusionment only deepens as she returns home to the real America.\n\nThe Women is the story of one woman gone to war, but it shines a light on all women who put themselves in harm’s way and whose sacrifice and commitment to their country has too often been forgotten. A novel about deep friendships and bold patriotism, The Women is a novel of a novel — of healing and hope.',
    quote: 'A #1 New York Times bestseller. An intimate portrait of women who go to war — and the ones who wait for them.',
    subjects: ['Historical Fiction', 'Vietnam War', 'Women', 'Friendship', 'Literary'],
    publisher: "St. Martin's Press",
    released: 'February 6, 2024',
    pages: 480,
    isbn13: '9781250178633',
    language: 'English',
    formats: [
      { type: 'ebook', available: false, copies: 48, holds: 312, wait: 'About 9 weeks', duration: null },
      { type: 'audiobook', available: false, copies: 22, holds: 198, wait: 'About 12 weeks', duration: '14h 57m', narrator: 'Julia Whelan' },
    ],
    similar: ['the-nightingale', 'the-great-alone', 'tomorrow', 'lessons'],
  },
  {
    id: 'the-nightingale',
    title: 'The Nightingale',
    author: 'Kristin Hannah',
    isbn: '9780312577223',
    cover: cover('9780312577223'),
    color: '#1d3557',
    rating: 4.7,
    ratingsCount: 42100,
    audience: 'adults',
    lists: ['popular', 'picks'],
    description:
      'France, 1939. In the quiet village of Carriveau, Vianne Mauriac says goodbye to her husband, Antoine, as he heads for the Front. She doesn’t believe that the Nazis will invade France…but invade they do, in droves of marching soldiers, in caravans of trucks and tanks, in planes that fill the skies and drop bombs on the innocent.',
    subjects: ['Historical Fiction', 'World War II', 'France', 'Sisters'],
    publisher: 'St. Martin\'s Press',
    released: 'February 3, 2015',
    pages: 440,
    isbn13: '9780312577223',
    language: 'English',
    formats: [
      { type: 'ebook', available: true, copies: 30, holds: 4, wait: null },
      { type: 'audiobook', available: false, copies: 10, holds: 41, wait: 'About 6 weeks', duration: '17h 19m', narrator: 'Polly Stone' },
    ],
    similar: ['12099213', 'the-great-alone', 'all-the-light'],
  },
  {
    id: 'the-great-alone',
    title: 'The Great Alone',
    author: 'Kristin Hannah',
    isbn: '9780312577230',
    cover: cover('9780312577230'),
    color: '#2f4a3c',
    rating: 4.4,
    ratingsCount: 15600,
    audience: 'adults',
    lists: ['picks'],
    description:
      'Alaska, 1974. Unpredictable. Unforgiving. Untamed. For a family in crisis, the ultimate test of survival. Ernt Allbright, a former POW, comes home from the Vietnam war a changed and volatile man. When he loses yet another job, he makes an impulsive decision: he will move his family north, to Alaska, where they will live off the grid in America’s last true frontier.',
    subjects: ['Historical Fiction', 'Alaska', 'Family', 'Survival'],
    publisher: "St. Martin's Press",
    released: 'February 6, 2018',
    pages: 440,
    isbn13: '9780312577230',
    language: 'English',
    formats: [{ type: 'ebook', available: true, copies: 8, holds: 0, wait: null }],
    similar: ['12099213', 'the-nightingale'],
  },
  {
    id: 'fourth-wing',
    title: 'Fourth Wing',
    author: 'Rebecca Yarros',
    isbn: '9781649374042',
    cover: cover('9781649374042'),
    color: '#7a1f2b',
    rating: 4.7,
    ratingsCount: 50210,
    audience: 'adults',
    lists: ['popular', 'new'],
    series: { name: 'The Empyrean', position: 1 },
    description:
      'Twenty-year-old Violet Sorrengail was supposed to enter the Scribe Quadrant, living a quiet life among books and history. Now, the commanding general — also known as her tough-as-talons mother — has ordered Violet to join the hundreds of candidates striving to become the elite of Navarre: dragon riders.',
    subjects: ['Fantasy', 'Dragons', 'Romance', 'New Adult'],
    publisher: 'Entangled: Red Tower Books',
    released: 'May 2, 2023',
    pages: 512,
    isbn13: '9781649374042',
    language: 'English',
    formats: [
      { type: 'ebook', available: false, copies: 40, holds: 890, wait: 'About 18 weeks' },
      { type: 'audiobook', available: false, copies: 18, holds: 420, wait: 'About 21 weeks', duration: '20h 47m', narrator: 'Rebecca Soler' },
    ],
    similar: ['iron-flame', 'onyx-storm', 'acotar'],
  },
  {
    id: 'iron-flame',
    title: 'Iron Flame',
    author: 'Rebecca Yarros',
    isbn: '9781649374172',
    cover: cover('9781649374172'),
    color: '#3e1c22',
    rating: 4.5,
    ratingsCount: 30100,
    audience: 'adults',
    lists: ['popular'],
    series: { name: 'The Empyrean', position: 2 },
    description:
      'Everyone expected Violet Sorrengail to die during her first year at Basgiath War College. Now beginning her second year, she has nothing like the time to recover when a powerful new enemy threatens everything she cares about.',
    subjects: ['Fantasy', 'Dragons', 'Romance'],
    publisher: 'Entangled: Red Tower Books',
    released: 'November 7, 2023',
    pages: 640,
    isbn13: '9781649374172',
    language: 'English',
    formats: [{ type: 'ebook', available: false, copies: 28, holds: 510, wait: 'About 16 weeks' }],
    similar: ['fourth-wing', 'onyx-storm'],
  },
  {
    id: 'onyx-storm',
    title: 'Onyx Storm',
    author: 'Rebecca Yarros',
    isbn: '9781649374189',
    cover: cover('9781649377159'),
    color: '#1a1a1a',
    rating: 4.6,
    ratingsCount: 22100,
    audience: 'adults',
    lists: ['popular', 'new'],
    series: { name: 'The Empyrean', position: 3 },
    description:
      'After nearly eighteen months at Basgiath War College, Violet Sorrengail knows there’s no more time for lessons. It’s time to make a stand. And this time, Violet might be the one to lead it.',
    subjects: ['Fantasy', 'Dragons', 'Romance'],
    publisher: 'Entangled: Red Tower Books',
    released: 'January 21, 2025',
    pages: 544,
    isbn13: '9781649377159',
    language: 'English',
    formats: [
      { type: 'ebook', available: false, copies: 36, holds: 720, wait: 'About 22 weeks' },
      { type: 'audiobook', available: true, copies: 6, holds: 2, wait: null, duration: '19h 12m' },
    ],
    similar: ['fourth-wing', 'iron-flame'],
  },
  {
    id: 'project-hail-mary',
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    isbn: '9780593135204',
    cover: cover('9780593135204'),
    color: '#c45c26',
    rating: 4.8,
    ratingsCount: 38900,
    audience: 'adults',
    lists: ['popular', 'picks', 'available'],
    description:
      'Ryland Grace is the sole survivor on a desperate, last-chance mission — and if he fails, humanity and the earth itself will perish. Except that right now, he doesn’t know that. He can’t even remember his own name, let alone the nature of his assignment or how to complete it.',
    subjects: ['Science Fiction', 'Space', 'Adventure', 'Humor'],
    publisher: 'Ballantine Books',
    released: 'May 4, 2021',
    pages: 496,
    isbn13: '9780593135204',
    language: 'English',
    formats: [
      { type: 'ebook', available: true, copies: 16, holds: 3, wait: null },
      { type: 'audiobook', available: true, copies: 9, holds: 0, wait: null, duration: '16h 10m', narrator: 'Ray Porter' },
    ],
    similar: ['martian', 'tomorrow'],
  },
  {
    id: 'martian',
    title: 'The Martian',
    author: 'Andy Weir',
    isbn: '9780804139021',
    cover: cover('9780804139021'),
    color: '#b33a1a',
    rating: 4.6,
    ratingsCount: 51200,
    audience: 'adults',
    lists: ['available', 'picks'],
    description:
      'Six days ago, astronaut Mark Watney became one of the first people to walk on Mars. Now, he’s sure he’ll be the first person to die there. After a dust storm nearly kills him and forces his crew to evacuate while thinking him dead, Mark finds himself stranded and completely alone.',
    subjects: ['Science Fiction', 'Space', 'Survival', 'Humor'],
    publisher: 'Crown',
    released: 'February 11, 2014',
    pages: 387,
    isbn13: '9780804139021',
    language: 'English',
    formats: [{ type: 'ebook', available: true, copies: 12, holds: 0, wait: null }],
    similar: ['project-hail-mary'],
  },
  {
    id: 'atomic-habits',
    title: 'Atomic Habits',
    author: 'James Clear',
    isbn: '9780735211292',
    cover: cover('9780735211292'),
    color: '#1c1c1c',
    rating: 4.5,
    ratingsCount: 27400,
    audience: 'adults',
    lists: ['popular', 'available'],
    description:
      'No matter your goals, Atomic Habits offers a proven framework for improving every day. James Clear, one of the world’s leading experts on habit formation, reveals practical strategies that will teach you exactly how to form good habits, break bad ones, and master the tiny behaviors that lead to remarkable results.',
    subjects: ['Self-Improvement', 'Psychology', 'Business', 'Nonfiction'],
    publisher: 'Avery',
    released: 'October 16, 2018',
    pages: 320,
    isbn13: '9780735211292',
    language: 'English',
    formats: [
      { type: 'ebook', available: true, copies: 20, holds: 7, wait: null },
      { type: 'audiobook', available: false, copies: 8, holds: 54, wait: 'About 5 weeks', duration: '5h 35m', narrator: 'James Clear' },
    ],
    similar: ['lessons'],
  },
  {
    id: 'lessons',
    title: 'Lessons in Chemistry',
    author: 'Bonnie Garmus',
    isbn: '9780385547345',
    cover: cover('9780385547345'),
    color: '#c45b28',
    rating: 4.4,
    ratingsCount: 33100,
    audience: 'adults',
    lists: ['popular', 'picks', 'available'],
    description:
      'Chemist Elizabeth Zott is not your average woman. In fact, Elizabeth Zott would be the first to point out that there is no such thing as an average woman. But it’s the early 1960s and her all-male team at Hastings Research Institute takes a very unscientific view of equality.',
    subjects: ['Historical Fiction', 'Feminism', 'Humor', 'Chemistry'],
    publisher: 'Doubleday',
    released: 'April 5, 2022',
    pages: 400,
    isbn13: '9780385547345',
    language: 'English',
    formats: [{ type: 'ebook', available: true, copies: 14, holds: 2, wait: null }],
    similar: ['12099213', 'tomorrow'],
  },
  {
    id: 'tomorrow',
    title: 'Tomorrow, and Tomorrow, and Tomorrow',
    author: 'Gabrielle Zevin',
    isbn: '9780593321201',
    cover: cover('9780593321201'),
    color: '#2a6f6f',
    rating: 4.3,
    ratingsCount: 19800,
    audience: 'adults',
    lists: ['picks', 'awards'],
    description:
      'On a bitter-cold day, in the December of his junior year at Harvard, Sam Masur exits a subway car and sees, amid the hordes of people waiting on the platform, Sadie Green. He calls her name. For a moment, she pretends she hasn’t heard him, but then, she turns, and a game begins: a legendary collaboration that will launch them to stardom.',
    subjects: ['Literary Fiction', 'Games', 'Friendship', 'Coming of Age'],
    publisher: 'Knopf',
    released: 'July 5, 2022',
    pages: 416,
    isbn13: '9780593321201',
    language: 'English',
    formats: [
      { type: 'ebook', available: true, copies: 11, holds: 1, wait: null },
      { type: 'audiobook', available: true, copies: 5, holds: 0, wait: null, duration: '13h 52m', narrator: 'Jennifer Crystal Foley' },
    ],
    similar: ['lessons', 'project-hail-mary'],
  },
  {
    id: 'james',
    title: 'James',
    author: 'Percival Everett',
    isbn: '9780385550369',
    cover: cover('9780385550369'),
    color: '#4a3728',
    rating: 4.6,
    ratingsCount: 9100,
    audience: 'adults',
    lists: ['new', 'awards', 'picks'],
    description:
      'When the enslaved Jim overhears that he is about to be sold to a man in New Orleans, separated from his wife and daughter forever, he decides to hide on nearby Jackson Island until he can formulate a plan. Meanwhile, Huck Finn has faked his own death to escape his violent father, and the two embark on a dangerous and transcendent journey.',
    subjects: ['Literary Fiction', 'Historical Fiction', 'Retelling', 'American'],
    publisher: 'Doubleday',
    released: 'March 19, 2024',
    pages: 320,
    isbn13: '9780385550369',
    language: 'English',
    formats: [{ type: 'ebook', available: false, copies: 10, holds: 64, wait: 'About 8 weeks' }],
    similar: ['12099213', 'all-the-light'],
  },
  {
    id: 'all-the-light',
    title: 'All the Light We Cannot See',
    author: 'Anthony Doerr',
    isbn: '9781476746586',
    cover: cover('9781476746586'),
    color: '#1e3a5f',
    rating: 4.5,
    ratingsCount: 61200,
    audience: 'adults',
    lists: ['awards', 'picks'],
    description:
      'Marie-Laure lives with her father in Paris near the Museum of Natural History, where he works as the master of its thousands of locks. When she is six, Marie-Laure goes blind and her father builds a perfect miniature of their neighborhood so she can memorize it by touch and navigate her way home.',
    subjects: ['Historical Fiction', 'World War II', 'Literary'],
    publisher: 'Scribner',
    released: 'May 6, 2014',
    pages: 544,
    isbn13: '9781476746586',
    language: 'English',
    formats: [{ type: 'ebook', available: true, copies: 18, holds: 0, wait: null }],
    similar: ['the-nightingale', 'james'],
  },
  {
    id: 'acotar',
    title: 'A Court of Thorns and Roses',
    author: 'Sarah J. Maas',
    isbn: '9781635575569',
    cover: cover('9781635575569'),
    color: '#5c1a2e',
    rating: 4.4,
    ratingsCount: 72000,
    audience: 'adults',
    lists: ['popular'],
    series: { name: 'A Court of Thorns and Roses', position: 1 },
    description:
      'When nineteen-year-old huntress Feyre kills a wolf in the woods, a beast-like creature arrives to demand retribution for it. Dragged to a magical kingdom for her crime, Feyre discovers her captor is not at all what she expected.',
    subjects: ['Fantasy', 'Romance', 'Fairies', 'Young Adult'],
    publisher: 'Bloomsbury',
    released: 'May 5, 2015',
    pages: 432,
    isbn13: '9781635575569',
    language: 'English',
    formats: [{ type: 'ebook', available: false, copies: 24, holds: 210, wait: 'About 7 weeks' }],
    similar: ['fourth-wing'],
  },
  {
    id: 'hungry-caterpillar',
    title: 'The Very Hungry Caterpillar',
    author: 'Eric Carle',
    isbn: '9780399226908',
    cover: cover('9780399226908'),
    color: '#d24a28',
    rating: 4.9,
    ratingsCount: 8900,
    audience: 'children',
    lists: ['available', 'picks'],
    description:
      'Follow the tiny, very hungry caterpillar as he eats his way through a varied and very large quantity of food, until, full at last, he forms a cocoon around himself and goes to sleep.',
    subjects: ['Picture Book', 'Animals', 'Counting', 'Nature'],
    publisher: 'Philomel Books',
    released: 'March 23, 1994',
    pages: 26,
    isbn13: '9780399226908',
    language: 'English',
    formats: [{ type: 'ebook', available: true, copies: 8, holds: 0, wait: null }],
    similar: ['where-wild'],
  },
  {
    id: 'where-wild',
    title: 'Where the Wild Things Are',
    author: 'Maurice Sendak',
    isbn: '9780060254926',
    cover: cover('9780060254926'),
    color: '#3a5a3a',
    rating: 4.8,
    ratingsCount: 12100,
    audience: 'children',
    lists: ['available', 'awards'],
    description:
      'Max is sent to bed without supper and sails to the land of the Wild Things, where he is made king. A Caldecott Medal winner and one of the most beloved picture books of all time.',
    subjects: ['Picture Book', 'Imagination', 'Monsters'],
    publisher: 'HarperCollins',
    released: 'November 13, 2012',
    pages: 48,
    isbn13: '9780060254926',
    language: 'English',
    formats: [{ type: 'ebook', available: true, copies: 6, holds: 0, wait: null }],
    similar: ['hungry-caterpillar'],
  },
  {
    id: 'percy',
    title: 'The Lightning Thief',
    author: 'Rick Riordan',
    isbn: '9780786838653',
    cover: cover('9780786838653'),
    color: '#1b4f72',
    rating: 4.6,
    ratingsCount: 28400,
    audience: 'teens',
    lists: ['popular', 'available'],
    series: { name: 'Percy Jackson and the Olympians', position: 1 },
    description:
      'Percy Jackson is a good kid, but he can’t seem to focus on his schoolwork or control his temper. And lately, being away at boarding school is only getting worse — Percy could have sworn his pre-algebra teacher turned into a monster and tried to kill him.',
    subjects: ['Fantasy', 'Mythology', 'Adventure', 'Young Adult'],
    publisher: 'Disney Hyperion',
    released: 'March 1, 2006',
    pages: 377,
    isbn13: '9780786838653',
    language: 'English',
    formats: [
      { type: 'ebook', available: true, copies: 10, holds: 0, wait: null },
      { type: 'audiobook', available: true, copies: 4, holds: 1, wait: null, duration: '10h 16m', narrator: 'Jesse Bernstein' },
    ],
    similar: ['hunger-games'],
  },
  {
    id: 'hunger-games',
    title: 'The Hunger Games',
    author: 'Suzanne Collins',
    isbn: '9780439023481',
    cover: cover('9780439023481'),
    color: '#7a1f12',
    rating: 4.6,
    ratingsCount: 91000,
    audience: 'teens',
    lists: ['popular', 'picks'],
    series: { name: 'The Hunger Games', position: 1 },
    description:
      'In the ruins of a place once known as North America lies the nation of Panem, a shining Capitol surrounded by twelve outlying districts. The Capitol is harsh and cruel and keeps the districts in line by forcing them all to send one boy and one girl between the ages of twelve and eighteen to participate in the annual Hunger Games, a fight to the death on live TV.',
    subjects: ['Dystopia', 'Young Adult', 'Adventure', 'Science Fiction'],
    publisher: 'Scholastic Press',
    released: 'October 1, 2008',
    pages: 374,
    isbn13: '9780439023481',
    language: 'English',
    formats: [{ type: 'ebook', available: false, copies: 15, holds: 28, wait: 'About 3 weeks' }],
    similar: ['percy', 'fourth-wing'],
  },
  {
    id: 'housemaid',
    title: 'The Housemaid',
    author: 'Freida McFadden',
    isbn: '9781538742570',
    cover: cover('9781538742570'),
    color: '#5c2a4a',
    rating: 4.4,
    ratingsCount: 41200,
    audience: 'adults',
    lists: ['popular', 'new'],
    series: { name: 'The Housemaid', position: 1 },
    description:
      'Every day I clean the Winchesters’ beautiful house top to bottom. I collect their daughter from school. And I cook dinner for the whole family. I know where they keep the skeletons in their closet. Because that’s the help’s job, isn’t it? To see the things they don’t want you to see.',
    subjects: ['Thriller', 'Suspense', 'Domestic'],
    publisher: 'Mobius',
    released: 'April 26, 2022',
    pages: 336,
    isbn13: '9781538742570',
    language: 'English',
    formats: [
      { type: 'ebook', available: false, copies: 20, holds: 240, wait: 'About 11 weeks' },
      { type: 'audiobook', available: true, copies: 6, holds: 1, wait: null, duration: '9h 51m', narrator: 'Lauryn Allman' },
    ],
    similar: ['verity', 'lessons'],
  },
  {
    id: 'verity',
    title: 'Verity',
    author: 'Colleen Hoover',
    isbn: '9781538724736',
    cover: cover('9781538724736'),
    color: '#6b1d2a',
    rating: 4.3,
    ratingsCount: 68000,
    audience: 'adults',
    lists: ['popular'],
    description:
      'Lowen Ashleigh is a struggling writer on the brink of financial ruin when she accepts the job offer of a lifetime. Jeremy Crawford, husband of bestselling author Verity Crawford, has hired Lowen to complete the remaining books in a successful series his injured wife is unable to finish.',
    subjects: ['Thriller', 'Romance', 'Suspense'],
    publisher: 'Grand Central Publishing',
    released: 'October 26, 2021',
    pages: 336,
    isbn13: '9781538724736',
    language: 'English',
    formats: [{ type: 'ebook', available: false, copies: 18, holds: 160, wait: 'About 8 weeks' }],
    similar: ['housemaid', 'it-ends'],
  },
  {
    id: 'it-ends',
    title: 'It Ends with Us',
    author: 'Colleen Hoover',
    isbn: '9781501110368',
    cover: cover('9781501110368'),
    color: '#2c5f6e',
    rating: 4.4,
    ratingsCount: 79000,
    audience: 'adults',
    lists: ['popular'],
    series: { name: 'It Ends with Us', position: 1 },
    description:
      'Lily hasn’t always had it easy, but that’s never stopped her from working hard for the life she wants. She’s come a long way from the small town where she grew up — she graduated from college, moved to Boston, and started her own business. So when she feels a spark with a gorgeous neurosurgeon named Ryle Kincaid, everything in Lily’s life seems too good to be true.',
    subjects: ['Romance', 'Contemporary', 'Women'],
    publisher: 'Atria Books',
    released: 'August 2, 2016',
    pages: 384,
    isbn13: '9781501110368',
    language: 'English',
    formats: [{ type: 'ebook', available: true, copies: 12, holds: 4, wait: null }],
    similar: ['verity', 'happy-place'],
  },
  {
    id: 'happy-place',
    title: 'Happy Place',
    author: 'Emily Henry',
    isbn: '9780593441206',
    cover: cover('9780593441206'),
    color: '#d45b6a',
    rating: 4.2,
    ratingsCount: 24500,
    audience: 'adults',
    lists: ['popular', 'picks'],
    description:
      'Harriet and Wyn have been the perfect couple since they met in college. One thing they can’t agree on: where to spend the summer. Then Harriet is unceremoniously dumped. And she has to keep it a secret from their friends at the annual Maine getaway.',
    subjects: ['Romance', 'Contemporary', 'Humor'],
    publisher: 'Berkley',
    released: 'April 25, 2023',
    pages: 400,
    isbn13: '9780593441206',
    language: 'English',
    formats: [
      { type: 'ebook', available: true, copies: 9, holds: 0, wait: null },
      { type: 'audiobook', available: false, copies: 4, holds: 22, wait: 'About 4 weeks', duration: '11h 3m' },
    ],
    similar: ['it-ends', 'lessons'],
  },
  {
    id: 'crawdads',
    title: 'Where the Crawdads Sing',
    author: 'Delia Owens',
    isbn: '9780735219090',
    cover: cover('9780735219090'),
    color: '#2f5d50',
    rating: 4.5,
    ratingsCount: 88000,
    audience: 'adults',
    lists: ['popular', 'awards'],
    description:
      'For years, rumors of the “Marsh Girl” have haunted Barkley Cove, a quiet town on the North Carolina coast. So in late 1969, when handsome Chase Andrews is found dead, the locals immediately suspect Kya Clark, the so-called Marsh Girl.',
    subjects: ['Literary Fiction', 'Mystery', 'Coming of Age'],
    publisher: 'G.P. Putnam\'s Sons',
    released: 'August 14, 2018',
    pages: 384,
    isbn13: '9780735219090',
    language: 'English',
    formats: [{ type: 'ebook', available: true, copies: 14, holds: 2, wait: null }],
    similar: ['12099213', 'all-the-light'],
  },
  {
    id: 'demon-copperhead',
    title: 'Demon Copperhead',
    author: 'Barbara Kingsolver',
    isbn: '9780063251922',
    cover: cover('9780063251922'),
    color: '#7a4a1f',
    rating: 4.6,
    ratingsCount: 19800,
    audience: 'adults',
    lists: ['popular', 'awards', 'picks'],
    description:
      'Set in the mountains of southern Appalachia, Demon Copperhead is the story of a boy born to a teenage single mother in a single-wide trailer, with no assets beyond his dead father’s good looks and copper-colored hair, a caustic wit, and a fierce talent for survival.',
    subjects: ['Literary Fiction', 'Coming of Age', 'Appalachia'],
    publisher: 'Harper',
    released: 'October 18, 2022',
    pages: 560,
    isbn13: '9780063251922',
    language: 'English',
    formats: [{ type: 'ebook', available: false, copies: 8, holds: 33, wait: 'About 5 weeks' }],
    similar: ['james', 'crawdads'],
  },
]

async function loadCatalog() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const response = await fetch('/api/catalog', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timer)
    if (!response.ok) throw new Error('catalog')
    const data = await response.json()
    if (!Array.isArray(data) || data.length === 0) throw new Error('empty')
    return data
  } catch {
    return DEMO_BOOKS
  }
}

export const BOOKS = await loadCatalog()

export const LISTS = {
  popular: { title: 'Popular', blurb: 'Titles lots of people at your library are borrowing.' },
  new: { title: 'Newly added', blurb: 'Fresh arrivals in the digital collection.' },
  picks: { title: 'Staff picks', blurb: 'What Zibili librarians are reading right now.' },
  available: { title: 'Available now', blurb: 'Skip the wait — borrow these today.' },
  awards: { title: 'Awards', blurb: 'Prize winners and shortlisted titles in our collection.' },
}

export const PAGES = {
  'get-a-card': {
    title: 'Get a Library Card',
    kicker: 'Use Your Library',
    body: 'A free Zibili card unlocks books, ebooks, WiFi, computers, events, museum passes, and more. Sign up online in a few minutes, then visit any branch with photo ID to activate full borrowing.',
  },
  locations: {
    title: 'Hours & Locations',
    kicker: 'Visit',
    body: 'Zibili has a Main Library, seventeen branches, the Tool Lending Library, and the African American Museum and Library at Oakland. Use geolocation to find the closest open location, or browse the full list.',
  },
  events: {
    title: 'Events',
    kicker: 'See & Do',
    body: 'Storytimes, author talks, anime clubs, chair yoga, ESL conversation, and more. Filter by date, location, audience, or language to build a custom list.',
  },
  children: {
    title: 'For children',
    kicker: 'Grow & Play',
    body: 'Books, toys, storytimes, play spaces, and resources for children and caregivers. Borrow from the toy lending collection, drop in for storytime, and discover early literacy programs at every branch.',
  },
  teens: {
    title: 'For teens',
    kicker: 'Grow & Play',
    body: 'Books, games, music, crafts, comics, hangout spaces, and more for ages 12–18. Mental health resources, anime clubs, and homework help are here when you need them.',
  },
  adults: {
    title: 'For adults',
    kicker: 'Learn',
    body: 'Find content, events, special collections, and resources for adults 18+. Seed libraries, tool lending, legal help, and lifelong learning programs run year-round.',
  },
  learn: {
    title: 'Learn',
    kicker: 'Learn',
    body: 'Research databases, Oakland history, adult literacy, ESL, citizenship, and job help. Explore local collections including the Oakland History Center and AAMLO.',
  },
  computers: {
    title: 'Computers, WiFi & Printing',
    kicker: 'Use Your Library',
    body: 'Every OPL location offers WiFi. Public computers, ScanStations, and printing are available at branches. Black-and-white copies are 15¢; color is 50¢. Borrow a WiFi hotspot to take home.',
  },
  watch: {
    title: 'Watch',
    kicker: 'Read, Listen, Watch',
    body: 'Stream movies and TV with your library card, browse new DVDs, and catch recorded programs you missed in person.',
  },
  news: {
    title: "What's New",
    kicker: 'News',
    body: 'Branch reopenings, author visits, exhibits, and the stories behind your library. Follow OPL for the latest happenings.',
  },
  contact: {
    title: 'Contact the Library',
    kicker: 'Stay In Touch',
    body: 'Main Library: 125 14th Street, Oakland, CA 94612. Phone (510) 238-3134. We’d love your feedback — drop us a line or visit any public service desk.',
  },
  faqs: {
    title: 'Frequently Asked Questions',
    kicker: 'Help',
    body: 'Find the catalog search in the upper right of every page. Log In / My OPL is the account button. Cards are free. WiFi is available at every location.',
  },
  'discover-go': {
    title: 'Discover & Go',
    kicker: 'Learn',
    body: 'Use your library card for free or discounted museum passes across the Bay Area. Check the catalog for available dates and print or show your pass at the door.',
  },
}

export const PAGE_SIZE = 10

export function getBook(id) {
  return BOOKS.find((b) => b.id === id) || null
}

export function sortBooks(books, sort = 'popularity') {
  const copy = [...books]
  if (sort === 'title') copy.sort((a, b) => a.title.localeCompare(b.title))
  else if (sort === 'author') copy.sort((a, b) => a.author.localeCompare(b.author))
  else if (sort === 'released') copy.sort((a, b) => new Date(b.released) - new Date(a.released))
  else copy.sort((a, b) => (b.ratingsCount || 0) - (a.ratingsCount || 0))
  return copy
}

export function searchBooks(query, { list, format, audience, availability } = {}) {
  const q = (query || '').trim().toLowerCase()
  return BOOKS.filter((b) => {
    if (list && list !== 'all' && !(b.lists || []).includes(list)) return false
    if (audience && b.audience !== audience) return false
    if (format && !b.formats.some((f) => f.type === format)) return false
    if (availability === 'available') {
      const formats = format ? b.formats.filter((f) => f.type === format) : b.formats
      if (!formats.some((f) => f.available)) return false
    }
    if (!q) return true
    const hay = [b.title, b.author, (b.subjects || []).join(' '), b.series?.name || '', (b.course_codes || []).join(' ')].join(' ').toLowerCase()
    return hay.includes(q)
  })
}

export function relatedBooks(book) {
  const ids = book.similar || []
  const found = ids.map(getBook).filter(Boolean)
  if (found.length >= 6) return found
  const extra = BOOKS.filter((b) => b.id !== book.id && !ids.includes(b.id)).slice(0, 8 - found.length)
  return [...found, ...extra]
}
