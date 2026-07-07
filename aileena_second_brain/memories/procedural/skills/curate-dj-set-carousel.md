---
date: 2026-07-07
type: skill
tags: [dj-set, carousel, music, search]
confidence: high
decay_speed: slow
source: dj_set_curation
agent_id: coordinator
team_task_id: dj_set_music_taste_001
---

# Skill: Curate DJ Set Carousel

## Trigger

用户说“把歌放到 dj set carousel”，并提供 Spotify 链接或“去搜某专辑某曲”。

## Prompt Template

```text
更新 DJ set carousel：
1) 用户链接曲目：原样写入 setlist.json（spotify.url/embed/id）
2) 用户搜索曲目：先找发行页（Bleep/Beatport/Bandcamp/Spotify），再写入 setlist.json
3) 封面必须使用对应发行封面（专辑/单曲），不可错图
4) 同步写入记忆：
   - memories/personal/music-taste.md
   - memories/semantic/dj-set-tracks.md
5) 运行 prepare_training_data.py 生成 music.jsonl 切片
```

## Tools Needed

- `dj-set/setlist.json`
- `dj-set/index.html`（standalone 预览）
- `src/web/` → 侧边栏 **DJ Set**（carousel 已接入 dashboard）
- `aileena_second_brain/prepare_training_data.py`

## Success Criteria

- carousel 可见全部曲目
- 每曲有 cover + 链接/发行页
- 记忆库有对应 taste/track 记录
- `training_data/music.jsonl` 已更新
