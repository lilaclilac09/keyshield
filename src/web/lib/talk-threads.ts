export interface TalkTurn {
  id: string;
  role: 'you' | 'playbook';
  title: string;
  hint: string;
  body: string[];
}

export interface TalkThread {
  id: string;
  title: string;
  subtitle: string;
  turns: TalkTurn[];
}

export const TALK_THREADS: TalkThread[] = [
  {
    id: 'review',
    title: '草稿 → 审阅 → 合入',
    subtitle: 'Draft / staging → second prompt → Accept. One turn folds.',
    turns: [
      {
        id: 'want',
        role: 'you',
        title: '要的体验',
        hint: '不要静默覆盖',
        body: [
          '草稿 / 暂存区 → 人工看 Diff → 二次 Prompt 打磨 → 满意才合入。',
          'Not silent overwrite. Pending stays pending until you Accept.',
        ],
      },
      {
        id: 'a',
        role: 'playbook',
        title: '方法 A · Agent + Diff',
        hint: 'Cmd+I · 原生最爽',
        body: [
          '不要用 Inline Chat (Cmd+K) 直接改文件。开 Composer / Agent（Cmd+I）。',
          '跑完一段逻辑后文件不会静默覆盖。编辑器进 Diff View（绿增红删）。',
          'Accept 之前可以继续对着眼前 Diff 追问：把 unwrap 改成 map_err、缓存换成 DashMap。它在 Pending 里原地打磨。',
          '肉眼扫完再 Accept All（或 Cmd+Enter）。',
        ],
      },
      {
        id: 'b',
        role: 'playbook',
        title: '方法 B · 右侧暂存',
        hint: 'Split + scratchpad',
        body: [
          '不想动真源文件：落地到 .scratchpad/xxx.draft 或 .draft.rs。',
          '左右分屏：左边真源，右边底稿。在右侧用 Cmd+K 局部打磨。',
          '改利索了再把代码块挑进主文件。Cursorules 可写一条：草稿先写 scratchpad。',
        ],
      },
      {
        id: 'c',
        role: 'playbook',
        title: '方法 C · 外部工具',
        hint: '你原文在这里停住',
        body: [
          '想在 Cursor 外面玩审阅：用任何带 Diff + 评论的工具（GitHub PR、Origin、独立 review app）。',
          '同一手感：先看绿增红删，再追问，最后合入。这里不绑死某一个产品。',
        ],
      },
    ],
  },
  {
    id: 'rpc',
    title: 'RPC 握手 · 毫秒再拉',
    subtitle: 'One getMultipleAccounts, then memory. Honest about what is not live.',
    turns: [
      {
        id: 'handshake',
        role: 'playbook',
        title: 'Dashboard 握手',
        hint: 'GET /mpp/status',
        body: [
          '浏览器不打公开 Devnet RPC。一次 getMultipleAccounts([钱包, USDC ATA]) 拿 SOL+USDC。',
          '实测握手 ~213ms；20s 内存命中 0.003ms / HTTP 2.84ms。顶栏 DEVNET · CACHE。',
        ],
      },
      {
        id: 'helius',
        role: 'playbook',
        title: 'Agent Helius 热路径',
        hint: 'moka + single-flight + HTTP/2',
        body: [
          'ks-helius：moka TTL（getBalance / getMultipleAccounts = 5s）。命中零 RTT。',
          'DashMap + Shared<Future>：50 个并发同一 CacheKey 只 fire 一次。',
          'reqwest HTTP/2 池，避免每次 miss 再付 20–60ms TLS。',
        ],
      },
      {
        id: 'honest',
        role: 'playbook',
        title: '还没开的',
        hint: '不要写成已上线',
        body: [
          'helius.redb 磁盘层是 Phase 2，热路径现在只写内存。',
          'Yellowstone / LaserStream 还在 Python 技能库，没进 Rust 热路径。',
          '状态条不走 ks-helius，走 /mpp/status 自己的 dict。手法一样：少往返。',
        ],
      },
    ],
  },
];
