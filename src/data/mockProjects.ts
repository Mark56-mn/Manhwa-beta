import { Project } from '../types/manhwa';

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    title: 'Cyber Awakening: Neo Seoul',
    genre: 'Cyberpunk Action / Thriller',
    synopsis: 'In the neon-drenched megacity of 2142, a rogue netrunner uncovers a corporate conspiracy that threatens to digitize human consciousness without consent.',
    artStyle: 'Modern Dark Webtoon (Neon cyan & violet accents, high contrast panels)',
    status: 'in_production',
    updatedAt: '2026-10-16',
    coverImage: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&q=80&w=800',
    author: 'Studio Zero',
    targetAudience: '18-35 Seinen',
    storyBible: {
      premise: 'Megacorporation Synapse Corp controls the neural grid of Neo Seoul. When experimental memory extraction goes wrong, a low-level data courier gains access to the master mainframe.',
      logline: 'One hacker against an artificial deity governing human souls.',
      worldRules: [
        { id: 'r1', rule: 'Neural links require 5-second synchronization; overloading causes permanent memory decay.' },
        { id: 'r2', rule: 'Neo Seoul is divided into three vertical strata: Upper Spire (executives), Mid City (citizens), and The Undercity (refugees & hackers).' },
        { id: 'r3', rule: 'AI entities are restricted from physical embodiment by federal ordinance.' }
      ],
      characters: [
        {
          id: 'c1',
          name: 'Kaelen Vance',
          role: 'Lead Protagonist / Courier',
          description: 'Sleek dark cybernetic arm, hooded neural jacket with cyan fiber-optic seams, intense amber eyes.',
          visualAnchor: 'Glowing cyan hood trim plus scarred right cyber-arm',
          personality: 'Cynical on the surface, fiercely protective of refugees.'
        },
        {
          id: 'c2',
          name: 'Nova Ray',
          role: 'Rogue AI Construct',
          description: 'Holographic avatar with violet cascading hair and floating geometric data rings.',
          visualAnchor: 'Floating violet data halos and translucent quantum aura',
          personality: 'Calculated, rapidly developing self-awareness and dark humor.'
        },
        {
          id: 'c3',
          name: 'Director Thorne',
          role: 'Primary Antagonist',
          description: 'Immaculate tailored obsidian suit, cold cybernetic monocle, silver-tipped cane concealing an EMP blade.',
          visualAnchor: 'Obsidian monocle with red targeting reticle',
          personality: 'Calculated, merciless, obsessed with digital immortality.'
        }
      ],
      terminology: [
        { id: 't1', term: 'Synapse Grid', definition: 'The optical fiber network powering all cognitive functions in Neo Seoul.' },
        { id: 't2', term: 'Ghost-Loop', definition: 'A dangerous feedback loop where human consciousness gets trapped in recursive server memory.' },
        { id: 't3', term: 'Null-Zone', definition: 'An underground district shielded from corporate surveillance.' }
      ]
    },
    episodes: [
      {
        id: 'ep-1',
        episodeNumber: 1,
        title: 'Episode 1: The Null-Zone Drop',
        synopsis: 'Kaelen receives an encrypted courier package containing a sentient quantum drive, triggering a high-speed drone chase across the Undercity rooftops.',
        outline: [
          'Scene 1: Kaelen plugging into the neural rig in a dimly lit underground server den.',
          'Scene 2: Receiving the mysterious quantum capsule from an unknown informant.',
          'Scene 3: Synapse Corp security drones breach the perimeter.',
          'Scene 4: Rooftop parkour chase ending with a gravity leap into the neon fog.'
        ],
        scenes: [
          {
            id: 's1',
            sceneNumber: 1,
            setting: 'The Undercity - Basement Server Den',
            action: 'Kaelen eyes glow electric blue as neural jacks lock into his temples. Sparks fly from the overloaded terminal.',
            dialogue: 'Kaelen: "If this package is hot, Synapse security will trace my ping within sixty seconds."',
            narration: 'In the underbelly of Neo Seoul, every illegal data packet carries a death sentence.',
            sfx: '[BZZZZT] [HEAVY RAIN POURING ON METAL GRATES]',
            imagePrompt: 'Webtoon panel style, dark cyberpunk basement, glowing cyan neural cables, intense dramatic lighting, cinematic framing.'
          },
          {
            id: 's2',
            sceneNumber: 2,
            setting: 'Rooftop Sector 4 - Acid Rain Skyline',
            action: 'Assault drones descend from the smoggy clouds, laser sights painting the fugitive courier red.',
            dialogue: 'Nova Ray: "Warning! Three hunter-killer units locked onto your biometric signature."',
            narration: 'There is nowhere left to run when the sky itself belongs to the corporation.',
            sfx: '[WARNING ALARM] [DRONE ROTORS WHIRRING]',
            imagePrompt: 'Action manhwa panel, flying combat drones over towering cyberpunk skyscrapers, neon signs reflecting in puddles, dynamic speed lines.'
          }
        ]
      },
      {
        id: 'ep-2',
        episodeNumber: 2,
        title: 'Episode 2: Ghost in the Mainframe',
        synopsis: 'Unpacking the quantum drive reveals fragments of a lost human soul, leading Kaelen to seek out the legendary hacker syndicate known as the Null Collective.',
        outline: [
          'Scene 1: Analyzing the encrypted quantum drive in the hideout.',
          'Scene 2: Flashbacks to the Great System Crash of 2130.',
          'Scene 3: Encountering the Null Collective leader in the holographic bazaar.'
        ],
        scenes: [
          {
            id: 's1',
            sceneNumber: 1,
            setting: 'Null Collective Holographic Bazaar',
            action: 'Neon market stalls glowing with holographic merchant ads. Hooded figures trade encrypted memory chips.',
            dialogue: 'Syndicate Boss: "You brought us a live bomb wrapped in silicon, Vance."',
            narration: 'Secrets in Neo Seoul are traded like currency, and blood is the cheapest ink.',
            sfx: '[HOLO CHIMES] [CROWD MURMURS]',
            imagePrompt: 'Vibrant cyberpunk night market webtoon style, floating neon holographic banners, mysterious hooded figures, intricate detail.'
          }
        ]
      }
    ],
    approvals: [
      {
        id: 'app-1',
        artifactId: 'ep-1',
        artifactTitle: 'Episode 1: Script & Scenes',
        type: 'script',
        status: 'approved',
        approver: 'Studio Director',
        timestamp: '2026-10-15 14:30',
        notes: 'Demo sample record: this episode script is marked approved in the sample data. No rendered video, upload, or publication exists.',
        youtubeUploadState: 'not_uploaded'
      }
    ]
  },
  {
    id: 'proj-2',
    title: 'Shadow Monarch Chronicles',
    genre: 'Dark Fantasy / Dungeon RPG',
    synopsis: 'A lowest-rank hunter accidentally awakens an ancient Necromancer system that allows him to level up infinitely by claiming the shadows of fallen foes.',
    artStyle: 'Classic Shonen Manga (Deep ink blacks, purple magical aura, dynamic sword cuts)',
    status: 'draft',
    updatedAt: '2026-10-15',
    coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=800',
    author: 'Kuro Ink',
    targetAudience: '15-30 Shonen / Action',
    storyBible: {
      premise: 'Gates connecting our world to monster dungeons opened ten years ago. Awakened hunters rule society based on ranked magic cores.',
      logline: 'Rise from the weakest E-rank hunter to the sovereign of all shadows.',
      worldRules: [
        { id: 'sr1', rule: 'Hunters retain their initial awakened rank for life unless subjected to a rare second awakening.' },
        { id: 'sr2', rule: 'Monsters inside double dungeons possess higher intelligence and drop ancient rune artifacts.' }
      ],
      characters: [
        {
          id: 'sc1',
          name: 'Jinwoo Park',
          role: 'Shadow Monarch',
          description: 'Jet-black spiked hair, piercing purple eyes, dark leather assassin armor with violet rune embroidery.',
          visualAnchor: 'Piercing violet eye glow plus floating shadow soldiers',
          personality: 'Stoic, analytical, relentless in battle.'
        }
      ],
      terminology: [
        { id: 't1', term: 'Gate Break', definition: 'An emergency cataclysm when monsters overflow uncompleted dungeon gates.' }
      ]
    },
    episodes: [
      {
        id: 'ep-201',
        episodeNumber: 1,
        title: 'Episode 1: The Double Dungeon',
        synopsis: 'An ordinary low-rank raid party stumbles into a terrifying hidden sanctuary beneath a routine D-rank dungeon.',
        outline: [
          'Scene 1: Entering the gloomy D-rank cave.',
          'Scene 2: Discovering the colossal bronze doors with giant stone statues.'
        ],
        scenes: [
          {
            id: 'ss1',
            sceneNumber: 1,
            setting: 'Underground Dungeon Cave - Altar of the God',
            action: 'Gigantic stone statues holding massive stone tablets gaze down with glowing crimson eyes.',
            dialogue: 'Jinwoo: "Something is wrong... The air pressure in here is crushing our mana cores."',
            narration: 'Death does not announce itself with thunder; sometimes it wears the face of a stone deity.',
            sfx: '[RUMBLE] [STONE SLIDING]',
            imagePrompt: 'Dark fantasy webtoon style, colossal stone demon statue in gothic cavern, dramatic purple magical lighting, epic scale.'
          }
        ]
      }
    ],
    approvals: []
  }
];
