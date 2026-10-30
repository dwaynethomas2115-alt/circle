import { AppState, Profile } from "../types";
const photo = (id: string, width = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
export const demoUsers: Profile[] = [
  {
    id: "alex",
    name: "Alex Morgan",
    username: "alexmorgan",
    avatar: photo("photo-1472099645785-5658abf4ff4e", 160),
    bio: "Collecting little moments with my favorite people.",
    email: "alex@example.com",
  },
  {
    id: "sarah",
    name: "Maya Chen",
    username: "mayachen",
    avatar: photo("photo-1580489944761-15a19d654956", 160),
    bio: "Mama. Memory keeper. Weekend explorer.",
  },
  {
    id: "james",
    name: "James Wilson",
    username: "jamesw",
    avatar: photo("photo-1500648767791-00dcc994a43e", 160),
    bio: "Good coffee and even better company.",
  },
  {
    id: "emma",
    name: "Emma Thompson",
    username: "emmat",
    avatar: photo("photo-1438761681033-6461ffad8d80", 160),
    bio: "Finding joy in the everyday.",
  },
  {
    id: "daniel",
    name: "Daniel Brooks",
    username: "danielb",
    avatar: photo("photo-1506794778202-cad84cf45f1d", 160),
    bio: "Football, friends, and everything in between.",
  },
  {
    id: "olivia",
    name: "Olivia Parker",
    username: "oliviap",
    avatar: photo("photo-1534528741775-53994a69daeb", 160),
    bio: "Your friendly neighborhood plant person.",
  },
];
export function createSeed(assets: Record<string, string> = {}): AppState {
  return {
    version: 1,
    currentUserId: "alex",
    users: demoUsers.map((x) => ({
      ...x,
      avatar:
        assets[
          `avatar-${({ sarah: "maya", emma: "sarah", olivia: "ben" } as Record<string, string>)[x.id] || x.id}`
        ] || x.avatar,
    })),
    theme: "light",
    blocks: [],
    reports: [],
    circles: [
      {
        id: "family",
        name: "Anastasia’s Circle",
        description:
          "The little moments are the big moments. A cozy corner for our family to share, celebrate, and stay close.",
        category: "Family",
        avatar: "🌼",
        cover: assets.forest || photo("photo-1519689680058-324335c77eba"),
        color: "#E7F0E4",
        discoverable: false,
        approvalRequired: true,
        ownerId: "sarah",
        createdAt: ago(50000),
      },
      {
        id: "school",
        name: "School Parents Circle",
        description:
          "A little more connected, from the classroom to the playground. Updates and conversations for our school community.",
        category: "School",
        avatar: "🎒",
        cover: assets.library || photo("photo-1503676260728-1c00da094a0b"),
        color: "#F6E9D6",
        discoverable: true,
        approvalRequired: true,
        ownerId: "emma",
        createdAt: ago(40000),
      },
      {
        id: "football",
        name: "Football Friends",
        description:
          "Match day plans, friendly rivalries, and the beautiful game. Bring your best takes and your favorite scarf.",
        category: "Hobby",
        avatar: "⚽",
        cover: assets.coast || photo("photo-1574629810360-7efbbe195018"),
        color: "#E2E9F4",
        discoverable: true,
        approvalRequired: true,
        ownerId: "alex",
        createdAt: ago(30000),
      },
      {
        id: "neighborhood",
        name: "Neighborhood Circle",
        description:
          "Good neighbors make a great neighborhood. Share a recommendation, lend a hand, or just say hello.",
        category: "Community",
        avatar: "🏡",
        cover: assets.neighborhood || photo("photo-1470770841072-f978cf4d019e"),
        color: "#ECE5F1",
        discoverable: true,
        approvalRequired: true,
        ownerId: "olivia",
        createdAt: ago(20000),
      },
      {
        id: "weekenders",
        name: "The Weekend Club",
        description:
          "Fresh air, long walks, and adventures a little closer to home. Find your next favorite weekend.",
        category: "Friends",
        avatar: "🌿",
        cover: assets.camping || photo("photo-1472396961693-142e6e269027"),
        color: "#DBECE5",
        discoverable: true,
        approvalRequired: true,
        ownerId: "james",
        createdAt: ago(10000),
      },
    ],
    members: [
      ...["alex", "sarah", "james", "emma", "olivia"].map((userId) => ({
        circleId: "family",
        userId,
        role: (userId === "sarah" ? "owner" : "member") as "owner" | "member",
        joinedAt: ago(40000),
      })),
      ...["alex", "sarah", "emma", "james"].map((userId) => ({
        circleId: "school",
        userId,
        role: (userId === "emma" ? "owner" : "member") as "owner" | "member",
        joinedAt: ago(30000),
      })),
      ...["alex", "james", "daniel"].map((userId) => ({
        circleId: "football",
        userId,
        role: (userId === "alex" ? "owner" : "member") as "owner" | "member",
        joinedAt: ago(20000),
      })),
      ...["alex", "olivia", "sarah", "emma"].map((userId) => ({
        circleId: "neighborhood",
        userId,
        role: (userId === "olivia" ? "owner" : "member") as "owner" | "member",
        joinedAt: ago(10000),
      })),
      {
        circleId: "weekenders",
        userId: "james",
        role: "owner",
        joinedAt: ago(10000),
      },
    ],
    requests: [
      {
        id: "request-daniel",
        circleId: "football",
        userId: "emma",
        status: "pending",
        createdAt: ago(32),
      },
    ],
    invitations: [
      {
        id: "invite-family",
        circleId: "family",
        code: "FAMILY2026",
        createdBy: "sarah",
        expiresAt: new Date(now + 7 * 86400000).toISOString(),
      },
    ],
    posts: [
      {
        id: "post-family",
        circleId: "family",
        authorId: "sarah",
        content:
          "Less screen time, more green time. A weekend wandering with our favorite people. These are the little moments that stay with you. 🌿",
        media: assets.forest || photo("photo-1476231682828-37e571bc172f"),
        mediaType: "image",
        attachments: [
          {
            uri: assets.forest || photo("photo-1476231682828-37e571bc172f"),
            type: "image",
          },
          {
            uri: assets.coast || photo("photo-1470770841072-f978cf4d019e"),
            type: "image",
          },
          {
            uri: assets.camping || photo("photo-1472396961693-142e6e269027"),
            type: "image",
          },
        ],
        createdAt: ago(24),
        reactions: ["alex", "james", "emma"],
        tag: "LITTLE MOMENTS",
      },
      {
        id: "post-school",
        circleId: "school",
        authorId: "emma",
        content:
          "A little reminder: the spring book fair is this Friday! 📚\n\nIf you have an hour to spare, we’d love a few more helping hands. Who’s in?",
        createdAt: ago(48),
        reactions: ["sarah", "james"],
        tag: "COMMUNITY UPDATE",
      },
      {
        id: "post-neighborhood",
        circleId: "neighborhood",
        authorId: "olivia",
        content:
          "The neighborhood is putting on quite a show this morning. A gentle reminder to take the scenic route home. 🌿",
        media: assets.coast || photo("photo-1470770841072-f978cf4d019e"),
        mediaType: "image",
        createdAt: ago(80),
        reactions: ["alex", "sarah"],
        tag: "AROUND THE CORNER",
      },
      {
        id: "post-football",
        circleId: "football",
        authorId: "daniel",
        content:
          "Same place, same crew, one big game. ⚽ Who’s joining us for the match this Saturday? I’ll grab the first round.",
        media: assets.camping || photo("photo-1522778119026-d647f0596c20"),
        mediaType: "image",
        createdAt: ago(125),
        reactions: ["james"],
        tag: "MATCH DAY",
      },
      {
        id: "post-weekenders",
        circleId: "weekenders",
        authorId: "james",
        content:
          "A private trail recommendation for club members. See you out there!",
        createdAt: ago(160),
        reactions: [],
      },
    ],
    comments: [
      {
        id: "comment-1",
        postId: "post-family",
        authorId: "emma",
        content: "The sweetest little moments! So much love for you all 💛",
        createdAt: ago(17),
      },
      {
        id: "comment-2",
        postId: "post-family",
        authorId: "james",
        content: "Making memories. That’s what it’s all about.",
        createdAt: ago(12),
      },
      {
        id: "comment-3",
        postId: "post-family",
        authorId: "sarah",
        content: "We missed you! Next picnic is a family one.",
        parentId: "comment-2",
        createdAt: ago(9),
      },
      {
        id: "comment-4",
        postId: "post-school",
        authorId: "alex",
        content: "Count me in for the morning shift!",
        createdAt: ago(30),
      },
    ],
    messages: [
      {
        id: "message-1",
        circleId: "family",
        authorId: "sarah",
        content: "Sunday lunch at ours? We’re thinking around 12:30 🌼",
        createdAt: ago(50),
      },
      {
        id: "message-2",
        circleId: "family",
        authorId: "james",
        content: "Wouldn’t miss it! I’ll bring something sweet.",
        createdAt: ago(42),
      },
      {
        id: "message-3",
        circleId: "family",
        authorId: "alex",
        content: "We’ll be there! Can’t wait to see everyone.",
        createdAt: ago(35),
      },
      {
        id: "message-4",
        circleId: "football",
        authorId: "daniel",
        content: "Saturday can’t come soon enough ⚽",
        createdAt: ago(20),
      },
      {
        id: "message-5",
        circleId: "school",
        authorId: "emma",
        content: "Thanks to everyone helping with the book fair!",
        createdAt: ago(75),
      },
      {
        id: "message-6",
        circleId: "neighborhood",
        authorId: "olivia",
        content: "Anyone need fresh rosemary? Our garden is overflowing 🌿",
        createdAt: ago(95),
      },
    ],
    notifications: [
      {
        id: "notification-1",
        userId: "alex",
        title: "A little love from Maya",
        body: "Maya reacted to a moment you shared.",
        type: "reaction",
        circleId: "family",
        postId: "post-family",
        read: false,
        createdAt: ago(10),
      },
      {
        id: "notification-2",
        userId: "alex",
        title: "Someone wants to join",
        body: "Emma requested access to Football Friends.",
        type: "request",
        circleId: "football",
        read: false,
        createdAt: ago(32),
      },
      {
        id: "notification-3",
        userId: "alex",
        title: "Your people have been sharing",
        body: "Catch up on the latest in Anastasia’s Circle.",
        type: "post",
        circleId: "family",
        postId: "post-family",
        read: true,
        createdAt: ago(60),
      },
    ],
  };
}
