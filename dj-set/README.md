# DJ Set Scaffold

还不知道最终成品也没关系——这是一个可继续扩展的 DJ Set 起点。

## 当前内容

- Set: **Aileena DJ Set 001**
- Track #1: **Daydreaming** — Harry Styles
- Spotify: https://open.spotify.com/track/69w5X6uTrOaWM32IetSzvO?si=26d210d801a14b63

## 文件

```text
dj-set/
├── index.html                 # 展示页（封面 + 元数据 + Spotify embed）
├── setlist.json               # 曲目与 set 元数据（主数据源）
└── assets/
    ├── set-cover.png          # DJ set 封面
    └── daydreaming-cover.jpg  # 曲目封面（Spotify 专辑图）
```

## 本地预览

```bash
cd dj-set
python3 -m http.server 8088
```

打开：http://localhost:8088

## 加下一首歌

编辑 `setlist.json`，在 `tracks` 数组追加：

```json
{
  "position": 2,
  "title": "Song Title",
  "artist": "Artist",
  "album": "Album",
  "year": 2026,
  "duration": "3:30",
  "duration_ms": 210000,
  "bpm": 124,
  "key": "Am",
  "energy": 0.7,
  "spotify": {
    "id": "TRACK_ID",
    "url": "https://open.spotify.com/track/TRACK_ID",
    "embed": "https://open.spotify.com/embed/track/TRACK_ID?utm_source=generator"
  },
  "cover": "assets/your-cover.jpg",
  "notes": "Transition notes"
}
```

## 你可能还想要的（你说“你知道的”）

- [ ] 完整 Spotify Playlist 链接（`links.spotify_set_playlist`）
- [ ] Mix 导出（SoundCloud / Mixcloud）
- [ ] 过渡点（cue in / cue out）
- [ ] 实际 BPM/Key 校准（当前为草稿值）
