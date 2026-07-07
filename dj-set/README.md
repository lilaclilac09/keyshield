# DJ Set Carousel

DJ set 曲目轮播（carousel），数据来自 `setlist.json`。

## Tracks

1. Daydreaming — Harry Styles (Spotify)
2. Rainforest — John Beltran / Open House (`Now & Then`)
3. High Tide — John Beltran / Open House (`Now & Then`)
4. In Touch Feat. Jinnal & Kaba — Beatrice M. (`Sinking — Plate 3`)
5. Rendezvous (Original Mix) — Spotify track

## Covers

- `assets/covers/daydreaming.jpg` — Spotify
- `assets/covers/now-and-then.jpg` — John Beltran / Open House `Now & Then` (Clone)
- `assets/covers/sinking-plate-3.jpg` — Beatrice M. `Sinking` (Plate 3)
- `assets/covers/rendezvous.jpg` — Spotify

## Preview

```bash
cd dj-set
python3 -m http.server 8088
```

Open http://localhost:8088

## Add track

Edit `setlist.json` → add to `tracks[]` with `cover`, `spotify` or `links`.
